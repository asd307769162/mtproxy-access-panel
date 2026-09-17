import { NextRequest, NextResponse } from "next/server";
import { findToken, publicToken } from "@/lib/db";
import { refreshToken } from "@/lib/sync";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { token } = await request.json() as { token?: string };
  const value = token?.trim() || "";
  if (value.length < 16 || value.length > 160) return NextResponse.json({ error: "Token无效" }, { status: 400 });
  const record = findToken(value);
  if (!record) return NextResponse.json({ error: "Token无效" }, { status: 404 });
  return NextResponse.json(await refreshToken(record));
}
