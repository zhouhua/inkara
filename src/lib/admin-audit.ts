import type { D1Database } from "@/lib/db-server";

export async function writeAdminAudit(
  db: D1Database,
  input: {
    actorId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    payload?: unknown;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admin_audit_log
         (id, actor_id, action, target_type, target_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      crypto.randomUUID(),
      input.actorId,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.payload == null ? null : JSON.stringify(input.payload),
    )
    .run();
}
