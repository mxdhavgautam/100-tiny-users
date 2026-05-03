import { NextResponse } from "next/server";
import { readLatestReport } from "@/src/lib/reportReader";

export async function GET() {
  const report = await readLatestReport();
  return NextResponse.json(report ?? { ok: false, message: "No report exists yet." });
}
