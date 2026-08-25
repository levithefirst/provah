import { Pool } from "pg";

let pool: Pool | undefined;

export function db(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  }
  return pool;
}
