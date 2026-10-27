import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/db-server", () => ({
  resolveServerDb: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { resolveServerDb } from "@/lib/db-server";
import { requireAdmin } from "./admin-auth";

describe("requireAdmin", () => {
  it("rejects non-admin", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", role: "user", status: "active" },
      expires: "",
    } as never);
    const r = await requireAdmin();
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("accepts admin with db", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "a1", role: "admin", status: "active" },
      expires: "",
    } as never);
    vi.mocked(resolveServerDb).mockResolvedValue({
      prepare: () => ({}),
    } as never);
    const r = await requireAdmin();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ctx.actorId).toBe("a1");
  });
});
