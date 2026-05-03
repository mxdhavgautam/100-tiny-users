import { NextResponse } from "next/server";
import { readLatestPrompt } from "@/src/lib/reportReader";

export async function GET() {
  const prompt = await readLatestPrompt();
  return new NextResponse(prompt ?? "No Codex patch prompt has been generated yet.", {
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}
