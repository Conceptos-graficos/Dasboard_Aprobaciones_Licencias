const server = (process.env.SEATABLE_SERVER || "https://cloud.seatable.io").replace(/\/$/, "");
const baseUuid = process.env.SEATABLE_BASE_UUID;
const apiToken = process.env.SEATABLE_TOKEN;

let cachedBaseToken: string | null = null;
let cachedBaseTokenExpiresAt = 0;

export function assertSeaTableConfig() {
  if (!baseUuid || !apiToken) {
    throw new Error("Faltan SEATABLE_BASE_UUID y/o SEATABLE_TOKEN en las variables de entorno.");
  }
}

async function getBaseToken(): Promise<string> {
  assertSeaTableConfig();
  if (cachedBaseToken && Date.now() < cachedBaseTokenExpiresAt) return cachedBaseToken;

  const response = await fetch(`${server}/api/v2.1/dtable/app-access-token/?exp=3d`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${apiToken}` },
    cache: "no-store"
  });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_message || `SeaTable no pudo generar el Base-Token. HTTP ${response.status}`);
  }
  cachedBaseToken = data.access_token;
  cachedBaseTokenExpiresAt = Date.now() + 1000 * 60 * 60 * 71;
  return cachedBaseToken;
}

async function seaTableFetch(path: string, init?: RequestInit) {
  const baseToken = await getBaseToken();
  const response = await fetch(`${server}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${baseToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    throw new Error(data?.error_message || data?.error || `SeaTable respondió HTTP ${response.status}`);
  }
  return data;
}

export type SeaTableColumn = { key?: string; name: string; type?: string };
export type SeaTableTable = { _id?: string; name: string; columns?: SeaTableColumn[]; rows?: unknown[] };

export async function getBaseInfo() {
  return seaTableFetch(`/api-gateway/api/v2/dtables/${baseUuid}`);
}

export async function getTables(): Promise<SeaTableTable[]> {
  const data = (await getBaseInfo()) as { tables?: SeaTableTable[] };
  return Array.isArray(data.tables) ? data.tables : [];
}

function escapeIdentifier(identifier: string) { return identifier.replace(/`/g, "``"); }

function columnByPhrase(columns: SeaTableColumn[], phrases: string[]) {
  return columns.find((c) => phrases.every((p) => c.name.toUpperCase().includes(p.toUpperCase())))?.name;
}

export function findColumn(columns: SeaTableColumn[], phrases: string[]) {
  return columnByPhrase(columns, phrases);
}

export async function queryTable(tableName: string, page: number, pageSize: number, filters: Record<string, string>) {
  const tables = await getTables();
  const table = tables.find((item) => item.name === tableName);
  if (!table) throw new Error("La hoja solicitada no existe en SeaTable.");

  const availableColumns = new Set((table.columns || []).map((column) => column.name));
  const where: string[] = [];
  const parameters: string[] = [];

  for (const [column, value] of Object.entries(filters)) {
    if (!value || !availableColumns.has(column)) continue;
    where.push(`\`${escapeIdentifier(column)}\` = ?`);
    parameters.push(value);
  }

  const offset = Math.max(0, page - 1) * pageSize;
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

  const data = (await seaTableFetch(`/api-gateway/api/v2/dtables/${baseUuid}/sql/`, {
    method: "POST",
    body: JSON.stringify({
      sql: `SELECT * FROM \`${escapeIdentifier(tableName)}\`${whereSql} LIMIT ${safePageSize} OFFSET ${offset}`,
      convert_keys: true,
      parameters
    })
  })) as { results?: Record<string, unknown>[] };

  const countData = (await seaTableFetch(`/api-gateway/api/v2/dtables/${baseUuid}/sql/`, {
    method: "POST",
    body: JSON.stringify({
      sql: `SELECT COUNT(*) AS total FROM \`${escapeIdentifier(tableName)}\`${whereSql}`,
      convert_keys: true,
      parameters
    })
  })) as { results?: Array<{ total?: number }> };

  const rows = Array.isArray(data.results) ? data.results : [];
  const total = Number(countData.results?.[0]?.total ?? 0);
  return { table, rows, total, page, pageSize: safePageSize, totalPages: Math.max(1, Math.ceil(total / safePageSize)) };
}

export async function getAllRowsForTable(tableName: string, limit = 10000) {
  const tables = await getTables();
  const table = tables.find((item) => item.name === tableName);
  if (!table) throw new Error(`La hoja ${tableName} no existe.`);
  const safeLimit = Math.min(Math.max(limit, 1), 10000);
  const data = (await seaTableFetch(`/api-gateway/api/v2/dtables/${baseUuid}/sql/`, {
    method: "POST",
    body: JSON.stringify({
      sql: `SELECT * FROM \`${escapeIdentifier(tableName)}\` LIMIT ${safeLimit}`,
      convert_keys: true
    })
  })) as { results?: Record<string, unknown>[] };
  return { table, rows: Array.isArray(data.results) ? data.results : [] };
}

export async function searchOpaAcrossTables(opa: string) {
  const clean = opa.trim();
  if (!clean) return [];
  const tables = await getTables();
  const results: Array<{ table: string; row: Record<string, unknown> }> = [];

  for (const table of tables) {
    const opaColumn = findColumn(table.columns || [], ["NUMERO", "OPA"]);
    if (!opaColumn) continue;
    const data = (await seaTableFetch(`/api-gateway/api/v2/dtables/${baseUuid}/sql/`, {
      method: "POST",
      body: JSON.stringify({
        sql: `SELECT * FROM \`${escapeIdentifier(table.name)}\` WHERE \`${escapeIdentifier(opaColumn)}\` = ? LIMIT 100`,
        convert_keys: true,
        parameters: [clean]
      })
    })) as { results?: Record<string, unknown>[] };
    for (const row of data.results || []) results.push({ table: table.name, row });
  }
  return results;
}

export type StageKey = "conceptoEnviado" | "conceptoAprobado" | "preProdEnviada" | "preProdAprobada" | "fotosEnviadas" | "fotosAprobadas" | "muestrasEnviadas" | "cerradas" | "canceladas";

export const stageDefinitions: Array<{ key: StageKey; label: string; phrases: string[][] }> = [
  { key: "conceptoEnviado", label: "Concepto Enviado", phrases: [["CONCEPTO", "ENVIADO"]] },
  { key: "conceptoAprobado", label: "Concepto Aprobado", phrases: [["CONCEPTO", "APROBADO"]] },
  { key: "preProdEnviada", label: "Pre-Producción Enviada", phrases: [["PRE-PRODUCCION", "ENVIADA"], ["PRE-PRODUCCIÓN", "ENVIADA"]] },
  { key: "preProdAprobada", label: "Pre-Producción Aprobada", phrases: [["PRE-PRODUCCION", "APROBADA"], ["PRE-PRODUCCIÓN", "APROBADA"]] },
  { key: "fotosEnviadas", label: "Fotos de Producción Enviadas", phrases: [["FOTOS", "PRODU", "ENVI"]] },
  { key: "fotosAprobadas", label: "Fotos de Producción Aprobadas", phrases: [["FOTOS", "PRODU", "APROB"]] },
  { key: "muestrasEnviadas", label: "Muestras Finales Enviadas", phrases: [["MUESTRAS", "FINAL", "ENVI"]] },
  { key: "cerradas", label: "Aprobada / Cerrada", phrases: [["APROBADA", "CERRADA"], ["APROBADA", "CERRA"]] },
  { key: "canceladas", label: "Cancelado", phrases: [["ESTADO", "PLATAFORMA"]] }
];

function hasValue(row: Record<string, unknown>, column?: string) {
  if (!column) return false;
  const value = row[column];
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function matchesPhrase(name: string, phrase: string[]) {
  const normalized = name.toUpperCase().replace(/[ÁÉÍÓÚÜ]/g, (c) => ({Á:"A",É:"E",Í:"I",Ó:"O",Ú:"U",Ü:"U"}[c] || c));
  return phrase.every((p) => normalized.includes(p));
}

function findStageColumn(columns: SeaTableColumn[], alternatives: string[][]) {
  for (const phrase of alternatives) {
    const found = columns.find((c) => matchesPhrase(c.name, phrase));
    if (found) return found.name;
  }
  return undefined;
}

export function summarizeRows(table: SeaTableTable, rows: Record<string, unknown>[]) {
  const columns = table.columns || [];
  const projectColumn = findColumn(columns, ["PROYECTO"]);
  const statusColumn = findColumn(columns, ["ESTADO", "PLATAFORMA"]);
  const stageColumns: Partial<Record<StageKey, string | undefined>> = {};
  for (const def of stageDefinitions) stageColumns[def.key] = findStageColumn(columns, def.phrases);

  const projectMap = new Map<string, { project: string; total: number; stages: Record<StageKey, number> }>();
  const totals: Record<StageKey, number> = {
    conceptoEnviado: 0, conceptoAprobado: 0, preProdEnviada: 0, preProdAprobada: 0,
    fotosEnviadas: 0, fotosAprobadas: 0, muestrasEnviadas: 0, cerradas: 0, canceladas: 0
  };

  for (const row of rows) {
    const project = projectColumn ? String(row[projectColumn] ?? "Sin proyecto") : "Sin proyecto";
    if (!projectMap.has(project)) projectMap.set(project, { project, total: 0, stages: { ...totals } });
    const bucket = projectMap.get(project)!;
    bucket.total += 1;

    for (const def of stageDefinitions) {
      let yes = false;
      const col = stageColumns[def.key];
      if (def.key === "canceladas") {
        const status = statusColumn ? String(row[statusColumn] ?? "").toUpperCase() : "";
        yes = status.includes("CANCEL");
      } else {
        yes = hasValue(row, col);
      }
      if (yes) { totals[def.key] += 1; bucket.stages[def.key] += 1; }
    }
  }

  return {
    totalRows: rows.length,
    totalProjects: projectMap.size,
    totals,
    projects: Array.from(projectMap.values()).sort((a, b) => a.project.localeCompare(b.project, "es")),
    columns: stageColumns
  };
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const m = raw.match(/^(\d{1,2})[\\/ -](enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)[\\/ -](\d{2,4})$/i);
  if (!m) return null;
  const months: Record<string, number> = { enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11 };
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return new Date(year, months[m[2].toLowerCase()], Number(m[1]));
}

function diffDays(a: unknown, b: unknown) {
  const start = parseDate(a); const end = parseDate(b);
  if (!start || !end) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

export async function getDaysAnalysis(tableName: string) {
  const tables = await getTables();
  const selected = tableName && tableName !== "__ALL__" ? tables.filter((t) => t.name === tableName) : tables;
  const datasets = await Promise.all(selected.map(async (table) => {
    const data = await getAllRowsForTable(table.name);
    return { table: data.table, rows: data.rows };
  }));

  const definitions = [
    { label: "Concepto → Aprobación", start: [["CONCEPTO","ENVIADO"]], end: [["CONCEPTO","APROBADO"]] },
    { label: "Pre-Producción → Aprobación", start: [["PRE-PRODUCCION","ENVIADA"],["PRE-PRODUCCIÓN","ENVIADA"]], end: [["PRE-PRODUCCION","APROBADA"],["PRE-PRODUCCIÓN","APROBADA"]] },
    { label: "Fotos → Aprobación", start: [["FOTOS","PRODU","ENVI"]], end: [["FOTOS","PRODU","APROB"]] },
    { label: "Muestras → Cierre", start: [["MUESTRAS","FINAL","ENVI"]], end: [["APROBADA","CERRADA"],["APROBADA","CERRA"]] }
  ];

  const metrics = definitions.map((definition) => {
    const values: number[] = [];
    for (const dataset of datasets) {
      const startColumn = findStageColumn(dataset.table.columns || [], definition.start);
      const endColumn = findStageColumn(dataset.table.columns || [], definition.end);
      if (!startColumn || !endColumn) continue;
      for (const row of dataset.rows) {
        const value = diffDays(row[startColumn], row[endColumn]);
        if (value !== null) values.push(value);
      }
    }
    return {
      label: definition.label,
      count: values.length,
      average: values.length ? Math.round((values.reduce((a,b)=>a+b,0) / values.length) * 10) / 10 : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null
    };
  });

  return { totalRows: datasets.reduce((n,d)=>n+d.rows.length,0), sheets: selected.map((t)=>t.name), metrics };
}

export async function ensureUsersTable() {
  const tables = await getTables();
  const existing = tables.find((t) => t.name.toUpperCase() === "USUARIOS");
  if (existing) return existing;
  await seaTableFetch(`/api-gateway/api/v2/dtables/${baseUuid}/tables/`, {
    method: "POST",
    body: JSON.stringify({
      table_name: "USUARIOS",
      columns: [
        { name: "USUARIO", type: "text" },
        { name: "NOMBRE", type: "text" },
        { name: "CORREO", type: "email" },
        { name: "ROL", type: "text" },
        { name: "ACTIVO", type: "text" }
      ]
    })
  });
  const refreshed = await getTables();
  const created = refreshed.find((t) => t.name.toUpperCase() === "USUARIOS");
  if (!created) throw new Error("SeaTable no pudo crear la tabla USUARIOS.");
  return created;
}

export async function listUsers() {
  const table = await ensureUsersTable();
  const data = (await seaTableFetch(`/api-gateway/api/v2/dtables/${baseUuid}/rows/?table_name=${encodeURIComponent(table.name)}&limit=1000&convert_keys=true`)) as { rows?: Record<string, unknown>[] };
  return Array.isArray(data.rows) ? data.rows : [];
}

export async function createUser(user: { usuario: string; nombre: string; correo: string; rol: string; activo: boolean }) {
  const table = await ensureUsersTable();
  return seaTableFetch(`/api-gateway/api/v2/dtables/${baseUuid}/rows/`, {
    method: "POST",
    body: JSON.stringify({
      table_name: table.name,
      rows: [{ USUARIO: user.usuario, NOMBRE: user.nombre, CORREO: user.correo, ROL: user.rol, ACTIVO: user.activo }],
      apply_default: true
    })
  });
}

function filterRows(rows: Record<string, unknown>[], table: SeaTableTable, filters: { marca?: string; proyecto?: string; tipoProducto?: string; opa?: string }) {
  const columns = table.columns || [];
  const projectColumn = findColumn(columns, ["PROYECTO"]);
  const productColumn = findColumn(columns, ["TIPO", "PRODUCTO"]);
  const marcaColumn = findColumn(columns, ["MARCA"]);
  const opaColumn = findColumn(columns, ["NUMERO", "OPA"]);
  return rows.filter((row) => {
    if (filters.marca && table.name !== filters.marca) return false;
    if (filters.proyecto && String(row[projectColumn || ""] ?? "") !== filters.proyecto) return false;
    if (filters.tipoProducto && String(row[productColumn || ""] ?? "") !== filters.tipoProducto) return false;
    if (filters.opa && String(row[opaColumn || ""] ?? "") !== filters.opa) return false;
    return true;
  });
}

export async function getDashboardData(filters: { table: string; marca?: string; proyecto?: string; tipoProducto?: string; opa?: string }) {
  const tables = await getTables();
  const selected = filters.table && filters.table !== "__ALL__" ? tables.filter((t) => t.name === filters.table) : tables;
  const datasets = await Promise.all(selected.map(async (table) => {
    const data = await getAllRowsForTable(table.name);
    return { table: data.table, rows: filterRows(data.rows, data.table, filters) };
  }));

  const totalRows = datasets.reduce((n, d) => n + d.rows.length, 0);
  const projectSet = new Set<string>();
  const projectMap = new Map<string, { project: string; total: number; stages: Record<StageKey, number> }>();
  const totals: Record<StageKey, number> = {
    conceptoEnviado: 0, conceptoAprobado: 0, preProdEnviada: 0, preProdAprobada: 0,
    fotosEnviadas: 0, fotosAprobadas: 0, muestrasEnviadas: 0, cerradas: 0, canceladas: 0
  };

  for (const d of datasets) {
    const summary = summarizeRows(d.table, d.rows);
    for (const p of summary.projects) {
      projectSet.add(p.project);
      if (!projectMap.has(p.project)) projectMap.set(p.project, { project: p.project, total: 0, stages: { ...totals } });
      const target = projectMap.get(p.project)!;
      target.total += p.total;
      for (const key of Object.keys(totals) as StageKey[]) {
        target.stages[key] += p.stages[key];
        totals[key] += p.stages[key];
      }
    }
  }

  const filterOptions = {
    proyectos: Array.from(new Set(datasets.flatMap((d) => d.rows.map((r) => String(r[findColumn(d.table.columns || [], ["PROYECTO"]) || ""] ?? "")).filter(Boolean)))).sort((a,b)=>a.localeCompare(b,"es")),
    tiposProducto: Array.from(new Set(datasets.flatMap((d) => d.rows.map((r) => String(r[findColumn(d.table.columns || [], ["TIPO","PRODUCTO"]) || ""] ?? "")).filter(Boolean)))).sort((a,b)=>a.localeCompare(b,"es")),
    opas: Array.from(new Set(datasets.flatMap((d) => d.rows.map((r) => String(r[findColumn(d.table.columns || [], ["NUMERO","OPA"]) || ""] ?? "")).filter(Boolean)))).sort()
  };

  return {
    totalRows,
    totalProjects: projectSet.size,
    totals,
    projects: Array.from(projectMap.values()).sort((a,b)=>a.project.localeCompare(b.project,"es")),
    filterOptions,
    sheets: selected.map((t) => t.name)
  };
}
