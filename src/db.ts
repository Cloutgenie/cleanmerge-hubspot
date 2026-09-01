import { Pool } from "pg";

export function createPool(databaseUrl: string): Pool {
  const isUnencryptedInternal = databaseUrl.includes("localhost") || databaseUrl.includes(".railway.internal");
  return new Pool({ connectionString: databaseUrl, ssl: isUnencryptedInternal ? false : { rejectUnauthorized: false } });
}
