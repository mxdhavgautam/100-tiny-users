import { NextResponse } from "next/server";
import { resetSubmissions } from "@/src/lib/storage";

export async function POST() {
  await resetSubmissions();
  return NextResponse.json({ ok: true });
}
