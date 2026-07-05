import { describe, it, expect } from "vitest";
import { eventKey } from "../src/id.js";

describe("eventKey", () => {
  it("對同一名稱穩定、8 碼十六進位", () => {
    const k = eventKey("2025-07 游泳");
    expect(k).toMatch(/^[0-9a-f]{8}$/);
    expect(eventKey("2025-07 游泳")).toBe(k);
  });
  it("不同名稱得到不同 key", () => {
    expect(eventKey("2025-07 游泳")).not.toBe(eventKey("2025-07 生日"));
  });
});
