 "use client";

import { useEffect, useMemo, useState } from "react";

type Column = {
  key?: string;
  name: string;
  type?: string;
};

type TableInfo = {
  id?: string;
  name: string;
  columns: Column[];
};

type TableResponse = {
  table: TableInfo;
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const preferredColumns = [
  "PROYECTO",
  "TIPO DE PRODUCTO",
  "MARCA",
  "TERRITORIO",
  "PORTAFOLIO",
  "ITEM / SKU B2B",
  "ITEM / SKU B2C",
  "NOMBRE DE PRODUCTO",
  "NUMERO DE OPA",
  "SUBOPA",
  "PERSONAJE",
  "ESTADO PLATAFORMA",
  "CONCEPTO ENVIADO",
  "CONCEPTO APROBADO"
];

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "object" && item !== null && "display_value" in item) {
          return String((item as { display_value: unknown }).display_value);
        }
        return String(item);
      })
      .join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function findColumn(columns: Column[], phrase: string) {
  return columns.find((column) =>
    column.name.toUpperCase().includes(phrase.toUpperCase())
  )?.name;
}

export default function Dashboard() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [data, setData] = useState<TableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    marca: "",
    proyecto: "",
    tipoProducto: "",
    opa: ""
  });

  async function loadTables() {
    setError("");
    const response = await fetch("/api/base", { cache: "no-store" });
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error || "No fue posible cargar las tablas.");
    }

    const received = Array.isArray(json.tables) ? json.tables : [];
    setTables(received);

    if (!selectedTable && received.length) {
      setSelectedTable(received[0].name);
    }
  }

  async function loadTable(tableName: string, targetPage = page) {
    if (!tableName) return;

    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      table: tableName,
      page: String(targetPage),
      pageSize: "50"
    });

    if (filters.marca) params.set("marca", filters.marca);
    if (filters.proyecto) params.set("proyecto", filters.proyecto);
    if (filters.tipoProducto) params.set("tipoProducto", filters.tipoProducto);
    if (filters.opa) params.set("opa", filters.opa);

    try {
      const response = await fetch(`/api/table?${params.toString()}`, {
        cache: "no-store"
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "No fue posible cargar la información.");
      }

      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTables().catch((err) => {
      setError(err instanceof Error ? err.message : "Error cargando SeaTable.");
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedTable) loadTable(selectedTable, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable, page, filters]);

  const columns = useMemo(() => {
    const source = data?.table.columns || [];
    const existing = source.map((column) => column.name);

    const preferred = preferredColumns.filter((name) => existing.includes(name));
    const remaining = existing.filter((name) => !preferred.includes(name));

    return [...preferred, ...remaining];
  }, [data]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data?.rows || [];

    return (data?.rows || []).filter((row) =>
      Object.values(row).some((value) =>
        displayValue(value).toLowerCase().includes(term)
      )
    );
  }, [data, search]);

  const activeTable = data?.table;

  const filterOptions = useMemo(() => {
    const rows = data?.rows || [];

    function unique(column: string) {
      return Array.from(
        new Set(
          rows
            .map((row) => displayValue(row[column]))
            .filter((value) => value !== "—")
        )
      ).slice(0, 100);
    }

    return {
      marca: unique("MARCA"),
      proyecto: unique("PROYECTO"),
      tipoProducto: unique("TIPO DE PRODUCTO"),
      opa: unique("NUMERO DE OPA")
    };
  }, [data]);

  function clearFilters() {
    setFilters({
      marca: "",
      proyecto: "",
      tipoProducto: "",
      opa: ""
    });
    setSearch("");
    setPage(1);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">✓</div>
          <div>
            <div className="brandTitle">SISTEMA DE APROBACIONES</div>
            <div className="brandSub">Gestión conectada a SeaTable</div>
          </div>
        </div>
        <button
          className="refreshButton"
          onClick={() => selectedTable && loadTable(selectedTable, page)}
        >
          ↻ Actualizar datos
        </button>
      </header>

      <section className="tableTabs">
        <button
          className={`tableTab ${selectedTable === "" ? "active" : ""}`}
          onClick={() => setSelectedTable("")}
        >
          Resumen
        </button>

        {tables.map((table) => (
          <button
            key={table.id || table.name}
            className={`tableTab ${selectedTable === table.name ? "active" : ""}`}
            onClick={() => {
              setPage(1);
              setSearch("");
              setSelectedTable(table.name);
            }}
            title={`Abrir tabla ${table.name}`}
          >
            {table.name}
          </button>
        ))}
      </section>

      <section className="content">
        <div className="pageHeading">
          <div>
            <p className="eyebrow">ANÁLISIS DE DATOS</p>
            <h1>{activeTable?.name || "Resumen de la base"}</h1>
            <p className="muted">
              Selecciona una pestaña para consultar directamente su información.
            </p>
          </div>
          <div className="connectionBadge">
            <span className="dot" />
            SeaTable conectado
          </div>
        </div>

        {error && (
          <div className="errorBox">
            <strong>No se pudo cargar la información.</strong>
            <div>{error}</div>
          </div>
        )}

        {selectedTable && data && (
          <>
            <div className="kpis">
              <div className="kpi">
                <span>Total registros</span>
                <strong>{data.total.toLocaleString("es-CO")}</strong>
              </div>
              <div className="kpi">
                <span>Columnas</span>
                <strong>{data.table.columns.length}</strong>
              </div>
              <div className="kpi">
                <span>Página</span>
                <strong>
                  {data.page} / {data.totalPages}
                </strong>
              </div>
              <div className="kpi">
                <span>Filas visibles</span>
                <strong>{visibleRows.length}</strong>
              </div>
            </div>

            <div className="filtersPanel">
              <div className="filterHeader">
                <div>
                  <h2>Filtros</h2>
                  <span>Los filtros se aplican directamente contra SeaTable.</span>
                </div>
                <button className="clearButton" onClick={clearFilters}>
                  Limpiar filtros
                </button>
              </div>

              <div className="filtersGrid">
                <label>
                  Marca
                  <select
                    value={filters.marca}
                    onChange={(e) => {
                      setPage(1);
                      setFilters((old) => ({ ...old, marca: e.target.value }));
                    }}
                  >
                    <option value="">Todas</option>
                    {filterOptions.marca.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Proyecto
                  <select
                    value={filters.proyecto}
                    onChange={(e) => {
                      setPage(1);
                      setFilters((old) => ({ ...old, proyecto: e.target.value }));
                    }}
                  >
                    <option value="">Todos</option>
                    {filterOptions.proyecto.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Tipo de producto
                  <select
                    value={filters.tipoProducto}
                    onChange={(e) => {
                      setPage(1);
                      setFilters((old) => ({
                        ...old,
                        tipoProducto: e.target.value
                      }));
                    }}
                  >
                    <option value="">Todos</option>
                    {filterOptions.tipoProducto.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Número de OPA
                  <select
                    value={filters.opa}
                    onChange={(e) => {
                      setPage(1);
                      setFilters((old) => ({ ...old, opa: e.target.value }));
                    }}
                  >
                    <option value="">Todos</option>
                    {filterOptions.opa.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>

                <label className="searchField">
                  Buscar en la página
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="SKU, producto, personaje..."
                  />
                </label>
              </div>
            </div>

            <div className="tableCard">
              <div className="tableCardHeader">
                <div>
                  <h2>Información de {data.table.name}</h2>
                  <span>
                    Mostrando {visibleRows.length} de {data.rows.length} registros
                    de esta página.
                  </span>
                </div>
                <span className="recordCount">
                  {data.total.toLocaleString("es-CO")} registros
                </span>
              </div>

              <div className="tableScroll">
                {loading ? (
                  <div className="loading">Cargando información...</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        {columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, index) => (
                        <tr key={String(row._id || index)}>
                          {columns.map((column) => (
                            <td key={column}>{displayValue(row[column])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="pagination">
                <button
                  disabled={data.page <= 1 || loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  ← Anterior
                </button>

                <span>
                  Página <strong>{data.page}</strong> de{" "}
                  <strong>{data.totalPages}</strong>
                </span>

                <button
                  disabled={data.page >= data.totalPages || loading}
                  onClick={() =>
                    setPage((value) => Math.min(data.totalPages, value + 1))
                  }
                >
                  Siguiente →
                </button>
              </div>
            </div>
          </>
        )}

        {!selectedTable && !loading && (
          <div className="summaryCard">
            <h2>Tablas disponibles</h2>
            <p>
              Tu aplicación detectará automáticamente las tablas de la base de
              SeaTable. Haz clic en cualquiera de las pestañas superiores para
              abrir sus registros.
            </p>
            <div className="summaryGrid">
              {tables.map((table) => (
                <button
                  key={table.id || table.name}
                  onClick={() => setSelectedTable(table.name)}
                  className="summaryItem"
                >
                  <strong>{table.name}</strong>
                  <span>{table.columns.length} columnas</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
