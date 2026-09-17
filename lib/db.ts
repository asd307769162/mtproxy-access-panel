import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

let database: DatabaseSync | undefined;

export type AccessTokenRecord = {
  id: number;
  token: string;
  plan_days: number;
  quota_bytes: number;
  status: "available" | "provisioning" | "active" | "paused" | "expired" | "exhausted" | "revoked";
  created_at: number;
  activated_at: number | null;
  expires_at: number | null;
  server_alias: string | null;
  server_ip: string | null;
  inbound_id: number | null;
  proxy_port: number | null;
  used_bytes: number;
  last_error: string | null;
};

export function getDatabase() {
  if (database) return database;
  const file = process.env.DATABASE_PATH || join(process.cwd(), ".data", "mtproxy-panel.db");
  mkdirSync(dirname(file), { recursive: true });
  database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS access_tokens (
      id INTEGER PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      plan_days INTEGER NOT NULL DEFAULT 30,
      quota_bytes INTEGER NOT NULL DEFAULT 214748364800,
      status TEXT NOT NULL DEFAULT 'available',
      created_at INTEGER NOT NULL,
      activated_at INTEGER,
      expires_at INTEGER,
      server_alias TEXT,
      server_ip TEXT,
      inbound_id INTEGER,
      proxy_port INTEGER UNIQUE,
      used_bytes INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      CHECK (status IN ('available','provisioning','active','paused','expired','exhausted','revoked'))
    );
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY,
      token_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      success INTEGER NOT NULL,
      message TEXT,
      remote_ip TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(token_id) REFERENCES access_tokens(id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_access_tokens_status ON access_tokens(status);
    CREATE INDEX IF NOT EXISTS idx_operation_logs_token_created ON operation_logs(token_id, created_at DESC);
  `);
  return database;
}

export function findToken(token: string) {
  return getDatabase().prepare("SELECT * FROM access_tokens WHERE token = ?").get(token) as AccessTokenRecord | undefined;
}

export function publicToken(record: AccessTokenRecord) {
  return {
    status: record.status,
    planDays: record.plan_days,
    quotaBytes: record.quota_bytes,
    usedBytes: record.used_bytes,
    activatedAt: record.activated_at,
    expiresAt: record.expires_at,
    serverIp: record.server_ip,
    proxyPort: record.proxy_port,
    secret: ["active", "paused", "expired", "exhausted"].includes(record.status) ? getSetting("mtproxy_secret") : "",
  };
}

export function getSetting(key: string) {
  const row = getDatabase().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value || "";
}

export function setSetting(key: string, value: string) {
  getDatabase().prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
    .run(key, value, Date.now());
}

export function logOperation(tokenId: number, action: string, success: boolean, message: string, remoteIp = "") {
  getDatabase().prepare("INSERT INTO operation_logs(token_id,action,success,message,remote_ip,created_at) VALUES(?,?,?,?,?,?)")
    .run(tokenId, action, success ? 1 : 0, message.slice(0, 500), remoteIp.slice(0, 80), Date.now());
}
