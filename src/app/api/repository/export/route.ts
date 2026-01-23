import { exportTestCases } from "@/app/cases/export-actions";
import { NextResponse } from "next/server";

export async function GET() {
  const result = await exportTestCases();

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (!result.data) {
    return NextResponse.json(
      { error: "No data to export" },
      { status: 500 }
    );
  }

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `test-repository-export-${timestamp}.json`;

  // Return as downloadable JSON file
  return new NextResponse(JSON.stringify(result.data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
