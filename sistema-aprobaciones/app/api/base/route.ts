import { NextResponse } from "next/server";
import { getTables } from "@/lib/seatable";

export async function GET() {
  try {
    const tables = await getTables();

    return NextResponse.json({
      tables: tables.map((table) => ({
        id: table._id,
        name: table.name,
        columns: table.columns || []
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error consultando SeaTable.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
