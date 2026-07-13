import { describe, expect, it } from "vitest";
import { booleanQuery, GET } from "./route";

describe("V3 account route", () => {
  it("accepts only canonical boolean query values", () => {
    expect(booleanQuery(null, "includeTerminal")).toBe(false);
    expect(booleanQuery("false", "includeTerminal")).toBe(false);
    expect(booleanQuery("true", "includeTerminal")).toBe(true);
    expect(() => booleanQuery("banana", "includeTerminal")).toThrow(/true or false/);
  });

  it("fails closed before parsing account input while the suite is a draft", async () => {
    const response = await GET(
      new Request("http://localhost/api/v3/account/not-an-address"),
      { params: Promise.resolve({ address: "not-an-address" }) },
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "V3_NOT_DEPLOYED" } });
  });
});
