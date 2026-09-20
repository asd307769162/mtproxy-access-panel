import { NextRequest, NextResponse } from "next/server";
import { findToken, getDatabase, getServerForToken, logOperation } from "@/lib/db";
import { setInboundEnabled } from "@/lib/xui";
import { refreshToken } from "@/lib/sync";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { token, enabled } = await request.json() as { token?: string; enabled?: boolean };
  const record = findToken(token?.trim() || "");
  if (!record || typeof enabled !== "boolean") return NextResponse.json({ error: "请求无效" }, { status: 400 });
  if (!record.inbound_id) return NextResponse.json({ error: "代理尚未启用" }, { status: 409 });
  if (record.expires_at && record.expires_at <= Date.now()) return NextResponse.json({ error: "代理已经到期" }, { status: 409 });
  if (record.used_bytes >= record.quota_bytes) return NextResponse.json({ error: "套餐流量已经用完" }, { status: 409 });
  if (enabled && record.status !== "paused") return NextResponse.json({ error: "当前状态不能恢复" }, { status: 409 });
  if (!enabled && record.status !== "active") return NextResponse.json({ error: "当前状态不能暂停" }, { status: 409 });
  try {
    const server = getServerForToken(record);
    if (!server) throw new Error("找不到该Token对应的X-UI服务器");
    await setInboundEnabled(server, record.inbound_id, enabled);
    getDatabase().prepare("UPDATE access_tokens SET status=? WHERE id=?").run(enabled ? "active" : "paused", record.id);
    logOperation(record.id, enabled ? "resume" : "pause", true, enabled ? "用户恢复代理" : "用户暂停代理", request.headers.get("x-forwarded-for") || "");
    return NextResponse.json(await refreshToken(findToken(record.token)!));
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    logOperation(record.id, enabled ? "resume" : "pause", false, message, request.headers.get("x-forwarded-for") || "");
    return NextResponse.json({ error: "X-UI操作失败，请稍后重试" }, { status: 502 });
  }
}
