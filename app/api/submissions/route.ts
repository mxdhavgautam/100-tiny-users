import { NextResponse } from "next/server";
import { createSubmission, readSubmissions } from "@/src/lib/storage";

export async function GET() {
  return NextResponse.json({ submissions: await readSubmissions() });
}

async function parseBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const raw = await request.text();
    return raw.length > 0 ? JSON.parse(raw) : {};
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  }
  return {};
}

export async function POST(request: Request) {
  const body = await parseBody(request);
  const result = await createSubmission(body);
  return NextResponse.json(result, { status: result.ok ? 201 : 409 });
}
