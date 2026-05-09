import { NextResponse } from "next/server";
import { readWorkbenchSnapshot } from "@/src/lib/workbenchData";

export async function GET() {
  return NextResponse.json(await readWorkbenchSnapshot());
}
