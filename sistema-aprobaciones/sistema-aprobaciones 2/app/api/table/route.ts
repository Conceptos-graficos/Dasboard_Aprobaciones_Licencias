import { NextRequest, NextResponse } from "next/server";
import { queryTable } from "@/lib/seatable";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");

    if (!tableName) {
      return NextResponse.json(
        { error: "Debes indicar ?table=NombreDeTabla" },
        { status: 400 }
      );
    }

    const page = Number(searchParams.get("page") || "1");
    const pageSize = Number(
      searchParams.get("pageSize") ||
        process.env.TABLE_PAGE_SIZE ||
        "50"
    );

    const filters: Record<string, string> = {};

    const marca = searchParams.get("marca");
    const proyecto = searchParams.get("proyecto");
    const tipoProducto = searchParams.get("tipoProducto");
    const opa = searchParams.get("opa");

    if (marca) filters["MARCA"] = marca;
    if (proyecto) filters["PROYECTO"] = proyecto;
    if (opa) filters["NUMERO DE OPA"] = opa;

    // En tu base aparece más de una columna cuyo nombre comienza por
    // "TIPO DE PRODUCTO". Esta primera versión usa la columna exacta
    // "TIPO DE PRODUCTO" cuando exista.
    if (tipoProducto) filters["TIPO DE PRODUCTO"] = tipoProducto;

    const result = await queryTable(
      tableName,
      Number.isFinite(page) && page > 0 ? page : 1,
      Number.isFinite(pageSize) ? pageSize : 50,
      filters
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error consultando la tabla.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
