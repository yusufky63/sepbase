import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { keccak256, toBytes, toFunctionSelector, zeroAddress } from "viem";
import {
  parseV3SuiteManifest,
  verifyV3SuiteReleaseId,
  V3_SUITE_MODULE_KEYS,
  type V3SuiteManifest,
  type V3SuiteModuleKey,
} from "../packages/sdk/src/v3-manifest";
import { isMainModule } from "./lib/is-main";

const EXPECTED_VERSION = "3.0.0";
const EXPECTED_CONFIGURE_SUITE_SIGNATURE =
  "configureSuite(address,address,address,address)";
const EXPECTED_CONFIGURE_SUITE_SELECTOR = "0x3d229c48";
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

export const V3_ARTIFACT_MODULES = {
  registry: {
    contract: "ChainNameRegistryV3",
    source: "contracts/src/v3/ChainNameRegistryV3.sol",
  },
  controller: {
    contract: "ChainNameControllerV3",
    source: "contracts/src/v3/ChainNameControllerV3.sol",
  },
  resolver: {
    contract: "ChainNameResolverV3",
    source: "contracts/src/v3/ChainNameResolverV3.sol",
  },
  universalResolver: {
    contract: "ChainNameUniversalResolverV3",
    source: "contracts/src/v3/ChainNameUniversalResolverV3.sol",
  },
  marketplace: {
    contract: "ChainNameMarketplaceV3",
    source: "contracts/src/v3/ChainNameMarketplaceV3.sol",
  },
  marketLens: {
    contract: "ChainNameMarketLensV3",
    source: "contracts/src/v3/ChainNameMarketLensV3.sol",
  },
  migration: {
    contract: "ChainNameMigrationV3",
    source: "contracts/src/v3/ChainNameMigrationV3.sol",
  },
} as const satisfies Record<
  V3SuiteModuleKey,
  { contract: string; source: string }
>;

export type V3ArtifactReadFile = (path: string) => Promise<Uint8Array>;

export type ValidateV3ArtifactsOptions = {
  root?: string;
  readFile?: V3ArtifactReadFile;
};

export type V3ArtifactValidationReport = {
  releaseStatus: V3SuiteManifest["releaseStatus"];
  suiteReleaseId: V3SuiteManifest["suiteReleaseId"];
  fixtureSha256: string;
  moduleAbiSha256: Record<V3SuiteModuleKey, string>;
};

type AbiParameter = { type?: unknown };
type AbiEntry = {
  type?: unknown;
  name?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  stateMutability?: unknown;
};

function fail(message: string): never {
  throw new Error(`V3 artifact validation failed: ${message}`);
}

function bytesToText(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("utf8");
}

function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(bytesToText(bytes)) as unknown;
  } catch {
    fail(`${label} is not valid JSON.`);
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function assertExactModuleKeys(rawManifest: unknown) {
  const manifest = objectValue(rawManifest, "deployment-manifest.v3.json");
  const contracts = objectValue(manifest.contracts, "manifest.contracts");
  const actual = Object.keys(contracts).sort();
  const expected = [...V3_SUITE_MODULE_KEYS].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    fail(
      `manifest.contracts must contain exactly these seven keys: ${V3_SUITE_MODULE_KEYS.join(", ")}.`,
    );
  }
}

function assertCandidateOrLiveEvidence(manifest: V3SuiteManifest) {
  if (manifest.releaseStatus === "draft") return;

  for (const key of V3_SUITE_MODULE_KEYS) {
    const module = manifest.contracts[key];
    if (module.address === null || module.address.toLowerCase() === zeroAddress) {
      fail(`${manifest.releaseStatus} manifest has no non-zero ${key} address.`);
    }
    if (
      module.runtimeCodeHash === null
      || module.runtimeCodeHash.toLowerCase() === ZERO_BYTES32
    ) {
      fail(`${manifest.releaseStatus} manifest has no non-zero ${key} runtime code hash.`);
    }
  }

  const receiptHashes = manifest.deployment.transactionHashes.map((hash) =>
    hash.toLowerCase()
  );
  if (
    receiptHashes.length < 8
    || receiptHashes.some((hash) => hash === ZERO_BYTES32)
    || new Set(receiptHashes).size !== receiptHashes.length
  ) {
    fail(
      `${manifest.releaseStatus} manifest requires at least eight distinct non-zero deployment/configuration receipt hashes.`,
    );
  }
  if (
    manifest.deployment.blockNumber === null
    || manifest.deployment.deployedAt === null
    || manifest.deployment.owner === null
    || manifest.deployment.owner.toLowerCase() === zeroAddress
    || manifest.deployment.treasury === null
    || manifest.deployment.treasury.toLowerCase() === zeroAddress
    || manifest.normalization.attestor === null
    || manifest.normalization.attestor.toLowerCase() === zeroAddress
  ) {
    fail(`${manifest.releaseStatus} manifest contains null or zero deployment identity.`);
  }
  if (!manifest.wiring.suiteConfigured) {
    fail(`${manifest.releaseStatus} manifest must publish locked suite wiring.`);
  }
}

function abiEntries(abi: unknown, label: string): AbiEntry[] {
  if (!Array.isArray(abi)) fail(`${label} does not contain an ABI array.`);
  return abi as AbiEntry[];
}

function parameterTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((parameter) => {
    if (
      typeof parameter !== "object"
      || parameter === null
      || typeof (parameter as AbiParameter).type !== "string"
    ) {
      fail("ABI contains a parameter without a canonical type.");
    }
    return (parameter as { type: string }).type;
  });
}

function assertVersionDeclaration(
  source: string,
  abi: AbiEntry[],
  contract: string,
  manifestVersion: string,
) {
  const versions = Array.from(
    source.matchAll(
      /string\s+public\s+constant\s+VERSION\s*=\s*"([^"]+)"\s*;/g,
    ),
    (match) => match[1],
  );
  if (
    versions.length !== 1
    || versions[0] !== EXPECTED_VERSION
    || manifestVersion !== EXPECTED_VERSION
  ) {
    fail(`${contract} must declare exactly one public VERSION = "${EXPECTED_VERSION}".`);
  }

  const versionFunctions = abi.filter(
    (entry) => entry.type === "function" && entry.name === "VERSION",
  );
  if (versionFunctions.length !== 1) {
    fail(`${contract} artifact ABI must expose exactly one VERSION() function.`);
  }
  const versionFunction = versionFunctions[0];
  if (
    parameterTypes(versionFunction?.inputs).length !== 0
    || parameterTypes(versionFunction?.outputs).join(",") !== "string"
    || !["pure", "view"].includes(String(versionFunction?.stateMutability))
  ) {
    fail(`${contract} artifact VERSION ABI is not VERSION() view returns (string).`);
  }
}

function assertConfigureSuite(registryAbi: AbiEntry[], manifest: V3SuiteManifest) {
  const functions = registryAbi.filter(
    (entry) => entry.type === "function" && entry.name === "configureSuite",
  );
  if (functions.length !== 1) {
    fail("Registry ABI must expose exactly one configureSuite function.");
  }
  const signature = `configureSuite(${parameterTypes(functions[0]?.inputs).join(",")})`;
  const selector = toFunctionSelector(signature);
  if (
    signature !== EXPECTED_CONFIGURE_SUITE_SIGNATURE
    || selector !== EXPECTED_CONFIGURE_SUITE_SELECTOR
    || manifest.wiring.configureSuiteSelector !== EXPECTED_CONFIGURE_SUITE_SELECTOR
  ) {
    fail(
      `configureSuite must remain ${EXPECTED_CONFIGURE_SUITE_SIGNATURE} / ${EXPECTED_CONFIGURE_SUITE_SELECTOR}.`,
    );
  }
}

function assertImmutableAddressGetter(
  source: string,
  abi: AbiEntry[],
  contract: string,
  getter: string,
) {
  const immutableDeclaration = new RegExp(
    `\\bpublic\\s+immutable\\s+${getter}\\s*;`,
    "g",
  );
  if (Array.from(source.matchAll(immutableDeclaration)).length !== 1) {
    fail(`${contract}.${getter} must have exactly one public immutable declaration.`);
  }
  const getters = abi.filter(
    (entry) => entry.type === "function" && entry.name === getter,
  );
  if (
    getters.length !== 1
    || parameterTypes(getters[0]?.inputs).length !== 0
    || parameterTypes(getters[0]?.outputs).join(",") !== "address"
    || getters[0]?.stateMutability !== "view"
  ) {
    fail(`${contract}.${getter} ABI must be an immutable address getter.`);
  }
}

function assertImmutableTrustAndHelperBindings(
  sources: Partial<Record<V3SuiteModuleKey, string>>,
  abis: Partial<Record<V3SuiteModuleKey, AbiEntry[]>>,
) {
  const controllerSource = sources.controller;
  const controllerAbi = abis.controller;
  const universalResolverSource = sources.universalResolver;
  const universalResolverAbi = abis.universalResolver;
  const marketLensSource = sources.marketLens;
  const marketLensAbi = abis.marketLens;
  if (
    !controllerSource
    || !controllerAbi
    || !universalResolverSource
    || !universalResolverAbi
    || !marketLensSource
    || !marketLensAbi
  ) {
    fail("Controller and helper binding artifacts were not all validated.");
  }

  assertImmutableAddressGetter(
    controllerSource,
    controllerAbi,
    "ChainNameControllerV3",
    "normalizationAttestor",
  );
  const attestorMutators = controllerAbi.filter(
    (entry) => entry.type === "function"
      && typeof entry.name === "string"
      && /^(set|update|change|rotate).*attestor/i.test(entry.name),
  );
  if (attestorMutators.length > 0) {
    fail("ChainNameControllerV3 ABI must not expose an attestor rotation path.");
  }

  assertImmutableAddressGetter(
    universalResolverSource,
    universalResolverAbi,
    "ChainNameUniversalResolverV3",
    "registry",
  );
  assertImmutableAddressGetter(
    marketLensSource,
    marketLensAbi,
    "ChainNameMarketLensV3",
    "marketplace",
  );
  assertImmutableAddressGetter(
    marketLensSource,
    marketLensAbi,
    "ChainNameMarketLensV3",
    "registry",
  );
}

function normalizationProfile(value: unknown) {
  const fixture = objectValue(value, "name-normalization fixture");
  const profile = objectValue(fixture.profile, "name-normalization fixture profile");
  if (
    typeof profile.profileIdentifier !== "string"
    || typeof profile.profileHash !== "string"
  ) {
    fail("Normalization fixture profile identifier/hash are missing.");
  }
  return {
    profileIdentifier: profile.profileIdentifier,
    profileHash: profile.profileHash.toLowerCase(),
  };
}

export async function validateV3Artifacts(
  options: ValidateV3ArtifactsOptions = {},
): Promise<V3ArtifactValidationReport> {
  const root = resolve(options.root ?? process.cwd());
  const readBytes: V3ArtifactReadFile = options.readFile
    ?? (async (path) => readFile(path));
  const manifestPath = resolve(
    root,
    "apps/web/public/deployment-manifest.v3.json",
  );
  const manifestBytes = await readBytes(manifestPath);
  const rawManifest = parseJson(manifestBytes, "deployment-manifest.v3.json");
  assertExactModuleKeys(rawManifest);
  const manifest = parseV3SuiteManifest(rawManifest);
  await verifyV3SuiteReleaseId(manifest);
  assertCandidateOrLiveEvidence(manifest);

  const fixturePath = resolve(root, "fixtures/name-normalization.json");
  const fixtureBytes = await readBytes(fixturePath);
  const fixtureSha256 = sha256(fixtureBytes);
  if (fixtureSha256 !== manifest.normalization.fixtureSha256) {
    fail("Normalization fixture byte SHA-256 differs from the manifest.");
  }
  const fixtureProfile = normalizationProfile(
    parseJson(fixtureBytes, "name-normalization fixture"),
  );
  if (
    fixtureProfile.profileIdentifier !== manifest.normalization.profileId
    || fixtureProfile.profileHash !== manifest.normalization.profileHash.toLowerCase()
    || keccak256(toBytes(fixtureProfile.profileIdentifier)).toLowerCase()
      !== fixtureProfile.profileHash
  ) {
    fail("Normalization fixture identifier/profile hash differs from the manifest.");
  }

  const moduleAbiSha256 = {} as Record<V3SuiteModuleKey, string>;
  const moduleAbis: Partial<Record<V3SuiteModuleKey, AbiEntry[]>> = {};
  const moduleSources: Partial<Record<V3SuiteModuleKey, string>> = {};
  let registryAbi: AbiEntry[] | undefined;
  for (const key of V3_SUITE_MODULE_KEYS) {
    const definition = V3_ARTIFACT_MODULES[key];
    const module = manifest.contracts[key];
    const expectedAbiUrl = `/abi/v3/${definition.contract}.json`;
    if (module.abiUrl !== expectedAbiUrl) {
      fail(`${key} ABI URL must be ${expectedAbiUrl}.`);
    }

    const publicAbiPath = resolve(
      root,
      `apps/web/public/abi/v3/${definition.contract}.json`,
    );
    const publicAbiBytes = await readBytes(publicAbiPath);
    const publicAbiSha256 = sha256(publicAbiBytes);
    if (publicAbiSha256 !== module.abiSha256) {
      fail(`${key} public ABI byte SHA-256 differs from the manifest.`);
    }

    const artifactPath = resolve(
      root,
      `contracts/out/${definition.contract}.sol/${definition.contract}.json`,
    );
    const artifact = objectValue(
      parseJson(await readBytes(artifactPath), `${definition.contract} artifact`),
      `${definition.contract} artifact`,
    );
    const artifactAbi = abiEntries(
      artifact.abi,
      `${definition.contract} artifact`,
    );
    const compactArtifactAbi = JSON.stringify(artifactAbi);
    if (
      bytesToText(publicAbiBytes) !== compactArtifactAbi
      || sha256(compactArtifactAbi) !== module.abiSha256
    ) {
      fail(`${key} public ABI is not the exact compact Foundry artifact ABI.`);
    }

    const source = bytesToText(
      await readBytes(resolve(root, definition.source)),
    );
    assertVersionDeclaration(
      source,
      artifactAbi,
      definition.contract,
      module.version,
    );
    moduleAbis[key] = artifactAbi;
    moduleSources[key] = source;
    moduleAbiSha256[key] = publicAbiSha256;
    if (key === "registry") registryAbi = artifactAbi;
  }

  if (!registryAbi) fail("Registry artifact ABI was not validated.");
  assertConfigureSuite(registryAbi, manifest);
  assertImmutableTrustAndHelperBindings(moduleSources, moduleAbis);

  return {
    releaseStatus: manifest.releaseStatus,
    suiteReleaseId: manifest.suiteReleaseId,
    fixtureSha256,
    moduleAbiSha256,
  };
}

if (isMainModule(import.meta.url)) {
  const report = await validateV3Artifacts();
  console.log(
    `Validated ${report.releaseStatus} v3 artifacts: ${V3_SUITE_MODULE_KEYS.length} modules, ${report.suiteReleaseId}, fixture ${report.fixtureSha256}.`,
  );
}
