import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { addWorkbenchNote } from "@/src/lib/workbenchData";

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

    return NextResponse.json(await addWorkbenchNote(caseId, body));
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Invalid note." }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unable to save note.";
    const status = message === "Case not found." ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}
