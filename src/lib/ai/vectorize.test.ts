import { describe, expect, it, vi } from "vitest";
import {
  deletePageVectors,
  toNumberArray,
  upsertPageVector,
  VECTOR_DIMS,
} from "@/lib/ai/vectorize";

describe("vectorize helpers", () => {
  it("toNumberArray copies Float32Array", () => {
    const f = new Float32Array([1, 2, 3]);
    expect(toNumberArray(f)).toEqual([1, 2, 3]);
  });

  it("upsertPageVector rejects wrong dims", async () => {
    const upsert = vi.fn();
    await expect(
      upsertPageVector(
        { upsert, query: vi.fn(), deleteByIds: vi.fn(), getByIds: vi.fn() },
        "anon_1",
        "page_1",
        [0.1, 0.2],
      ),
    ).rejects.toThrow(/dims/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upsertPageVector writes namespace + metadata", async () => {
    const upsert = vi.fn(async () => ({ mutationId: "m1" }));
    const values = Array.from({ length: VECTOR_DIMS }, (_, i) => i * 0.001);
    await upsertPageVector(
      { upsert, query: vi.fn(), deleteByIds: vi.fn(), getByIds: vi.fn() },
      "user_1",
      "page_1",
      values,
    );
    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "page_1",
        namespace: "user_1",
        metadata: { subjectId: "user_1", pageId: "page_1" },
      }),
    ]);
  });

  it("deletePageVectors no-ops on empty", async () => {
    const deleteByIds = vi.fn();
    await deletePageVectors(
      { upsert: vi.fn(), query: vi.fn(), deleteByIds, getByIds: vi.fn() },
      [],
    );
    expect(deleteByIds).not.toHaveBeenCalled();
  });
});
