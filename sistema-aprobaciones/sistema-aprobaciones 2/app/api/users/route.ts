import { NextRequest, NextResponse } from "next/server";
import { createUser, listUsers } from "@/lib/seatable";

export async function GET() {
  try { return NextResponse.json({ users: await listUsers() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Error cargando usuarios." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const usuario = String(body.usuario || "").trim();
    const nombre = String(body.nombre || "").trim();
    const correo = String(body.correo || "").trim();
    const rol = String(body.rol || "Usuario operativo").trim();
    if (!usuario || !nombre || !correo) return NextResponse.json({ error: "Usuario, nombre y correo son obligatorios." }, { status: 400 });
    await createUser({ usuario, nombre, correo, rol, activo: body.activo !== false });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Error creando usuario." }, { status: 500 }); }
}
