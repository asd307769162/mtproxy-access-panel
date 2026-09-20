import { findToken, getDatabase, getServerForToken, publicToken, type AccessTokenRecord } from "@/lib/db";
import { listInbounds, setInboundEnabled } from "@/lib/xui";

type PublicIp = { ip: string; location?: string; firstSeen?: string; lastSeen?: string; online?: boolean; connections?: number; scanner?: boolean };

export async function refreshToken(record: AccessTokenRecord, options: { includeIps?: boolean } = {}) {
  const includeIps = options.includeIps ?? true;
  if (!record.inbound_id || !record.proxy_port) return { ...publicToken(record), ips: [] as PublicIp[] };
  const proxyPort = record.proxy_port;
  try {
    const server = getServerForToken(record);
    if (!server) throw new Error("找不到X-UI服务器配置");
    const { inbounds } = await listInbounds(server);
    const inbound = inbounds.find((item) => item.id === record.inbound_id || item.port === record.proxy_port);
    if (inbound) {
      const used = Number(inbound.up || 0) + Number(inbound.down || 0);
      let status = record.status;
      const expired = Boolean(record.expires_at && record.expires_at <= Date.now());
      const exhausted = used >= record.quota_bytes;
      if (expired) status = "expired";
      else if (exhausted) status = "exhausted";
      if ((expired || exhausted) && inbound.enable) await setInboundEnabled(server, inbound.id, false);
      getDatabase().prepare("UPDATE access_tokens SET used_bytes=?,status=? WHERE id=?").run(used, status, record.id);
      record = findToken(record.token)!;
    }
  } catch {
    // A temporary X-UI failure must not erase the last valid customer state.
  }
  return { ...publicToken(record), ips: includeIps ? await readControllerIps(record.server_alias || "", proxyPort) : [] };
}

async function readControllerIps(alias: string, port: number) {
  const base = process.env.CONTROLLER_PORT_IPS_URL || "http://127.0.0.1:8787/api/xui/port-ips";
  const url = new URL(base);
  url.searchParams.set("alias", alias);
  url.searchParams.set("port", String(port));
  const username = process.env.CONTROLLER_USERNAME || "";
  const password = process.env.CONTROLLER_PASSWORD || "";
  try {
    const response = await fetch(url, {
      headers: username ? { authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` } : {},
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const data = await response.json() as { ips?: PublicIp[] };
    const cutoff = Date.now() - 86400000;
    return (data.ips || []).filter((item) => !item.scanner && item.lastSeen && Date.parse(item.lastSeen) >= cutoff);
  } catch { return []; }
}
