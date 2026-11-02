import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import { appPath } from "../../app/navigation";
import { useQueryState } from "../../hooks/useQueryState";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { SegmentedControl } from "../../components/ui/Tabs";
import { DataTable, FilterBar, Pagination, SearchInput } from "../../components/ui/data";
import { EmptyState, ErrorState, LoadingBlock } from "../../components/ui/feedback";
import { Icon } from "../../components/ui/Icon";
import { ROLE_LABEL, STATE_LABEL, roleText } from "./users";

const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
const message = (e, fallback) => e?.message || fallback;
// estado de la URL -> parámetro `status` del servidor
const STATUS = { activos: "ACTIVOS", pendientes: "PENDIENTES", desactivados: "INACTIVOS" };
const PAGE_SIZE = 20;

/**
 * Usuarios (administrador): listado paginado por el servidor con búsqueda, filtro por rol y por estado (activas, pendientes de
 * activación, desactivadas). El estado, la búsqueda, el rol y la página viven en la URL, de modo que al abrir un usuario y volver
 * el listado conserva su contexto. El detalle y las acciones sobre la cuenta están en su propia pantalla.
 */
export function UsersListPage() {
  const [query, setQuery] = useQueryState({ estado: "activos", q: "", rol: "", pagina: "0" });
  const [text, setText] = useState(query.q), [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [roleOptions, setRoleOptions] = useState([]), [attempt, setAttempt] = useState(0);
  const estado = STATUS[query.estado] ? query.estado : "activos", page = Number(query.pagina) || 0;

  useEffect(() => { let on = true; api("/auth/roles").then((r) => { if (on) setRoleOptions(Array.isArray(r) ? r : []); }).catch(() => { if (on) setRoleOptions(Object.keys(ROLE_LABEL).filter((c) => c !== "OPERACIONES").map((codigo) => ({ codigo, nombre: ROLE_LABEL[codigo] }))); }); return () => { on = false; }; }, []);
  useEffect(() => { const t = setTimeout(() => { if (text.trim() !== query.q) setQuery({ q: text.trim() }); }, 300); return () => clearTimeout(t); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let on = true; setLoading(true); setError("");
    const params = new URLSearchParams({ status: STATUS[estado], page: String(page), size: String(PAGE_SIZE) });
    if (query.q) params.set("q", query.q);
    if (query.rol) params.set("role", query.rol);
    api(`/auth/users/search?${params}`).then((d) => { if (on) setData(d); }).catch((e) => { if (on) { setData(null); setError(message(e, "No se pudo cargar los usuarios")); } }).finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [estado, query.q, query.rol, page, attempt]);

  const items = data?.items || [], inactive = estado === "desactivados", filtered = Boolean(query.q || query.rol);
  const noun = inactive ? "cuentas dadas de baja" : estado === "pendientes" ? "cuentas pendientes de activación" : "cuentas activas o pendientes de activación";
  const columns = [
    { key: "nombre", header: "Nombre", render: (x) => <Link className="row-link" to={appPath(`usuarios/${x.id}`)}>{x.nombre} {x.apellido}</Link> },
    { key: "dni", header: "DNI", render: (x) => x.dni || "—" },
    { key: "usuario", header: "Usuario", render: (x) => x.username || "—" },
    { key: "roles", header: "Roles", render: (x) => roleText(x.roles) },
    { key: "estado", header: "Estado", render: (x) => <>{STATE_LABEL[x.estado] || x.estado}{x.debeCambiarContrasena ? <small className="block hint">Cambio de contraseña pendiente</small> : null}</> },
    ...(inactive ? [{ key: "baja", header: "Baja", render: (x) => <>{dt(x.fechaBaja)}<small className="block hint">{x.bajaPor || "No registrado"}{x.motivoBaja ? ` · ${x.motivoBaja}` : ""}</small></> }] : []),
    { key: "accion", header: <span className="visually-hidden">Acciones</span>, className: "col-action", render: (x) => <Link className="button-link secondary-action" to={appPath(`usuarios/${x.id}`)} aria-label={`Abrir ${x.nombre} ${x.apellido}`}>{inactive ? "Revisar" : "Abrir"}<Icon name="chevronRight" size={16} /></Link> },
  ];

  return (
    <>
      <PageHeader title="Usuarios" description="Cuentas del sistema. Abra una cuenta para editarla, restablecer credenciales, desactivarla o reactivarla." breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: "Usuarios" }]}
        actions={<Link className="button-link" to={appPath("usuarios/nuevo")}><Icon name="plus" size={16} />Añadir usuario</Link>} />
      <Card className="user-directory">
        <FilterBar label="Filtrar usuarios">
          <SearchInput label="Buscar usuarios" placeholder="Buscar por nombre, DNI o usuario" value={text} onChange={setText} />
          <select aria-label="Filtrar por rol" value={query.rol} onChange={(e) => setQuery({ rol: e.target.value })}>
            <option value="">Todos los roles</option>{roleOptions.map((r) => <option key={r.codigo} value={r.codigo}>{ROLE_LABEL[r.codigo] || r.nombre}</option>)}
          </select>
        </FilterBar>
        <SegmentedControl label="Estado de la cuenta" value={estado} onChange={(value) => setQuery({ estado: value })}
          options={[{ value: "activos", label: "Activas" }, { value: "pendientes", label: "Pendientes de activación" }, { value: "desactivados", label: "Desactivadas" }]} />
        <p className="hint list-updated" role="status">{data ? `${data.total} ${noun}` : "Cargando…"}</p>
        {loading && <LoadingBlock label="Cargando usuarios…" />}
        {error && <ErrorState message={error} onRetry={() => setAttempt((x) => x + 1)} />}
        {!loading && !error && data && (
          <DataTable caption={inactive ? "Usuarios desactivados" : "Usuarios activos"} columns={columns} rows={items}
            empty={<EmptyState title={filtered ? "Ningún usuario coincide con la búsqueda" : `No hay usuarios ${inactive ? "desactivados" : estado === "pendientes" ? "pendientes de activación" : "activos"} para mostrar`}
              action={!filtered && !inactive ? <Link className="button-link" to={appPath("usuarios/nuevo")}>Añadir usuario</Link> : undefined}>{filtered ? "Pruebe con otro nombre, DNI o usuario, o quite el filtro de rol." : null}</EmptyState>} />
        )}
        {data && data.totalPages > 0 && <Pagination page={page} pages={data.totalPages} total={data.total} noun="usuarios" disabled={loading} onPage={(value) => setQuery({ pagina: value }, { keepPage: true })} />}
      </Card>
    </>
  );
}
