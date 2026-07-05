import { describe, it, expect, vi } from "vitest";
import { QuotaExceededError } from "../src/clients.js";
import { mapInsertError } from "../src/google-clients.js";

describe("mapInsertError", () => {
  it("quotaExceeded / uploadLimitExceeded → QuotaExceededError", () => {
    const e1 = { errors: [{ reason: "quotaExceeded" }] };
    const e2 = { response: { data: { error: { errors: [{ reason: "uploadLimitExceeded" }] } } } };
    expect(mapInsertError(e1)).toBeInstanceOf(QuotaExceededError);
    expect(mapInsertError(e2)).toBeInstanceOf(QuotaExceededError);
  });
  it("其他錯誤原樣回傳", () => {
    const e = new Error("boom");
    expect(mapInsertError(e)).toBe(e);
  });
});
