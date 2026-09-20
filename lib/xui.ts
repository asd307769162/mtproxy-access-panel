import type { XuiServerRecord } from "@/lib/db";

export type XuiInbound = {
  id: number; up: number; down: number; total: number; remark: string; enable: boolean;
  expiryTime: number; autoreset?: boolean; ipalert?: boolean; iplimit?: number;
  listen: string; port: number; protocol: string; settings: string; streamSettings: string; sniffing: string;
};

function baseUrl(server: XuiServerRecord) {
  return server.base_url.replace(/\/$/, "");
}

async function loginCookie(server: XuiServerRecord) {
  const body = new URLSearchParams({ username: server.username, password: server.password });
  const response = await fetch(`${baseUrl(server)}/login`, { method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(10000) });
  const cookie = response.headers.getSetCookie().map((item) => item.split(";", 1)[0]).join("; ");
  if (!response.ok || !cookie) throw new Error(`${server.alias} X-UI登录失败`);
  return cookie;
}

async function post(server: XuiServerRecord, path: string, cookie: string, body?: URLSearchParams) {
  const response = await fetch(`${baseUrl(server)}${path}`, {
    method: "POST",
    headers: { cookie, ...(body ? { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" } : {}) },
    body,
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json() as { success: boolean; msg?: string; obj?: unknown };
  if (!response.ok || !result.success) throw new Error(result.msg || `${server.alias} X-UI请求失败：${path}`);
  return result.obj;
}

export async function listInbounds(server: XuiServerRecord) {
  const cookie = await loginCookie(server);
  return { cookie, inbounds: await post(server, "/xui/inbound/list", cookie) as XuiInbound[] };
}

export async function testXuiServer(server: XuiServerRecord) {
  const { inbounds } = await listInbounds(server);
  return { inboundCount: inbounds.length };
}

export async function createInbound(server: XuiServerRecord, port: number, expiresAt: number, quotaBytes: number) {
  const { cookie, inbounds } = await listInbounds(server);
  if (inbounds.some((item) => item.port === port)) throw new Error("随机端口已被X-UI占用");
  const body = new URLSearchParams({
    up: "0", down: "0", total: String(quotaBytes), remark: `mtp-${port}`, enable: "true",
    expiryTime: String(expiresAt), autoreset: "false", ipalert: "true", iplimit: "2", listen: "",
    port: String(port), protocol: "dokodemo-door",
    settings: JSON.stringify({ address: server.target_address, port: server.target_port, network: "tcp" }),
    streamSettings: JSON.stringify({ network: "tcp", security: "none", tcpSettings: { header: { type: "none" }, acceptProxyProtocol: false } }),
    sniffing: "{}",
  });
  await post(server, "/xui/inbound/add", cookie, body);
  const created = (await post(server, "/xui/inbound/list", cookie) as XuiInbound[]).find((item) => item.port === port);
  if (!created) throw new Error("X-UI已返回成功，但没有找到新建端口");
  if (Number(created.iplimit ?? 0) !== 2) throw new Error("新端口已创建，但设备限制没有设置为2");
  return created;
}

export async function setInboundEnabled(server: XuiServerRecord, inboundId: number, enabled: boolean) {
  const { cookie, inbounds } = await listInbounds(server);
  const inbound = inbounds.find((item) => item.id === inboundId);
  if (!inbound) throw new Error(`${server.alias} X-UI中找不到该端口`);
  const body = new URLSearchParams({
    up: String(inbound.up), down: String(inbound.down), total: String(inbound.total), remark: inbound.remark,
    enable: String(enabled), expiryTime: String(inbound.expiryTime), autoreset: String(Boolean(inbound.autoreset)),
    ipalert: String(Boolean(inbound.ipalert)), iplimit: "2", listen: inbound.listen || "", port: String(inbound.port),
    protocol: inbound.protocol, settings: inbound.settings, streamSettings: inbound.streamSettings, sniffing: inbound.sniffing || "{}",
  });
  await post(server, `/xui/inbound/update/${inbound.id}`, cookie, body);
}
