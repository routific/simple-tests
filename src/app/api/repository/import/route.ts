import { importTestCases, ExportData } from "@/app/cases/export-actions";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate the import data structure
    if (!isValidExportData(body)) {
      return NextResponse.json(
        { error: "Invalid repository export format" },
        { status: 400 }
      );
    }

    const result = await importTestCases(body as ExportData);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      stats: result.stats,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to parse import data" },
      { status: 400 }
    );
  }
}

function isValidExportData(data: unknown): data is ExportData {
  if (typeof data !== "object" || data === null) return false;

  const obj = data as Record<string, unknown>;

  if (
    typeof obj.version !== "number" ||
    typeof obj.exportedAt !== "string" ||
    typeof obj.organizationId !== "string" ||
    typeof obj.data !== "object" ||
    obj.data === null
  ) {
    return false;
  }

  const dataObj = obj.data as Record<string, unknown>;

  return (
    Array.isArray(dataObj.folders) &&
    Array.isArray(dataObj.testCases) &&
    Array.isArray(dataObj.scenarios)
  );
}
