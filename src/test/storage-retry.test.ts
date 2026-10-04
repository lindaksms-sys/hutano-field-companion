import { describe, expect, it, vi } from "vitest";
import { withStorageRetry } from "@/domain/db";

describe("storage open retry", () => {
  it("retries once after a transient failure and returns the result", async () => {
    const fn = vi.fn().mockRejectedValueOnce(Object.assign(new Error("Internal error."), { name: "UnknownError" })).mockResolvedValue(["r1"]);
    await expect(withStorageRetry(fn, 1)).resolves.toEqual(["r1"]);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("surfaces a persistent failure after one retry (no deletion attempted)", async () => {
    const del = vi.fn();
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("Internal error."), { name: "UnknownError" }));
    await expect(withStorageRetry(fn, 1)).rejects.toThrow("Internal error.");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(del).not.toHaveBeenCalled();
  });
});
