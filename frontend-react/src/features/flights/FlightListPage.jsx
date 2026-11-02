import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { SegmentedControl } from "../../components/ui/Tabs";
import { DataTable, FilterBar, Pagination, SearchInput, paginate } from "../../components/ui/data";
import { EmptyState, LoadingBlock } from "../../components/ui/feedback";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Icon } from "../../components/ui/Icon";
import { useQueryState } from "../../hooks/useQueryState";
import { useOperationalData } from "../../app/providers/OperationalDataProvider";
import { dt, locationLabel } from "../../utils/format";
import { Urgency } from "./components/Urgency";
import { appPath } from "../../app/navigation";

export const PAGE_SIZE = 12;

const searchable = (flight) => [flight.codigo, locationLabel(flight.origen), locationLabel(flight.destino), flight.motivoVuelo, flight.tipo?.nombre, flight.prioridad].filter(Boolean).join(" ").toLowerCase();

/**
 * Listado de vuelos o solicitudes con búsqueda, filtros por situación y paginación. Los filtros y la página viven en la URL:
 * al abrir un detalle y volver (o recargar) el listado se conserva. Los datos son los del proveedor operativo (se refrescan solos).
 *
 * config: { title, description, breadcrumbs, filters: [{ value, label, predicate }], detailPath: (flight) => ruta,
 *           columns?: columnas extra, actions?: nodos, emptyTitle, emptyText, order? }
 */
export function FlightListPage({ config, extraColumns = [], children, extraActions }) {
  const { flights, loading, updatedAt, reload } = useOperationalData();
  const [query, setQuery] = useQueryState({ q: "", filtro: config.filters[0].value, pagina: "0" });
  const active = config.filters.find((x) => x.value === query.filtro) || config.filters[0];

  const counted = useMemo(() => config.filters.map((filter) => ({ ...filter, count: flights.filter(filter.predicate).length })), [config.filters, flights]);
  const filtered = useMemo(() => {
    const text = query.q.trim().toLowerCase();
    const rows = flights.filter(active.predicate).filter((flight) => !text || searchable(flight).includes(text));
    return config.order ? [...rows].sort(config.order) : rows;
  }, [flights, active, query.q, config]);
  const page = paginate(filtered, Number(query.pagina) || 0, PAGE_SIZE);

  const columns = [
    { key: "codigo", header: "Código", render: (flight) => <><Link className="row-link" to={config.detailPath(flight)}>{flight.codigo || `Vuelo ${flight.id}`}</Link>{flight.extremaUrgencia && <Urgency flight={flight} />}</> },
    { key: "trayecto", header: "Trayecto", render: (flight) => `${locationLabel(flight.origen)} → ${locationLabel(flight.destino)}` },
    { key: "fecha", header: config.dateHeader || "Salida solicitada", render: (flight) => (flight.salida ? dt(flight.salida) : flight.solicitada ? dt(flight.solicitada) : "—") },
    ...extraColumns,
    { key: "estado", header: "Estado", render: (flight) => <StatusBadge state={flight.estado} /> },
    { key: "accion", header: <span className="visually-hidden">Acciones</span>, className: "col-action", render: (flight) => <Link className="button-link secondary-action" to={config.detailPath(flight)} aria-label={`Abrir ${flight.codigo || flight.id}`}>Abrir<Icon name="chevronRight" size={16} /></Link> },
  ];

  return (
    <>
      <PageHeader title={config.title} description={config.description} breadcrumbs={config.breadcrumbs}
        actions={<>{extraActions}<button type="button" className="secondary-action" onClick={reload}><Icon name="refresh" size={16} />Actualizar</button></>} />
      {children}
      <Card>
        <FilterBar label={`Filtrar ${config.title.toLowerCase()}`}>
          <SearchInput label={config.searchLabel || "Buscar por código, localidad o motivo"} placeholder="Buscar por código, localidad o motivo" value={query.q} onChange={(value) => setQuery({ q: value })} />
        </FilterBar>
        <SegmentedControl label="Situación" value={active.value} onChange={(value) => setQuery({ filtro: value })} options={counted.map((x) => ({ value: x.value, label: x.label, count: x.count }))} />
        {updatedAt && <p className="hint list-updated">Se actualiza automáticamente · última actualización {updatedAt}.</p>}
        {loading ? <LoadingBlock label="Cargando…" /> : (
          <DataTable caption={config.title} columns={columns} rows={page.items} rowClassName={(flight) => (flight.extremaUrgencia ? "urgent-row" : "")}
            empty={<EmptyState title={flights.length === 0 ? config.emptyTitle : "Ningún resultado coincide con la búsqueda"} action={flights.length === 0 ? config.emptyAction : undefined}>{flights.length === 0 ? config.emptyText : "Pruebe con otro texto o cambie la situación seleccionada."}</EmptyState>} />
        )}
        <Pagination page={page.current} pages={page.pages} total={filtered.length} noun={config.noun || "vuelos"} onPage={(value) => setQuery({ pagina: value }, { keepPage: true })} />
      </Card>
    </>
  );
}

export const requestsHome = (label) => [{ label: "Inicio", to: appPath("inicio") }, { label }];
export { EmptyState };
