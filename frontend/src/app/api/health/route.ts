import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Container healthcheck for the frontend service. */
export function GET(): NextResponse {
  return NextResponse.json({ status: "ok" });
}
