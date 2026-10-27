export type UserRole = "user" | "admin";
export type UserStatus = "active" | "banned";

export function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(
  email: string | null | undefined,
  adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS),
): boolean {
  if (!email) return false;
  return adminEmails.has(email.trim().toLowerCase());
}
