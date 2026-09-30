import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/lib/seatable";

export async function GET(request: NextRequest) {
  try {
    const p = new URL(request.url).searchParams;
    return NextResponse.json(await getDashboardData({
      table: p.get("table") || "__ALL__",
      marca: p.get("marca") || "",
      proyecto: p.get("proyecto") || "",
      tipoProducto: p.get("tipoProducto") || "",
      opa: p.get("opa") || ""
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error cargando dashboard." }, { status: 500 });
  }
}
