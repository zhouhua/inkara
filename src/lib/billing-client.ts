/** Ensure anonymous billing subject cookie exists before ask. */
export async function ensureAnonSubject(): Promise<string | null> {
  try {
    const res = await fetch("/api/billing/anon", { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as { subjectId?: string };
    return typeof data.subjectId === "string" ? data.subjectId : null;
  } catch {
    return null;
  }
}
