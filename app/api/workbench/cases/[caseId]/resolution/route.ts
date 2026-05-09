import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { resolveWorkbenchCase } from "@/src/lib/workbenchData";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

async function parseJson(request: Request): Promise<unknown> {
  return request.json();
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = await parseJson(request);
    const { caseId } = await context.params;

    return NextResponse.json(await resolveWorkbenchCase(caseId, body));
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Invalid resolution." }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unable to apply resolution.";
    const status = message === "Case not found." ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}
