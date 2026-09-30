const server = (
  process.env.SEATABLE_SERVER || "https://cloud.seatable.io"
).replace(/\/$/, "");

const baseUuid = process.env.SEATABLE_BASE_UUID;
const apiToken = process.env.SEATABLE_TOKEN;

let cachedBaseToken: string | null = null;
let cachedBaseTokenExpiresAt = 0;

export function assertSeaTableConfig() {
  if (!baseUuid || !apiToken) {
    throw new Error(
      "Faltan SEATABLE_BASE_UUID y/o SEATABLE_TOKEN en las variables de entorno."
    );
  }
}

async function getBaseToken(): Promise<string> {
  assertSeaTableConfig();

  const now = Date.now();

  // Reutilizamos el Base-Token mientras siga vigente.
  if (cachedBaseToken && now < cachedBaseTokenExpiresAt) {
    return cachedBaseToken;
  }

  const response = await fetch(
    `${server}/api/v2.1/dtable/app-access-token/?exp=3d`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiToken}`
      },
      cache: "no-store"
    }
  );

  const text = await response.text();

  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error_message" in data
        ? String(
            (data as { error_message: unknown }).error_message
          )
        : `SeaTable no pudo generar el Base-Token. HTTP ${response.status}`;

    throw new Error(message);
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("access_token" in data) ||
    typeof (data as { access_token?: unknown }).access_token !== "string"
  ) {
    throw new Error(
      "SeaTable respondió correctamente, pero no devolvió un Base-Token."
    );
  }

  cachedBaseToken = (data as { access_token: string }).access_token;

  // SeaTable genera el token por 3 días.
  // Lo renovamos un poco antes para evitar trabajar con un token vencido.
  cachedBaseTokenExpiresAt =
    Date.now() + 1000 * 60 * 60 * 71;

  return cachedBaseToken;
}

async function seaTableFetch(
  path: string,
  init?: RequestInit
) {
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

  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error_message" in data
        ? String(
            (data as { error_message: unknown }).error_message
          )
        : `SeaTable respondió HTTP ${response.status}`;

    throw new Error(message);
  }

  return data;
}

export type SeaTableColumn = {
  key?: string;
  name: string;
  type?: string;
};

export type SeaTableTable = {
  _id?: string;
  name: string;
  columns?: SeaTableColumn[];
  rows?: unknown[];
};

export async function getBaseInfo() {
  return seaTableFetch(
    `/api-gateway/api/v2/dtables/${baseUuid}`
  );
}

export async function getTables(): Promise<SeaTableTable[]> {
  const data = (await getBaseInfo()) as {
    tables?: SeaTableTable[];
  };

  return Array.isArray(data.tables)
    ? data.tables
    : [];
}

function escapeIdentifier(identifier: string) {
  return identifier.replace(/`/g, "``");
}

export async function queryTable(
  tableName: string,
  page: number,
  pageSize: number,
  filters: Record<string, string>
) {
  const tables = await getTables();

  const table = tables.find(
    (item) => item.name === tableName
  );

  if (!table) {
    throw new Error(
      "La tabla solicitada no existe en la base de SeaTable."
    );
  }

  const availableColumns = new Set(
    (table.columns || []).map(
      (column) => column.name
    )
  );

  const where: string[] = [];
  const parameters: string[] = [];

  for (const [column, value] of Object.entries(filters)) {
    if (!value || !availableColumns.has(column)) {
      continue;
    }

    where.push(
      `\`${escapeIdentifier(column)}\` = ?`
    );

    parameters.push(value);
  }

  const offset =
    Math.max(0, page - 1) * pageSize;

  const safePageSize = Math.min(
    Math.max(pageSize, 1),
    100
  );

  const whereSql = where.length
    ? ` WHERE ${where.join(" AND ")}`
    : "";

  const data = (await seaTableFetch(
    `/api-gateway/api/v2/dtables/${baseUuid}/sql/`,
    {
      method: "POST",
      body: JSON.stringify({
        sql: `SELECT * FROM \`${escapeIdentifier(
          tableName
        )}\`${whereSql} LIMIT ${safePageSize} OFFSET ${offset}`,
        convert_keys: true,
        parameters
      })
    }
  )) as {
    results?: Record<string, unknown>[];
    metadata?: unknown;
  };

  const countData = (await seaTableFetch(
    `/api-gateway/api/v2/dtables/${baseUuid}/sql/`,
    {
      method: "POST",
      body: JSON.stringify({
        sql: `SELECT COUNT(*) AS total FROM \`${escapeIdentifier(
          tableName
        )}\`${whereSql}`,
        convert_keys: true,
        parameters
      })
    }
  )) as {
    results?: Array<{
      total?: number;
    }>;
  };

  const rows = Array.isArray(data.results)
    ? data.results
    : [];

  const total = Number(
    countData.results?.[0]?.total ?? 0
  );

  return {
    table,
    rows,
    total,
    page,
    pageSize: safePageSize,
    totalPages: Math.max(
      1,
      Math.ceil(total / safePageSize)
    )
  };
}
