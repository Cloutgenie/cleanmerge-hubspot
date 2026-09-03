/** A read-only handle onto a customer's warehouse/data lake. Implementations execute exactly the SQL they're given — no parameter substitution, no query building. */
export interface WarehouseConnector {
  runQuery(sql: string): Promise<Record<string, unknown>[]>;
}
