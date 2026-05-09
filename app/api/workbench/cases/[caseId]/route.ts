import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { updateWorkbenchCase } from "@/src/lib/workbenchData";

type RouteContext = {
  params: Promise<{ caseId: string }>;
};

async function parseJson(request: Request): Promise<unknown> {
  return request.json();
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const body = await parseJson(request);
    const { caseId } = await context.params;

    return NextResponse.json(await updateWorkbenchCase(caseId, body));
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Invalid case update." }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unable to update case.";
    const status = message === "Case not found." ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}
