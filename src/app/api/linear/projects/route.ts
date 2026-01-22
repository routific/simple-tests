import { NextResponse } from "next/server";
import { getProjects } from "@/lib/linear";
import { getSessionWithOrg } from "@/lib/auth";

export async function GET() {
  const session = await getSessionWithOrg();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await getProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error("Failed to fetch Linear projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
