import { NextResponse } from "next/server";
import { resetWorkbenchStore } from "@/src/lib/workbenchData";

export async function POST() {
  return NextResponse.json(await resetWorkbenchStore());
}
