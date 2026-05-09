import { chromium } from "@playwright/test";
import { NextResponse } from "next/server";
import { semanticMiniUserAdapter } from "@/src/harnesses/semanticMiniUser";
import type { UserExecutionRequest } from "@/src/harnesses/types";

function chromiumExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  return undefined;
}

export async function POST(request: Request) {
  const payload = await request.json() as UserExecutionRequest;
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutable() });

  try {
    const result = await semanticMiniUserAdapter.execute({
      ...payload,
      browser
    });
    return NextResponse.json(result);
  } finally {
    await browser.close();
  }
}
