import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { password = "" } = await request.json() as { password?: string };
  const expected = process.env.ADMIN_PASSWORD || "";
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "管理员密码错误" }, { status: 401 });
  }
  await createAdminSession();
  return NextResponse.json({ success: true });
}
