import { NextResponse } from "next/server";
import { getIssues } from "@/lib/linear";
import { getSessionWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionWithOrg();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("q") || undefined;

  try {
    const issues = await getIssues(search);
    return NextResponse.json(issues);
  } catch (error) {
    console.error("Failed to fetch Linear issues:", error);
    return NextResponse.json(
      { error: "Failed to fetch issues" },
      { status: 500 }
    );
  }
}
