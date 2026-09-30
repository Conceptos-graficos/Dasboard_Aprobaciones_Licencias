import { NextRequest, NextResponse } from "next/server";
import { searchOpaAcrossTables } from "@/lib/seatable";

export async function GET(request: NextRequest) {
  try {
    const opa = new URL(request.url).searchParams.get("opa") || "";
    if (!opa.trim()) return NextResponse.json({ results: [] });
    return NextResponse.json({ results: await searchOpaAcrossTables(opa) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error buscando OPA." }, { status: 500 });
  }
}
