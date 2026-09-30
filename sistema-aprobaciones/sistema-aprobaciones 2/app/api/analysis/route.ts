import { NextRequest, NextResponse } from "next/server";
import { getDaysAnalysis } from "@/lib/seatable";

export async function GET(request: NextRequest) {
  try {
    const table = new URL(request.url).searchParams.get("table") || "__ALL__";
    return NextResponse.json(await getDaysAnalysis(table));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error analizando días." }, { status: 500 });
  }
}
