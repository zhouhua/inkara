/**
 * Apply migrations/mysql/*.sql that are not yet in schema_migrations.
 * Run from the standalone app directory on ECS, with DATABASE_URL set.
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log("DATABASE_URL unset, skip migrations");
  process.exit(0);
}

const dir = path.join(process.cwd(), "migrations", "mysql");
const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const conn = await mysql.createConnection({
  uri: url,
  multipleStatements: true,
});

try {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(128) PRIMARY KEY,
      applied_at VARCHAR(40) NOT NULL
    )`,
  );
  const [rows] = await conn.query("SELECT id FROM schema_migrations");
  const applied = new Set(
    rows.map((row) => /** @type {{ id: string }} */ (row).id),
  );

  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    if (applied.has(id)) {
      console.log(`skip ${id}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await conn.query(sql);
    console.log(`applied ${id}`);
  }
} finally {
  await conn.end();
}
