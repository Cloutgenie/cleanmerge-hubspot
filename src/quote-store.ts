import crypto from "node:crypto";
import type { Pool } from "pg";
import { createPool } from "./db.js";

export interface QuoteRequestInput {
  name: string;
  email: string;
  company: string;
  hubspotPortalId?: string;
  warehouse: string;
  objects: string[];
  rowVolume: string;
  frequency: string;
  connections: number;
  timeline: string;
  notes?: string;
}

export interface QuoteRequest extends QuoteRequestInput {
  id: string;
  createdAt: string;
}

export interface QuoteStore {
  initialize(): Promise<void>;
  create(input: QuoteRequestInput): Promise<QuoteRequest>;
  list(limit: number): Promise<QuoteRequest[]>;
}

interface QuoteRow {
  id: string;
  created_at: string;
  name: string;
  email: string;
  company: string;
  hubspot_portal_id: string | null;
  warehouse: string;
  objects: string[];
  row_volume: string;
  frequency: string;
  connections: number;
  timeline: string;
  notes: string | null;
}

function fromRow(row: QuoteRow): QuoteRequest {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    name: row.name,
    email: row.email,
    company: row.company,
    hubspotPortalId: row.hubspot_portal_id ?? undefined,
    warehouse: row.warehouse,
    objects: row.objects,
    rowVolume: row.row_volume,
    frequency: row.frequency,
    connections: row.connections,
    timeline: row.timeline,
    notes: row.notes ?? undefined,
  };
}

export class PostgresQuoteStore implements QuoteStore {
  private readonly pool: Pool;
  constructor(databaseUrl: string) {
    this.pool = createPool(databaseUrl);
  }
  async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS quote_requests (
      id UUID PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT NOT NULL,
      hubspot_portal_id TEXT,
      warehouse TEXT NOT NULL,
      objects TEXT[] NOT NULL,
      row_volume TEXT NOT NULL,
      frequency TEXT NOT NULL,
      connections INTEGER NOT NULL,
      timeline TEXT NOT NULL,
      notes TEXT
    )`);
  }
  async create(input: QuoteRequestInput): Promise<QuoteRequest> {
    const id = crypto.randomUUID();
    const result = await this.pool.query<QuoteRow>(
      `INSERT INTO quote_requests (id, name, email, company, hubspot_portal_id, warehouse, objects, row_volume, frequency, connections, timeline, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id, input.name, input.email, input.company, input.hubspotPortalId ?? null, input.warehouse, input.objects, input.rowVolume, input.frequency, input.connections, input.timeline, input.notes ?? null],
    );
    return fromRow(result.rows[0]!);
  }
  async list(limit: number): Promise<QuoteRequest[]> {
    const result = await this.pool.query<QuoteRow>("SELECT * FROM quote_requests ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows.map(fromRow);
  }
}

export class MemoryQuoteStore implements QuoteStore {
  private readonly items: QuoteRequest[] = [];
  async initialize(): Promise<void> {}
  async create(input: QuoteRequestInput): Promise<QuoteRequest> {
    const item: QuoteRequest = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.items.push(item);
    return item;
  }
  async list(limit: number): Promise<QuoteRequest[]> {
    return [...this.items].reverse().slice(0, limit);
  }
}
