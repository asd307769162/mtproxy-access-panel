import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { getDatabase } from "@/lib/db";

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
