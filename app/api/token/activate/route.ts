import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { findToken, getDatabase, getSetting, logOperation } from "@/lib/db";
import { createV2Inbound, listV2Inbounds } from "@/lib/xui-v2";
import { refreshToken } from "@/lib/sync";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { token } = await request.json() as { token?: string };
  const value = token?.trim() || "";
  const record = findToken(value);
  if (!record) return NextResponse.json({ error: "Token无效" }, { status: 404 });
  if (record.status !== "available") return NextResponse.json(await refreshToken(record));
  if (!getSetting("mtproxy_secret")) {
    return NextResponse.json({ error: "管理员尚未配置 MTProxy 密钥，请稍后再试" }, { status: 503 });
  }

  const db = getDatabase();
  const claimed = db.prepare("UPDATE access_tokens SET status='provisioning',last_error=NULL WHERE id=? AND status='available'").run(record.id);
  if (claimed.changes !== 1) return NextResponse.json({ error: "Token正在处理中，请稍后重试" }, { status: 409 });

  try {
    const { inbounds } = await listV2Inbounds();
    const used = new Set(inbounds.map((item) => item.port));
    const min = Number(process.env.XUI_PORT_MIN || 10000);
    const max = Number(process.env.XUI_PORT_MAX || 60000);
    let port = 0;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const candidate = randomInt(min, max + 1);
      const local = db.prepare("SELECT 1 FROM access_tokens WHERE proxy_port=?").get(candidate);
      if (!used.has(candidate) && !local) { port = candidate; break; }
    }
    if (!port) throw new Error("暂时找不到可用端口");
    const now = Date.now();
    const expiresAt = now + record.plan_days * 86400000;
    const inbound = await createV2Inbound(port, expiresAt, record.quota_bytes);
    db.prepare(`UPDATE access_tokens SET status='active',activated_at=?,expires_at=?,server_alias='v2',server_ip=?,inbound_id=?,proxy_port=?,used_bytes=0,last_error=NULL WHERE id=?`)
      .run(now, expiresAt, process.env.XUI_V2_PUBLIC_IP || "103.15.91.249", inbound.id, port, record.id);
    logOperation(record.id, "activate", true, `V2端口${port}创建成功，设备限制2`, request.headers.get("x-forwarded-for") || "");
    return NextResponse.json(await refreshToken(findToken(value)!));
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建代理失败";
    db.prepare("UPDATE access_tokens SET status='available',last_error=? WHERE id=? AND status='provisioning'").run(message, record.id);
    logOperation(record.id, "activate", false, message, request.headers.get("x-forwarded-for") || "");
    return NextResponse.json({ error: "代理创建失败，Token没有被消耗，请稍后重试" }, { status: 502 });
  }
}
