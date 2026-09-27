import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

let database: DatabaseSync | undefined;

export type AccessTokenRecord = {
  id: number;
  token: string;
  plan_days: number;
  plan_months: number;
  quota_bytes: number;
  status: "available" | "provisioning" | "active" | "paused" | "expired" | "exhausted" | "revoked";
  created_at: number;
  activated_at: number | null;
  expires_at: number | null;
  server_alias: string | null;
  server_id: number | null;
  server_ip: string | null;
  inbound_id: number | null;
  proxy_port: number | null;
  used_bytes: number;
  last_error: string | null;
};

export type XuiServerRecord = {
  id: number;
  alias: string;
  base_url: string;
  username: string;
  password: string;
  public_ip: string;
  target_address: string;
  target_port: number;
  mtproxy_secret: string;
  enabled: number;
  sort_order: number;
  last_assigned_at: number;
  created_at: number;
  updated_at: number;
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
      plan_months INTEGER NOT NULL DEFAULT 1,
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
    CREATE TABLE IF NOT EXISTS xui_servers (
      id INTEGER PRIMARY KEY,
      alias TEXT NOT NULL UNIQUE,
      base_url TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      public_ip TEXT NOT NULL,
      target_address TEXT NOT NULL,
      target_port INTEGER NOT NULL DEFAULT 443,
      mtproxy_secret TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      last_assigned_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_access_tokens_status ON access_tokens(status);
    CREATE INDEX IF NOT EXISTS idx_operation_logs_token_created ON operation_logs(token_id, created_at DESC);
  `);
  const tokenColumns = database.prepare("PRAGMA table_info(access_tokens)").all() as { name: string }[];
  if (!tokenColumns.some((column) => column.name === "server_id")) {
    database.exec("ALTER TABLE access_tokens ADD COLUMN server_id INTEGER");
  }
  if (!tokenColumns.some((column) => column.name === "plan_months")) {
    database.exec("ALTER TABLE access_tokens ADD COLUMN plan_months INTEGER NOT NULL DEFAULT 1");
  }
  const serverColumns = database.prepare("PRAGMA table_info(xui_servers)").all() as { name: string }[];
  if (!serverColumns.some((column) => column.name === "sort_order")) {
    database.exec("ALTER TABLE xui_servers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    const servers = database.prepare("SELECT id FROM xui_servers ORDER BY id ASC").all() as { id: number }[];
    const updateOrder = database.prepare("UPDATE xui_servers SET sort_order=? WHERE id=?");
    servers.forEach((server, index) => updateOrder.run(index, server.id));
  }
  const allocationCursor = database.prepare("SELECT value FROM settings WHERE key='allocation_cursor_server_id'").get() as { value: string } | undefined;
  if (!allocationCursor) {
    const lastAssigned = database.prepare("SELECT id FROM xui_servers WHERE last_assigned_at>0 ORDER BY last_assigned_at DESC,id DESC LIMIT 1").get() as { id: number } | undefined;
    if (lastAssigned) {
      database.prepare("INSERT INTO settings(key,value,updated_at) VALUES('allocation_cursor_server_id',?,?)").run(String(lastAssigned.id), Date.now());
    }
  }
  seedLegacyV2(database);
  return database;
}

function seedLegacyV2(db: DatabaseSync) {
  const count = (db.prepare("SELECT COUNT(*) AS count FROM xui_servers").get() as { count: number }).count;
  if (count > 0 || !process.env.XUI_V2_BASE_URL || !process.env.XUI_V2_USERNAME || !process.env.XUI_V2_PASSWORD) return;
  const now = Date.now();
  const secret = (db.prepare("SELECT value FROM settings WHERE key='mtproxy_secret'").get() as { value: string } | undefined)?.value || "";
  db.prepare(`INSERT INTO xui_servers(alias,base_url,username,password,public_ip,target_address,target_port,mtproxy_secret,enabled,sort_order,last_assigned_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,1,0,0,?,?)`).run(
    "v2", process.env.XUI_V2_BASE_URL.replace(/\/$/, ""), process.env.XUI_V2_USERNAME, process.env.XUI_V2_PASSWORD,
    process.env.XUI_V2_PUBLIC_IP || "103.15.91.249", process.env.XUI_V2_TARGET_ADDRESS || "103.15.91.249",
    Number(process.env.XUI_V2_TARGET_PORT || 443), secret, now, now,
  );
  const server = db.prepare("SELECT id FROM xui_servers WHERE alias='v2'").get() as { id: number };
  db.prepare("UPDATE access_tokens SET server_id=? WHERE server_alias='v2' AND server_id IS NULL").run(server.id);
}

export function findToken(token: string) {
  return getDatabase().prepare("SELECT * FROM access_tokens WHERE token = ?").get(token) as AccessTokenRecord | undefined;
}

export function publicToken(record: AccessTokenRecord) {
  return {
    status: record.status,
    planDays: record.plan_days,
    planMonths: record.plan_months,
    quotaBytes: record.quota_bytes,
    usedBytes: record.used_bytes,
    activatedAt: record.activated_at,
    expiresAt: record.expires_at,
    serverIp: record.server_ip,
    proxyPort: record.proxy_port,
    secret: ["active", "paused", "expired", "exhausted"].includes(record.status) ? getServerForToken(record)?.mtproxy_secret || "" : "",
  };
}

export function listXuiServers() {
  return getDatabase().prepare("SELECT * FROM xui_servers ORDER BY sort_order ASC,id ASC").all() as XuiServerRecord[];
}

export function getXuiServer(id: number) {
  return getDatabase().prepare("SELECT * FROM xui_servers WHERE id=?").get(id) as XuiServerRecord | undefined;
}

export function getServerForToken(record: AccessTokenRecord) {
  if (record.server_id) return getXuiServer(record.server_id);
  if (record.server_alias) return getDatabase().prepare("SELECT * FROM xui_servers WHERE alias=?").get(record.server_alias) as XuiServerRecord | undefined;
}

export function selectServerForAllocation() {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const servers = db.prepare("SELECT * FROM xui_servers WHERE enabled=1 AND mtproxy_secret<>'' ORDER BY sort_order ASC,id ASC").all() as XuiServerRecord[];
    const cursor = db.prepare("SELECT value FROM settings WHERE key='allocation_cursor_server_id'").get() as { value: string } | undefined;
    const cursorIndex = cursor ? servers.findIndex((server) => server.id === Number(cursor.value)) : -1;
    const server = servers.length > 0 ? servers[(cursorIndex + 1) % servers.length] : undefined;
    if (server) {
      const now = Date.now();
      db.prepare("UPDATE xui_servers SET last_assigned_at=?,updated_at=? WHERE id=?").run(now, now, server.id);
      db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES('allocation_cursor_server_id',?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).run(String(server.id), now);
    }
    db.exec("COMMIT");
    return server;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function moveXuiServer(id: number, direction: "up" | "down") {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const servers = db.prepare("SELECT id FROM xui_servers ORDER BY sort_order ASC,id ASC").all() as { id: number }[];
    const index = servers.findIndex((server) => server.id === id);
    if (index < 0) throw new Error("服务器不存在");
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= servers.length) {
      db.exec("COMMIT");
      return listXuiServers();
    }
    const update = db.prepare("UPDATE xui_servers SET sort_order=?,updated_at=? WHERE id=?");
    const now = Date.now();
    servers.forEach((server, order) => update.run(order, now, server.id));
    update.run(targetIndex, now, servers[index].id);
    update.run(index, now, servers[targetIndex].id);
    db.exec("COMMIT");
    return listXuiServers();
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function logOperation(tokenId: number, action: string, success: boolean, message: string, remoteIp = "") {
  getDatabase().prepare("INSERT INTO operation_logs(token_id,action,success,message,remote_ip,created_at) VALUES(?,?,?,?,?,?)")
    .run(tokenId, action, success ? 1 : 0, message.slice(0, 500), remoteIp.slice(0, 80), Date.now());
}
