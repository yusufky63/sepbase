import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { agentIntegrationManifestSchema } from "../apps/web/lib/agent-manifest.schema";
import { deploymentManifestSchema } from "../apps/web/lib/deployment-manifest.schema";
import {
  parseV3SuiteManifest,
  V3_SUITE_MODULE_KEYS,
} from "../packages/sdk/src/v3-manifest";

type Expectation = "draft" | "candidate" | "live";

const rawOrigin = process.env.HOSTED_RELEASE_ORIGIN;
if (!rawOrigin) throw new Error("HOSTED_RELEASE_ORIGIN is required.");
const originUrl = new URL(rawOrigin);
if (originUrl.username || originUrl.password || originUrl.search || originUrl.hash) {
  throw new Error("HOSTED_RELEASE_ORIGIN must be a credential-free origin URL.");
}
if (originUrl.pathname !== "/") throw new Error("HOSTED_RELEASE_ORIGIN must not contain a path.");
if (originUrl.protocol !== "https:") {
  throw new Error("HOSTED_RELEASE_ORIGIN must use HTTPS.");
}
const origin = originUrl.origin;
const expectation = (process.env.HOSTED_RELEASE_EXPECTATION ?? "live") as Expectation;
if (expectation !== "draft" && expectation !== "candidate" && expectation !== "live") {
  throw new Error("HOSTED_RELEASE_EXPECTATION must be draft, candidate or live.");
}

const bypassSecret = process.env.HOSTED_RELEASE_BYPASS_SECRET?.trim();
const baseHeaders: Record<string, string> = bypassSecret
  ? {
      "x-vercel-protection-bypass": bypassSecret,
      "x-vercel-set-bypass-cookie": "true",
    }
  : {};

function sameOriginUrl(path: string) {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin, `Resource escaped the release origin: ${path}`);
  return url;
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(sameOriginUrl(path), {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    headers: {
      ...baseHeaders,
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
  assert.ok(
    response.status < 300 || response.status >= 400,
    `${path} unexpectedly redirected with ${response.status}.`,
  );
  return response;
}

async function json<T = unknown>(path: string, expectedStatus = 200, init: RequestInit = {}) {
  const response = await request(path, init);
  const body = await response.text();
  assert.equal(response.status, expectedStatus, `${path} returned ${response.status}: ${body.slice(0, 240)}`);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/i, `${path} is not JSON.`);
  return JSON.parse(body) as T;
}

async function text(path: string, expectedStatus = 200) {
  const response = await request(path);
  const body = await response.text();
  assert.equal(response.status, expectedStatus, `${path} returned ${response.status}: ${body.slice(0, 240)}`);
  return { body, response };
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifyAbi(path: string, expectedSha256: string) {
  const response = await request(path);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(response.status, 200, `${path} returned ${response.status}.`);
  assert.equal(sha256(bytes), expectedSha256, `${path} checksum differs from its manifest.`);
  assert.ok(Array.isArray(JSON.parse(new TextDecoder().decode(bytes))), `${path} is not an ABI array.`);
}

async function mcp(
  method: string,
  id: number,
  path: string,
  requestOrigin: "configured-origin" | "no-origin",
) {
  return json<{
    jsonrpc: string;
    id: number;
    result?: { protocolVersion?: string; tools?: Array<{ name: string }> };
    error?: unknown;
  }>(path, 200, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(requestOrigin === "configured-origin" ? { Origin: origin } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: method === "initialize"
        ? {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "sepbase-hosted-release-smoke", version: "1.0.0" },
          }
        : {},
    }),
  });
}

const [deploymentRaw, agentRaw, v3Raw, openApi, llms] = await Promise.all([
  json("/.well-known/chain-name-service.json"),
  json("/.well-known/chain-name-agent.json"),
  json("/api/v3/status"),
  json<{ openapi?: string; servers?: Array<{ url?: string }>; paths?: Record<string, unknown> }>("/api/openapi.json"),
  text("/llms.txt"),
]);
const deployment = deploymentManifestSchema.parse(deploymentRaw);
const agent = agentIntegrationManifestSchema.parse(agentRaw);
const v3StatusEnvelope = v3Raw as {
  data?: {
    schemaVersion?: unknown;
    suiteReleaseId?: unknown;
    releaseStatus?: unknown;
    chainId?: unknown;
    contracts?: unknown;
  };
};
assert.ok(v3StatusEnvelope.data && typeof v3StatusEnvelope.data === "object", "V3 status data is missing.");
const v3 = parseV3SuiteManifest(await json(agent.discovery.v3TargetManifest));
assert.equal(v3StatusEnvelope.data.schemaVersion, v3.schemaVersion, "V3 status schema version drifted.");
assert.equal(v3StatusEnvelope.data.suiteReleaseId, v3.suiteReleaseId, "V3 status suite release ID drifted.");
assert.equal(v3StatusEnvelope.data.releaseStatus, v3.releaseStatus, "V3 status release state drifted.");
assert.equal(v3StatusEnvelope.data.chainId, v3.chainId, "V3 status chain ID drifted.");
assert.deepEqual(v3StatusEnvelope.data.contracts, v3.contracts, "V3 status contract inventory drifted.");

assert.equal(new URL(deployment.metadataBaseURI).origin, origin, "V2 metadataBaseURI is not on the final origin.");
assert.equal(new URL(v3.metadataBaseURI).origin, origin, "V3 metadataBaseURI is not on the final origin.");
assert.equal(v3.releaseStatus, expectation, `V3 release status is not ${expectation}.`);
assert.equal(openApi.openapi, "3.1.0", "OpenAPI version is stale.");
assert.equal(openApi.servers?.[0]?.url, origin, "OpenAPI server URL is not the final origin.");
for (const path of [
  "/api/mcp",
  "/api/v3/mcp",
  "/api/v3/status",
  "/api/v3/market",
  "/api/x402/registration/quote",
  "/api/x402/registration",
  "/api/x402/registration/status",
]) {
  assert.ok(openApi.paths?.[path], `OpenAPI is missing ${path}.`);
  assert.ok(llms.body.includes(path), `llms.txt is missing ${path}.`);
}

assert.ok(deployment.abiUrl, "V2 manifest ABI URL is missing.");
assert.ok(deployment.abiSha256, "V2 manifest ABI checksum is missing.");
await verifyAbi(deployment.abiUrl, deployment.abiSha256);
await Promise.all(V3_SUITE_MODULE_KEYS.map((key) => {
  const module = v3.contracts[key];
  return verifyAbi(module.abiUrl, module.abiSha256);
}));

const pageResults = await Promise.all(["/", "/me", "/market", "/developers"].map(async (path) => {
  const page = await text(path);
  assert.doesNotMatch(page.body, /The interface could not finish this request/i, `${path} rendered the error boundary.`);
  return path;
}));

const [initialize, currentTools, v3Tools, v3BrowserTools] = await Promise.all([
  mcp("initialize", 1, agent.mcp.endpoint, "configured-origin"),
  mcp("tools/list", 2, agent.mcp.endpoint, "no-origin"),
  mcp("tools/list", 3, agent.discovery.v3Mcp, "no-origin"),
  mcp("tools/list", 4, agent.discovery.v3Mcp, "configured-origin"),
]);
assert.equal(initialize.result?.protocolVersion, "2025-11-25", "MCP protocol negotiation drifted.");
assert.deepEqual(
  currentTools.result?.tools?.map((tool) => tool.name),
  agent.mcp.tools,
  "Hosted V2 MCP tool inventory differs from discovery.",
);
assert.equal(v3Tools.result?.tools?.length, 39, "Hosted V3 MCP must expose exactly 39 tools.");
assert.deepEqual(
  v3BrowserTools.result?.tools?.map((tool) => tool.name),
  v3Tools.result?.tools?.map((tool) => tool.name),
  "Hosted V3 MCP browser-origin and origin-less server-client inventories differ.",
);

const smokeRecipient = "0x2222222222222222222222222222222222222222";
const smokeLabel = `smoke-${Date.now().toString(36)}`;
const quotePath = `/api/x402/registration/quote?label=${smokeLabel}&durationYears=1&recipient=${smokeRecipient}`;
await json(quotePath, 200);
if (expectation !== "live") {
  const x402Response = await request(agent.x402.resourceEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: "{}",
  });
  const body = await x402Response.json() as { error?: { code?: string } };
  assert.equal(x402Response.status, 503, `${expectation} paid x402 route must remain fail-closed.`);
  assert.equal(body.error?.code, "X402_PAID_EXECUTION_AWAITING_V3");
  const status = await json<{ error?: { code?: string } }>(
    `/api/x402/registration/status?paymentIdentifier=pay_${"1".repeat(16)}&planId=sha256:${"2".repeat(64)}`,
    503,
  );
  assert.equal(status.error?.code, "X402_PAID_EXECUTION_AWAITING_V3");
  assert.equal(agent.x402.paidExecutionAvailable, false);
  assert.equal(v3.x402.paidExecutionAvailable, false);
  if (expectation === "draft") {
    const market = await json<{ error?: { code?: string } }>("/api/v3/market", 503);
    assert.equal(market.error?.code, "V3_NOT_DEPLOYED");
  } else {
    await json("/api/v3/market", 200);
    for (const key of V3_SUITE_MODULE_KEYS) {
      assert.notEqual(v3.contracts[key].address, null, `Candidate V3 ${key} address is null.`);
      assert.notEqual(v3.contracts[key].runtimeCodeHash, null, `Candidate V3 ${key} runtime hash is null.`);
    }
  }
} else {
  const preparedResponse = await request(agent.x402.quoteEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      label: smokeLabel,
      recipient: smokeRecipient,
      durationYears: 1,
      referrer: null,
      initialization: { addressRecord: smokeRecipient, textRecords: [] },
    }),
  });
  assert.equal(preparedResponse.status, 200, "Live paid x402 quote must prepare an encrypted V3 plan.");
  const prepared = await preparedResponse.json() as {
    data?: { signedQuote?: unknown; quoteId?: string; planId?: string };
  };
  assert.match(prepared.data?.quoteId ?? "", /^sha256:[a-f0-9]{64}$/);
  assert.match(prepared.data?.planId ?? "", /^sha256:[a-f0-9]{64}$/);
  assert.ok(prepared.data?.signedQuote, "Live paid x402 quote did not return its authenticated quote.");
  const x402Response = await request(agent.x402.resourceEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      signedQuote: prepared.data.signedQuote,
      quoteId: prepared.data.quoteId,
      planId: prepared.data.planId,
    }),
  });
  assert.equal(x402Response.status, 402, "Live paid x402 route must negotiate with HTTP 402 when payment is absent.");
  assert.ok(x402Response.headers.get("payment-required"), "Live paid x402 402 response is missing PAYMENT-REQUIRED.");
  const missingOrder = await json<{ error?: { code?: string } }>(
    `/api/x402/registration/status?paymentIdentifier=pay_${"1".repeat(16)}&planId=sha256:${"2".repeat(64)}`,
    404,
  );
  assert.equal(missingOrder.error?.code, "REGISTRATION_ORDER_NOT_FOUND");
  assert.equal(agent.x402.paidExecutionAvailable, true);
  assert.equal(v3.x402.paidExecutionAvailable, true);
  await json("/api/v3/market", 200);
  for (const key of V3_SUITE_MODULE_KEYS) {
    assert.notEqual(v3.contracts[key].address, null, `Live V3 ${key} address is null.`);
    assert.notEqual(v3.contracts[key].runtimeCodeHash, null, `Live V3 ${key} runtime hash is null.`);
  }
}

console.log(
  `Hosted ${expectation} release smoke passed at ${origin}: ${pageResults.length} pages, ${V3_SUITE_MODULE_KEYS.length + 1} ABIs, ${currentTools.result?.tools?.length ?? 0}+${v3Tools.result?.tools?.length ?? 0} MCP tools.`,
);
