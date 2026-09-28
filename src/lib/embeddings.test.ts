import { describe, expect, it, vi } from "vitest";
import {
  HF_REMOTE_HOST_DEFAULT,
  HF_REMOTE_HOST_MIRROR,
  cosineSimilarity,
  resolveHfRemoteHost,
} from "@/lib/embeddings";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors and 0 for empty", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([], [1])).toBe(0);
  });
});

describe("resolveHfRemoteHost", () => {
  it("honors NEXT_PUBLIC_HF_REMOTE_HOST override", async () => {
    vi.stubEnv("NEXT_PUBLIC_HF_REMOTE_HOST", "https://custom.example/");
    const host = await resolveHfRemoteHost(async () => {
      throw new Error("should not fetch");
    });
    expect(host).toBe("https://custom.example/");
    vi.unstubAllEnvs();
  });

  it("falls back to mirror when candidates fail", async () => {
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_HF_REMOTE_HOST;
    const host = await resolveHfRemoteHost(async () => {
      throw new Error("network");
    });
    expect(host).toBe(HF_REMOTE_HOST_MIRROR);
    expect(HF_REMOTE_HOST_DEFAULT).toContain("huggingface");
  });
});
