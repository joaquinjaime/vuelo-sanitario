import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { appPath } from "../../app/navigation";
import { useResource } from "../../hooks/useResource";
import { useQueryState } from "../../hooks/useQueryState";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { SegmentedControl } from "../../components/ui/Tabs";
import { DataTable, FilterBar, SearchInput, Pagination, paginate } from "../../components/ui/data";
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/feedback";
import { Icon } from "../../components/ui/Icon";
import { AIRCRAFT_STATE_LABEL, STATE_CLASS } from "./aircraft";

const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
const PAGE_SIZE = 15;

/** Aeronaves (administrador): catálogo con búsqueda y separación entre activas y desactivadas. El detalle y las acciones están en su pantalla. */
export function AircraftListPage() {
  const aircraft = useResource("/catalogs/aircraft/admin", { map: (rows) => (Array.isArray(rows) ? rows : []) });
  const [query, setQuery] = useQueryState({ estado: "activas", q: "", pagina: "0" });
  const list = aircraft.data || [];
  const inactive = query.estado === "desactivadas";
  const actives = list.filter((x) => x.activo), inactives = list.filter((x) => !x.activo);
  const visible = useMemo(() => (inactive ? inactives : actives).filter((x) => !query.q || `${x.matricula} ${x.modelo} ${x.tipo} ${x.aeropuertoActual || ""}`.toLowerCase().includes(query.q.toLowerCase())), [list, inactive, query.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const page = paginate(visible, Number(query.pagina) || 0, PAGE_SIZE);
  const columns = [
    { key: "matricula", header: "Matrícula", render: (x) => <Link className="row-link" to={appPath(`aeronaves/${x.id}`)}>{x.matricula}</Link> },
    { key: "modelo", header: "Modelo y tipo", render: (x) => <>{x.modelo}<small className="block hint">{x.tipo}</small></> },
    { key: "capacidad", header: "Capacidad", render: (x) => `${x.capacidadPacientes} pac. · ${x.capacidadTripulacion} trip.` },
    { key: "ubicacion", header: "Ubicación actual", render: (x) => x.aeropuertoActual || "Sin ubicación" },
    { key: "estado", header: "Estado", render: (x) => <><span className={STATE_CLASS[x.estadoOperativo] || "status"}>{AIRCRAFT_STATE_LABEL[x.estadoOperativo] || (x.activo ? "Activa" : "Inactiva")}</span>{x.vuelosComprometidos > 0 && <small className="block hint">{x.vuelosComprometidos} vuelo(s)</small>}</> },
    { key: "proximo", header: "Próximo vuelo", render: (x) => (x.proximoVuelo ? `${x.proximoVuelo.codigo} · ${dt(x.proximoVuelo.salida)}` : "—") },
    { key: "accion", header: <span className="visually-hidden">Acciones</span>, className: "col-action", render: (x) => <Link className="button-link secondary-action" to={appPath(`aeronaves/${x.id}`)} aria-label={`Abrir aeronave ${x.matricula}`}>Abrir<Icon name="chevronRight" size={16} /></Link> },
  ];
  return (
    <>
      <PageHeader title="Aeronaves" description="Estado administrativo, ubicación y vuelos asignados. «Activa» no implica disponible: la disponibilidad depende del horario del vuelo."
        breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: "Aeronaves" }]} actions={<Link className="button-link" to={appPath("aeronaves/nueva")}><Icon name="plus" size={16} />Nueva aeronave</Link>} />
      <Card>
        <FilterBar label="Filtrar aeronaves"><SearchInput label="Buscar aeronave" placeholder="Buscar por matrícula, modelo, tipo o ubicación" value={query.q} onChange={(value) => setQuery({ q: value })} /></FilterBar>
        <SegmentedControl label="Estado administrativo" value={inactive ? "desactivadas" : "activas"} onChange={(value) => setQuery({ estado: value })}
          options={[{ value: "activas", label: "Aeronaves activas", count: actives.length }, { value: "desactivadas", label: "Aeronaves desactivadas", count: inactives.length }]} />
        {aircraft.loading ? <LoadingBlock label="Cargando aeronaves…" /> : aircraft.error ? <ErrorState message={aircraft.error} onRetry={aircraft.reload} /> : (
          <DataTable caption={inactive ? "Aeronaves desactivadas" : "Aeronaves activas"} columns={columns} rows={page.items}
            empty={<EmptyState title={list.length === 0 ? "Todavía no hay aeronaves registradas" : query.q ? "Ninguna aeronave coincide con la búsqueda" : inactive ? "No hay aeronaves desactivadas para mostrar" : "No hay aeronaves activas para mostrar"}
              action={list.length === 0 ? <Link className="button-link" to={appPath("aeronaves/nueva")}>Registrar aeronave</Link> : undefined} />} />
        )}
        <Pagination page={page.current} pages={page.pages} total={visible.length} noun="aeronaves" onPage={(value) => setQuery({ pagina: value }, { keepPage: true })} />
      </Card>
    </>
  );
}
