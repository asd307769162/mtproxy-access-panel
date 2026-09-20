import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { getDatabase, type AccessTokenRecord } from "@/lib/db";
import { listV2Inbounds, setV2InboundEnabled } from "@/lib/xui-v2";

export const runtime = "nodejs";
const GIB = 1024 ** 3;

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const records = getDatabase().prepare("SELECT * FROM access_tokens ORDER BY id DESC LIMIT 500").all();
  return NextResponse.json(records);
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { count = 1, days = 30, quotaGb = 200 } = await request.json() as { count?: number; days?: number; quotaGb?: number };
  if (!Number.isInteger(count) || count < 1 || count > 500) return NextResponse.json({ error: "每次只能生成1到500个Token" }, { status: 400 });
  if (!Number.isInteger(days) || days < 1 || days > 3650) return NextResponse.json({ error: "套餐天数无效" }, { status: 400 });
  if (!Number.isFinite(quotaGb) || quotaGb <= 0) return NextResponse.json({ error: "套餐流量无效" }, { status: 400 });
  const db = getDatabase();
  const insert = db.prepare("INSERT INTO access_tokens(token,plan_days,quota_bytes,status,created_at) VALUES(?,?,?,'available',?)");
  const tokens: string[] = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    for (let i = 0; i < count; i += 1) {
      const token = `MTP-${randomBytes(18).toString("base64url")}`;
      insert.run(token, days, Math.round(quotaGb * GIB), Date.now());
      tokens.push(token);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return NextResponse.json({ tokens });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await request.json() as { id?: number };
  if (!Number.isInteger(id) || Number(id) < 1) return NextResponse.json({ error: "Token编号无效" }, { status: 400 });

  const db = getDatabase();
  const record = db.prepare("SELECT * FROM access_tokens WHERE id=?").get(id!) as AccessTokenRecord | undefined;
  if (!record) return NextResponse.json({ error: "Token不存在或已删除" }, { status: 404 });
  if (record.status === "provisioning") return NextResponse.json({ error: "端口正在创建中，请稍后再删除" }, { status: 409 });

  const claimed = db.prepare("UPDATE access_tokens SET status='revoked' WHERE id=? AND status=?").run(record.id, record.status);
  if (claimed.changes !== 1) return NextResponse.json({ error: "Token状态已变化，请刷新后重试" }, { status: 409 });

  try {
    if (record.inbound_id) {
      await setV2InboundEnabled(record.inbound_id, false);
      const { inbounds } = await listV2Inbounds();
      const inbound = inbounds.find((item) => item.id === record.inbound_id);
      if (!inbound || inbound.enable) throw new Error("V2端口关闭结果未确认");
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM operation_logs WHERE token_id=?").run(record.id);
      db.prepare("DELETE FROM access_tokens WHERE id=?").run(record.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return NextResponse.json({ success: true, portClosed: Boolean(record.inbound_id), port: record.proxy_port });
  } catch (error) {
    db.prepare("UPDATE access_tokens SET status=?,last_error=? WHERE id=? AND status='revoked'")
      .run(record.status, error instanceof Error ? error.message : "删除失败", record.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败，Token已保留" }, { status: 502 });
  }
}
