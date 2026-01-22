import { NextResponse } from "next/server";
import { getMilestones } from "@/lib/linear";
import { getSessionWithOrg } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getSessionWithOrg();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") || undefined;

  try {
    const milestones = await getMilestones(projectId);
    return NextResponse.json(milestones);
  } catch (error) {
    console.error("Failed to fetch Linear milestones:", error);
    return NextResponse.json(
      { error: "Failed to fetch milestones" },
      { status: 500 }
    );
  }
}
