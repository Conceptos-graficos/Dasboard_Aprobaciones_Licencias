"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Column = { key?: string; name: string; type?: string };
type TableInfo = { id?: string; name: string; columns: Column[] };
type Project = { project: string; total: number; stages: Record<string, number> };
type DashboardData = {
  totalRows: number;
  totalProjects: number;
  totals: Record<string, number>;
  projects: Project[];
  filterOptions: { proyectos: string[]; tiposProducto: string[]; opas: string[] };
  sheets: string[];
};
type AnalysisData = { totalRows: number; sheets: string[]; metrics: { label: string; count: number; average: number | null; min: number | null; max: number | null }[] };
type OpaResult = { table: string; row: Record<string, unknown> };
type TableResponse = { table: TableInfo; rows: Record<string, unknown>[]; total: number; page: number; pageSize: number; totalPages: number };
type User = Record<string, unknown>;

const stages = [
  ["conceptoEnviado", "Concepto Enviado"],
  ["conceptoAprobado", "Concepto Aprobado"],
  ["preProdEnviada", "Pre-Producción Enviada"],
  ["preProdAprobada", "Pre-Producción Aprobada"],
  ["fotosEnviadas", "Fotos de Producción Enviadas"],
  ["fotosAprobadas", "Fotos de Producción Aprobadas"],
  ["muestrasEnviadas", "Muestras Finales Enviadas"],
  ["cerradas", "Aprobada / Cerrada"],
  ["canceladas", "Cancelado"]
] as const;

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map((v) => typeof v === "object" && v && "display_value" in v ? String((v as any).display_value) : String(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function findValue(row: Record<string, unknown>, phrase: string) {
  const key = Object.keys(row).find((k) => k.toUpperCase().includes(phrase.toUpperCase()));
  return key ? displayValue(row[key]) : "—";
}

export default function Dashboard() {
  const [view, setView] = useState<"dashboard" | "days" | "opa" | "users">("dashboard");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [sheet, setSheet] = useState("__ALL__");
  const [filters, setFilters] = useState({ proyecto: "", tipoProducto: "", opa: "" });
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [tableData, setTableData] = useState<TableResponse | null>(null);
  const [opa, setOpa] = useState("");
  const [opaResults, setOpaResults] = useState<OpaResult[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userForm, setUserForm] = useState({ usuario: "", nombre: "", correo: "", rol: "Usuario operativo" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchRows, setSearchRows] = useState("");

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", ...options });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "No fue posible completar la operación.");
    return json;
  }

  async function loadTables() {
    const data = await api<{ tables: TableInfo[] }>("/api/base");
    setTables(data.tables || []);
  }

  async function loadDashboard() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ table: sheet });
      if (filters.proyecto) params.set("proyecto", filters.proyecto);
      if (filters.tipoProducto) params.set("tipoProducto", filters.tipoProducto);
      if (filters.opa) params.set("opa", filters.opa);
      const data = await api<DashboardData>(`/api/dashboard?${params}`);
      setDashboard(data);
      if (sheet !== "__ALL__") {
        const detail = await api<TableResponse>(`/api/table?table=${encodeURIComponent(sheet)}&page=1&pageSize=30`);
        setTableData(detail);
      } else setTableData(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Error cargando dashboard."); }
    finally { setLoading(false); }
  }

  async function loadAnalysis() {
    setLoading(true); setError("");
    try { setAnalysis(await api<AnalysisData>(`/api/analysis?table=${encodeURIComponent(sheet)}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Error cargando análisis."); }
    finally { setLoading(false); }
  }

  async function searchOpa() {
    setLoading(true); setError("");
    try { setOpaResults((await api<{ results: OpaResult[] }>(`/api/opa?opa=${encodeURIComponent(opa)}`)).results); }
    catch (e) { setError(e instanceof Error ? e.message : "Error buscando OPA."); }
    finally { setLoading(false); }
  }

  async function loadUsers() {
    setLoading(true); setError("");
    try { setUsers((await api<{ users: User[] }>("/api/users")).users); }
    catch (e) { setError(e instanceof Error ? e.message : "Error cargando usuarios."); }
    finally { setLoading(false); }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      await api("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(userForm) });
      setUserForm({ usuario: "", nombre: "", correo: "", rol: "Usuario operativo" });
      await loadUsers();
    } catch (e) { setError(e instanceof Error ? e.message : "Error creando usuario."); setLoading(false); }
  }

  useEffect(() => { loadTables().catch((e) => setError(e instanceof Error ? e.message : "Error conectando SeaTable.")); }, []);
  useEffect(() => {
    if (view === "dashboard") loadDashboard();
    if (view === "days") loadAnalysis();
    if (view === "users") loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sheet, filters]);

  const filteredRows = useMemo(() => {
    if (!tableData?.rows) return [];
    const q = searchRows.trim().toLowerCase();
    if (!q) return tableData.rows;
    return tableData.rows.filter((row) => Object.values(row).some((v) => displayValue(v).toLowerCase().includes(q)));
  }, [tableData, searchRows]);

  function clearFilters() { setFilters({ proyecto: "", tipoProducto: "", opa: "" }); setSearchRows(""); }

  const sheetOptions = tables.filter((t) => t.name.toUpperCase() !== "USUARIOS");
  const total = dashboard?.totalRows || 0;
  const cancelled = dashboard?.totals.canceladas || 0;
  const closed = dashboard?.totals.cerradas || 0;
  const pending = Math.max(0, (dashboard?.totals.conceptoEnviado || 0) - (dashboard?.totals.conceptoAprobado || 0));
  const inProcess = Math.max(0, total - closed - cancelled - pending);

  return (
    <main className="appShell">
      <header className="hero">
        <div><div className="heroTitle">SISTEMA DE APROBACIONES</div><div className="heroSub">Gestión de proyectos, OPAs y conceptos conectada a SeaTable</div></div>
        <div className="heroRight"><span className="live"><i /> En vivo</span><button onClick={() => view === "dashboard" ? loadDashboard() : view === "days" ? loadAnalysis() : view === "opa" ? searchOpa() : loadUsers()}>↻ Actualizar</button></div>
      </header>

      <section className="filtersBar">
        <div className="filterBox"><label>▱ MARCA / HOJA</label><select value={sheet} onChange={(e) => { setSheet(e.target.value); setFilters({ proyecto: "", tipoProducto: "", opa: "" }); }}><option value="__ALL__">Todas las hojas</option>{sheetOptions.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}</select></div>
        <div className="filterBox"><label>▱ PROYECTO</label><select value={filters.proyecto} onChange={(e) => setFilters((f) => ({ ...f, proyecto: e.target.value }))}><option value="">Todos los proyectos</option>{dashboard?.filterOptions.proyectos.map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="filterBox"><label>◇ TIPO DE PRODUCTO</label><select value={filters.tipoProducto} onChange={(e) => setFilters((f) => ({ ...f, tipoProducto: e.target.value }))}><option value="">Todos los productos</option>{dashboard?.filterOptions.tiposProducto.map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="filterBox"><label>▱ NÚMERO DE OPA</label><select value={filters.opa} onChange={(e) => setFilters((f) => ({ ...f, opa: e.target.value }))}><option value="">Todas las OPA</option>{dashboard?.filterOptions.opas.slice(0, 500).map((v) => <option key={v}>{v}</option>)}</select></div>
        <button className="clear" onClick={clearFilters}>↶ Limpiar filtros</button>
      </section>

      <nav className="mainNav">
        <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>📊 Dashboard</button>
        <button className={view === "days" ? "active" : ""} onClick={() => setView("days")}>📅 Análisis por Días</button>
        <button className={view === "opa" ? "active" : ""} onClick={() => setView("opa")}>🔎 Búsqueda de OPA</button>
        <button className={view === "users" ? "active" : ""} onClick={() => setView("users")}>👤 Usuarios</button>
      </nav>

      <section className="content">
        {error && <div className="errorBox"><strong>No se pudo completar la operación.</strong><div>{error}</div></div>}
        {loading && <div className="loading">Consultando SeaTable...</div>}

        {!loading && view === "dashboard" && dashboard && <>
          <div className="statusLine"><span>● SeaTable conectado</span><small>{dashboard.totalRows.toLocaleString("es-CO")} filas en la selección actual</small></div>
          <div className="titleRow"><div><p className="eyebrow">ANÁLISIS DE DATOS</p><h1>{sheet === "__ALL__" ? "Resumen general" : sheet}</h1><p className="muted">Seguimiento del flujo de aprobación por proyecto y etapa.</p></div></div>
          <div className="kpis"><div className="bigKpi"><span>TOTAL PROYECTOS</span><strong>{dashboard.totalProjects}</strong><small>Proyectos distintos con OPAs registradas</small></div><div className="kpi blue"><span>TOTAL CONCEPTOS</span><strong>{total.toLocaleString("es-CO")}</strong><small>En el filtro actual</small></div><div className="kpi orange"><span>PENDIENTES POR APROBAR</span><strong>{pending.toLocaleString("es-CO")}</strong><small>Conceptos enviados sin aprobación</small></div><div className="kpi blue"><span>EN PROCESO</span><strong>{inProcess.toLocaleString("es-CO")}</strong><small>OPAs en etapas intermedias</small></div><div className="kpi green"><span>APROBACIÓN FINAL / CERRADOS</span><strong>{closed.toLocaleString("es-CO")}</strong><small>OPAs aprobadas o cerradas</small></div><div className="kpi red"><span>CANCELADOS</span><strong>{cancelled.toLocaleString("es-CO")}</strong><small>OPAs canceladas</small></div></div>

          <div className="card matrixCard"><div className="cardTitle"><div><h2>Matriz Proyecto × Etapa</h2><p>Seguimiento de conceptos y OPAs para cada etapa del flujo.</p></div><span>{dashboard.projects.length} proyectos</span></div><div className="matrixScroll"><table className="matrix"><thead><tr><th>PROYECTO</th>{stages.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{dashboard.projects.slice(0, 100).map((p) => <tr key={p.project}><td><strong>{p.project}</strong><small>{p.total} registros</small></td>{stages.map(([key]) => <td key={key}>{p.stages[key] || 0}</td>)}</tr>)}</tbody></table></div></div>

          {sheet !== "__ALL__" && tableData && <div className="card tableCard"><div className="cardTitle"><div><h2>Información de {sheet}</h2><p>Datos reales de la hoja seleccionada.</p></div><input value={searchRows} onChange={(e)=>setSearchRows(e.target.value)} placeholder="Buscar en la hoja..." /></div><div className="tableScroll"><table><thead><tr>{tableData.table.columns.map((c)=><th key={c.name}>{c.name}</th>)}</tr></thead><tbody>{filteredRows.map((row,i)=><tr key={String(row._id||i)}>{tableData.table.columns.map((c)=><td key={c.name}>{displayValue(row[c.name])}</td>)}</tr>)}</tbody></table></div></div>}
        </>}

        {!loading && view === "days" && analysis && <div><div className="titleRow"><div><p className="eyebrow">CONTROL DE TIEMPOS</p><h1>Análisis por Días</h1><p className="muted">Tiempo transcurrido entre las principales etapas del flujo.</p></div></div><div className="daysGrid">{analysis.metrics.map((m)=><div className="dayCard" key={m.label}><span>{m.label}</span><strong>{m.average === null ? "—" : `${m.average} días`}</strong><small>{m.count} registros con fechas completas · mínimo {m.min ?? "—"} · máximo {m.max ?? "—"}</small></div>)}</div><div className="card infoCard"><h2>Alcance del análisis</h2><p>{sheet === "__ALL__" ? "Todas las hojas de la base" : sheet}. Se analizaron {analysis.totalRows.toLocaleString("es-CO")} registros.</p></div></div>}

        {!loading && view === "opa" && <div><div className="titleRow"><div><p className="eyebrow">RASTREO GLOBAL</p><h1>Búsqueda de OPA</h1><p className="muted">Busca un número de OPA en todas las hojas de SeaTable y revisa su estado.</p></div></div><div className="opaSearch"><input value={opa} onChange={(e)=>setOpa(e.target.value)} onKeyDown={(e)=>e.key === "Enter" && searchOpa()} placeholder="Ej. 040598"/><button onClick={searchOpa}>🔎 Buscar OPA</button></div>{opa && !opaResults.length && <div className="empty">No se encontraron coincidencias para <strong>{opa}</strong>.</div>}{opaResults.map((result,i)=><div className="card opaCard" key={`${result.table}-${i}`}><div className="opaHead"><strong>{result.table}</strong><span>OPA: {findValue(result.row,"NUMERO DE OPA")}</span></div><div className="opaGrid"><div><small>PROYECTO</small><b>{findValue(result.row,"PROYECTO")}</b></div><div><small>ESTADO</small><b>{findValue(result.row,"ESTADO PLATAFORMA")}</b></div><div><small>PERSONAJE</small><b>{findValue(result.row,"PERSONAJE")}</b></div><div><small>CONCEPTO ENVIADO</small><b>{findValue(result.row,"CONCEPTO ENVIADO")}</b></div><div><small>CONCEPTO APROBADO</small><b>{findValue(result.row,"CONCEPTO APROBADO")}</b></div></div><details><summary>Ver todos los datos</summary><div className="detailGrid">{Object.entries(result.row).filter(([k])=>!k.startsWith("_")).map(([k,v])=><div key={k}><small>{k}</small><span>{displayValue(v)}</span></div>)}</div></details></div>)}</div>}

        {!loading && view === "users" && <div><div className="titleRow"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Usuarios</h1><p className="muted">Los usuarios se almacenan en una tabla USUARIOS dentro de la misma base SeaTable.</p></div></div><div className="userLayout"><form className="card userForm" onSubmit={createUser}><h2>Crear usuario</h2><input required placeholder="Usuario" value={userForm.usuario} onChange={(e)=>setUserForm({...userForm,usuario:e.target.value})}/><input required placeholder="Nombre completo" value={userForm.nombre} onChange={(e)=>setUserForm({...userForm,nombre:e.target.value})}/><input required type="email" placeholder="Correo" value={userForm.correo} onChange={(e)=>setUserForm({...userForm,correo:e.target.value})}/><select value={userForm.rol} onChange={(e)=>setUserForm({...userForm,rol:e.target.value})}><option>Administrador</option><option>Aprobador</option><option>Usuario operativo</option></select><button type="submit">+ Crear usuario</button></form><div className="card tableCard"><div className="cardTitle"><div><h2>Usuarios registrados</h2><p>{users.length} usuarios</p></div></div><div className="tableScroll"><table><thead><tr><th>USUARIO</th><th>NOMBRE</th><th>CORREO</th><th>ROL</th><th>ACTIVO</th></tr></thead><tbody>{users.map((u,i)=><tr key={String(u._id||i)}><td>{displayValue(u.USUARIO)}</td><td>{displayValue(u.NOMBRE)}</td><td>{displayValue(u.CORREO)}</td><td>{displayValue(u.ROL)}</td><td>{displayValue(u.ACTIVO)}</td></tr>)}</tbody></table></div></div></div></div>}
      </section>
    </main>
  );
}
