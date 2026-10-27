import { auth } from "@/lib/auth";
import { resolveServerDb, type D1Database } from "@/lib/db-server";

export type AdminContext = {
  actorId: string;
  db: D1Database;
};

export async function requireAdmin(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; status: number; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (session.user.role !== "admin") {
    return { ok: false, status: 403, error: "forbidden" };
  }
  if (session.user.status === "banned") {
    return { ok: false, status: 403, error: "banned" };
  }
  const db = await resolveServerDb();
  if (!db) {
    return { ok: false, status: 503, error: "db_unavailable" };
  }
  return { ok: true, ctx: { actorId: session.user.id, db } };
}
