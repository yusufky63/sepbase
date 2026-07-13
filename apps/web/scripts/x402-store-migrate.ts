import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

const VERSION = "001_x402_cas";
const migrationPath = fileURLToPath(new URL("../lib/x402/cas/001_x402_cas.sql", import.meta.url));

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim() ?? "";
  if (!/^postgres(?:ql)?:\/\//.test(connectionString)) {
    throw new Error("DATABASE_URL must be provided to apply the paid-x402 CAS schema.");
  }
  const sql = await readFile(migrationPath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      "sepbase:x402:schema-migration",
    ]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sepbase_x402_schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);
    const existing = await client.query<{ checksum: string }>(
      "SELECT checksum FROM sepbase_x402_schema_migrations WHERE version = $1 FOR UPDATE",
      [VERSION],
    );
    const appliedChecksum = existing.rows[0]?.checksum;
    if (appliedChecksum && appliedChecksum !== checksum) {
      throw new Error(`Applied x402 migration ${VERSION} has a different checksum.`);
    }
    if (!appliedChecksum) {
      await client.query(sql);
      await client.query(
        "INSERT INTO sepbase_x402_schema_migrations (version, checksum) VALUES ($1, $2)",
        [VERSION, checksum],
      );
    }
    await client.query("COMMIT");
    process.stdout.write(appliedChecksum
      ? `x402 CAS migration ${VERSION} already applied.\n`
      : `x402 CAS migration ${VERSION} applied.\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
