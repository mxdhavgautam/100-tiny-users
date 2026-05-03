import { NextResponse } from "next/server";
import { readDemoSession } from "@/src/lib/reportReader";

export async function GET() {
  const session = await readDemoSession();
  return NextResponse.json(session ?? { patchLog: [], updatedAt: new Date(0).toISOString() });
}
