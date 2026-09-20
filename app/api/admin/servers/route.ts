import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { getDatabase, getXuiServer, listXuiServers, type XuiServerRecord } from "@/lib/db";
import { testXuiServer } from "@/lib/xui";

export const runtime = "nodejs";

type ServerInput = {
  id?: number; alias?: string; baseUrl?: string; username?: string; password?: string; publicIp?: string;
  targetAddress?: string; targetPort?: number; mtproxySecret?: string; enabled?: boolean;
};

function publicServer(server: XuiServerRecord) {
  return {
    id: server.id, alias: server.alias, baseUrl: server.base_url, username: server.username, hasPassword: Boolean(server.password),
    publicIp: server.public_ip, targetAddress: server.target_address, targetPort: server.target_port,
    mtproxySecret: server.mtproxy_secret, enabled: Boolean(server.enabled), updatedAt: server.updated_at,
  };
}

function validate(input: ServerInput, existing?: XuiServerRecord) {
  const alias = input.alias?.trim().toLowerCase() || "";
  const baseUrl = input.baseUrl?.trim().replace(/\/$/, "") || "";
  const username = input.username?.trim() || "";
  const password = input.password || existing?.password || "";
  const publicIp = input.publicIp?.trim() || "";
  const targetAddress = input.targetAddress?.trim() || "";
  const targetPort = Number(input.targetPort);
  const mtproxySecret = input.mtproxySecret?.trim().toLowerCase() || "";
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(alias)) throw new Error("别名只能使用小写字母、数字、下划线或短横线");
  if (!/^https?:\/\/[^\s/]+(?::\d+)?(?:\/[^\s]*)?$/.test(baseUrl)) throw new Error("X-UI地址格式无效");
  if (!username || !password) throw new Error("X-UI账号和密码不能为空");
  if (!publicIp || !targetAddress) throw new Error("公网IP和转发目标地址不能为空");
  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) throw new Error("目标端口无效");
  if (!/^[0-9a-f]{32,64}$/.test(mtproxySecret)) throw new Error("Secret必须是32到64位十六进制字符");
  return { alias, baseUrl, username, password, publicIp, targetAddress, targetPort, mtproxySecret, enabled: input.enabled !== false };
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json(listXuiServers().map(publicServer));
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const value = validate(await request.json() as ServerInput);
    const now = Date.now();
    const result = getDatabase().prepare(`INSERT INTO xui_servers(alias,base_url,username,password,public_ip,target_address,target_port,mtproxy_secret,enabled,last_assigned_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,0,?,?)`).run(value.alias, value.baseUrl, value.username, value.password, value.publicIp, value.targetAddress, value.targetPort, value.mtproxySecret, value.enabled ? 1 : 0, now, now);
    return NextResponse.json(publicServer(getXuiServer(Number(result.lastInsertRowid))!), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return NextResponse.json({ error: message.includes("UNIQUE") ? "服务器别名已经存在" : message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const input = await request.json() as ServerInput;
    const existing = Number.isInteger(input.id) ? getXuiServer(Number(input.id)) : undefined;
    if (!existing) return NextResponse.json({ error: "服务器不存在" }, { status: 404 });
    const value = validate(input, existing);
    getDatabase().prepare(`UPDATE xui_servers SET alias=?,base_url=?,username=?,password=?,public_ip=?,target_address=?,target_port=?,mtproxy_secret=?,enabled=?,updated_at=? WHERE id=?`)
      .run(value.alias, value.baseUrl, value.username, value.password, value.publicIp, value.targetAddress, value.targetPort, value.mtproxySecret, value.enabled ? 1 : 0, Date.now(), existing.id);
    getDatabase().prepare("UPDATE access_tokens SET server_alias=? WHERE server_id=?").run(value.alias, existing.id);
    return NextResponse.json(publicServer(getXuiServer(existing.id)!));
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return NextResponse.json({ error: message.includes("UNIQUE") ? "服务器别名已经存在" : message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await request.json() as { id?: number };
  const server = Number.isInteger(id) ? getXuiServer(Number(id)) : undefined;
  if (!server) return NextResponse.json({ error: "服务器不存在" }, { status: 404 });
  try {
    const result = await testXuiServer(server);
    return NextResponse.json({ success: true, inboundCount: result.inboundCount });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "连接测试失败" }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await request.json() as { id?: number };
  const server = Number.isInteger(id) ? getXuiServer(Number(id)) : undefined;
  if (!server) return NextResponse.json({ error: "服务器不存在" }, { status: 404 });
  const count = (getDatabase().prepare("SELECT COUNT(*) AS count FROM access_tokens WHERE server_id=?").get(server.id) as { count: number }).count;
  if (count > 0) return NextResponse.json({ error: `该服务器仍关联 ${count} 个Token，请停用而不是删除` }, { status: 409 });
  getDatabase().prepare("DELETE FROM xui_servers WHERE id=?").run(server.id);
  return NextResponse.json({ success: true });
}
