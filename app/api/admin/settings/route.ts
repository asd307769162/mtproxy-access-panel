import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { getSetting, setSetting } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ mtproxySecret: getSetting("mtproxy_secret") });
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { mtproxySecret = "" } = await request.json() as { mtproxySecret?: string };
  const value = mtproxySecret.trim();
  if (!/^[0-9a-fA-F]{32,64}$/.test(value)) return NextResponse.json({ error: "Secret必须是32到64位十六进制字符" }, { status: 400 });
  setSetting("mtproxy_secret", value.toLowerCase());
  return NextResponse.json({ success: true });
}
