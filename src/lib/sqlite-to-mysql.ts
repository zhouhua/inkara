/**
 * Rewrite the D1/SQLite statements this app already issues so they run on MySQL.
 * Covers the dialect actually used in src/lib, not a general translator.
 */
export function translateSqliteToMysql(
  sql: string,
  nowIso: string = new Date().toISOString(),
): string {
  let s = sql.replace(
    /datetime\('now',\s*'-(\d+)\s+days'\)/gi,
    (_m, days: string) => `DATE_SUB('${nowIso}', INTERVAL ${days} DAY)`,
  );
  s = s.replaceAll("datetime('now')", `'${nowIso}'`);
  s = s.replace(/INSERT\s+OR\s+IGNORE\b/gi, "INSERT IGNORE");
  s = s.replace(
    /ON CONFLICT\s*\([^)]*\)\s*DO UPDATE SET\s+count\s*=\s*count\s*\+\s*1\s*WHERE\s+[\w.]+\s*<\s*\?/gi,
    "ON DUPLICATE KEY UPDATE count = IF(count < ?, count + 1, count)",
  );
  s = s.replace(
    /ON CONFLICT\s*\([^)]*\)\s*DO UPDATE SET/gi,
    "ON DUPLICATE KEY UPDATE",
  );
  s = s.replace(/\bexcluded\.(\w+)/gi, "VALUES($1)");
  s = s.replace(
    /DELETE FROM pages WHERE id IN \(\s*SELECT id FROM pages WHERE subject_id = \?\s*ORDER BY created_at ASC LIMIT \?\s*\)/i,
    `DELETE FROM pages WHERE id IN (
       SELECT id FROM (
         SELECT id FROM pages WHERE subject_id = ?
         ORDER BY created_at ASC LIMIT ?
       ) AS inkara_page_drop
     )`,
  );
  return s;
}
