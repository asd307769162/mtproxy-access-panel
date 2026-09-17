import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { refreshToken } from "@/lib/sync";
import type { AccessTokenRecord } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET || "";
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "禁止访问" }, { status: 403 });
  const rows = getDatabase().prepare("SELECT * FROM access_tokens WHERE status IN ('active','paused') ORDER BY id").all() as AccessTokenRecord[];
  let checked = 0;
  for (const row of rows) { await refreshToken(row); checked += 1; }
  return NextResponse.json({ checked });
}
