import { handlers } from "@/lib/auth";
import { isDemoMode, getDemoSession } from "@/lib/demo";
import { NextRequest, NextResponse } from "next/server";

const { GET: originalGET, POST } = handlers;

async function GET(req: NextRequest) {
  if (isDemoMode() && req.url.includes("/session")) {
    return NextResponse.json(getDemoSession());
  }
  return originalGET(req);
}

export { GET, POST };
