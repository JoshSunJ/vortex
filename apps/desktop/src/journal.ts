import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Operation } from "@vortex/contracts";

/** Local only. Never contains model/provider keys, article text or cloud credentials. */
export class Journal {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    for (const row of this.db.prepare("SELECT key,value FROM kv WHERE key LIKE 'operation:%'").all()) {
      const value = JSON.parse(String(row.value));
      if (value.operation.status === "running" || value.operation.status === "queued") {
        const operation: Operation = value.operation;
        operation.status = "partial";
        operation.updatedAt = new Date().toISOString();
        operation.results = operation.results.map(r => r.status === "running" ? { ...r, status: "unknown" } : r.status === "pending" ? { ...r, status: "skipped" } : r);
        this.set(String(row.key), value);
      }
    }
  }
  get<T>(key: string): T | undefined {
    const row = this.db.prepare("SELECT value FROM kv WHERE key=?").get(key);
    return row ? JSON.parse(String(row.value)) as T : undefined;
  }
  set(key: string, value: unknown) {
    this.db.prepare("INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value));
  }
  list<T>(prefix: string): T[] {
    return this.db.prepare("SELECT value FROM kv WHERE substr(key,1,?)=? ORDER BY key").all(prefix.length, prefix).map(row => JSON.parse(String(row.value)) as T);
  }
  id(key: string): string {
    let value = this.get<string>(key);
    if (!value) { value = randomUUID(); this.set(key, value); }
    return value;
  }
  close() { this.db.close(); }
}
