import React, { useCallback, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { api } from "../../../services/api";
import { useSession } from "../../../app/providers/SessionProvider";
import { useNotify } from "../../../app/providers/NotifyProvider";
import { useOperationalData } from "../../../app/providers/OperationalDataProvider";
import { appPath } from "../../../app/navigation";
import { useResource } from "../../../hooks/useResource";
import { useBack } from "../../../hooks/useBack";
import { PageHeader } from "../../../components/ui/PageHeader";
import { RouteTabs } from "../../../components/ui/Tabs";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { ProcessStepper } from "../../../components/ui/Stepper";
import { ErrorState, LoadingBlock, Alert } from "../../../components/ui/feedback";
import { Icon } from "../../../components/ui/Icon";
import { dt, locationLabel } from "../../../utils/format";
import { Urgency } from "../components/Urgency";
import { CANCELLABLE_REQUEST } from "../components/CancellationNote";
import { tabsFor, TAB_DEFS } from "./flightTabs";
import { useFlightDraftGuard } from "./useFlightDraftGuard";
import { useFlightDetail } from "./useFlightDetail";
import { CancelFlightDialog } from "./CancelFlightDialog";
import { SummaryTab } from "../tabs/SummaryTab";
import { NegotiationTab } from "../tabs/NegotiationTab";
import { PlanningTab } from "../tabs/PlanningTab";
import { TeamTab } from "../tabs/TeamTab";
import { DocumentsTab } from "../tabs/DocumentsTab";
import { OperationTab } from "../tabs/OperationTab";
import { HistoryTab } from "../tabs/HistoryTab";

const CONTENT = { resumen: SummaryTab, negociacion: NegotiationTab, planificacion: PlanningTab, equipo: TeamTab, documentos: DocumentsTab, operacion: OperationTab, historial: HistoryTab };
const OPS_NOT_CANCELLABLE = ["EN_CURSO", "FINALIZADO", "COMPLETADO", "CANCELADO", "RECHAZADO"];

/**
 * Detalle de una solicitud o vuelo, organizado por pestañas con URL propia (`/app/solicitudes/:id/:pestaña`, `/app/vuelos/:id/:pestaña`).
 * Qué pestañas existen y cuáles están habilitadas lo deriva flightTabs del estado real; antes del acuerdo de horario sólo la
 * negociación y el resumen están disponibles. Las acciones críticas (cancelar) viven en el encabezado.
 */
export function FlightDetailPage() {
  useFlightDraftGuard();
  const { id, tab } = useParams();
  const { workspace } = useSession();
  const notify = useNotify();
  const location = useLocation();
  const { flights, reload: reloadList } = useOperationalData();
  const { detail, error, loading, reload } = useFlightDetail(id, flights);
  const reports = useResource(workspace === "COMANDANTE" ? "/final-reports/mine" : null);
  const commanderBlocked = workspace === "COMANDANTE" && Array.isArray(reports.data) && reports.data.some((item) => item.bloqueado);
  const reasonsResource = useResource("/catalogs/cancellation-reasons", { map: (rows) => (Array.isArray(rows) ? rows : []) });
  const [busy, setBusy] = useState(false), [cancelling, setCancelling] = useState(false);
  const [logRevision, setLogRevision] = useState(0), [routeRevision, setRouteRevision] = useState(0);

  const section = location.pathname.startsWith(appPath("solicitudes")) ? "solicitudes" : "vuelos";
  const basePath = appPath(`${section}/${id}`);
  const back = useBack(appPath(section));
  const listLabel = section === "solicitudes" ? (workspace === "DTS" ? "Mis solicitudes" : "Solicitudes") : (workspace === "COMANDANTE" ? "Mis vuelos" : "Vuelos");

  const flight = detail?.vuelo, events = detail?.negociacion || [];
  const model = useMemo(() => (flight ? tabsFor({ workspace, flight, events }) : null), [workspace, flight, events]);

  const done = useCallback(async () => { await reloadList(); }, [reloadList]);
  const bumpLog = () => setLogRevision((x) => x + 1);
  const afterChange = useCallback(async () => { await done(); await reload(); bumpLog(); }, [done, reload]);
  const afterRouteChange = useCallback(async () => { setRouteRevision((x) => x + 1); bumpLog(); await done(); await reload(); }, [done, reload]);

  /** Ejecuta una operación POST y vuelve a leer el estado real. Devuelve false si falló (tras releer, por si la causa fue un estado desactualizado). */
  const call = useCallback(async (path, body, success) => {
    try { await api(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }); notify(success); await done(); await reload(); bumpLog(); return true; }
    catch (e) { notify(e.message, true); await reload(); return false; }
  }, [notify, done, reload]);
  const respond = useCallback(async (path, body, success) => {
    setBusy(true);
    try { await api(path, { method: "POST", body: JSON.stringify(body) }); notify(success); } catch (e) { notify(e.message, true); } finally { await done(); await reload(); setBusy(false); }
  }, [notify, done, reload]);

  if (error && !detail) return (<><PageHeader title="Detalle no disponible" breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: listLabel, to: appPath(section) }, { label: `Vuelo ${id}` }]} /><ErrorState message={error} onRetry={reload} /></>);
  if (loading || !flight || !model) return (<><PageHeader title="Cargando…" breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: listLabel, to: appPath(section) }, { label: `Vuelo ${id}` }]} /><LoadingBlock label="Cargando el detalle…" /></>);

  const invalidTab = tab && !model.tabs.some((item) => item.key === tab);
  const activeKey = invalidTab ? model.defaultKey : tab || model.defaultKey;
  const tabs = model.tabs.map((item) => ({ ...item, to: item.key === model.defaultKey ? basePath : `${basePath}/${item.key}` }));
  const current = tabs.find((item) => item.key === activeKey);
  const Content = CONTENT[activeKey];
  const sanitary = Boolean(flight.datosSanitarios);

  const ctx = { workspace, commanderBlocked, flight, detail, events, show: model.show, stage: model.stage, tabs, defaultKey: model.defaultKey, id, notify, reasons: reasonsResource.data || [], call, respond, busy,
    reload, done, logRevision, routeRevision, afterChange, afterRouteChange };

  const canCancel = workspace === "DTS" ? CANCELLABLE_REQUEST.includes(flight.estado) : workspace === "OPERACIONES" && model.show.has("cancelar") && !OPS_NOT_CANCELLABLE.includes(flight.estado);
  const cancelLabel = workspace === "DTS" ? "Cancelar solicitud" : "Cancelar vuelo";
  const confirmCancel = async (body) => {
    setBusy(true);
    try { await api(`/flights/${id}/cancel`, { method: "POST", body: JSON.stringify(body) }); notify(workspace === "DTS" ? "Solicitud cancelada" : "Vuelo cancelado"); setCancelling(false); }
    catch (e) { notify(e.message, true); setCancelling(false); }
    finally { await done(); await reload(); bumpLog(); setBusy(false); }
  };

  return (
    <>
      {invalidTab && <Navigate to={basePath} replace />}
      <PageHeader
        title={`${section === "solicitudes" ? "Solicitud" : "Vuelo"} ${flight.codigo || id}`}
        breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: listLabel, to: appPath(section) }, { label: flight.codigo || `Vuelo ${id}`, to: current?.key === model.defaultKey ? undefined : basePath }, ...(current && current.key !== model.defaultKey ? [{ label: current.label }] : [])]}
        titleExtra={<StatusBadge state={flight.estado} />}
        description={<><span>{locationLabel(flight.origen)} → {locationLabel(flight.destino)}</span> · <span>{flight.salida ? `Salida ${dt(flight.salida)}` : `Horario solicitado ${dt(flight.solicitada)}`}</span></>}
        meta={flight.extremaUrgencia ? <Urgency flight={flight} /> : null}
        actions={<>
          <button type="button" className="secondary-action" onClick={() => reload()}><Icon name="refresh" size={16} />Actualizar</button>
          {canCancel && <button type="button" className="secondary-action danger-action" onClick={() => setCancelling(true)}>{cancelLabel}</button>}
          <button type="button" className="secondary-action" onClick={back}><Icon name="arrowLeft" size={16} />Volver</button>
        </>}
      />
      {sanitary && <ProcessStepper stage={model.stage} />}
      {commanderBlocked && <Alert tone="warning" title="Operaciones restringidas por informe vencido"><Link to={appPath("informes")}>Consultar informes finales</Link></Alert>}
      <RouteTabs tabs={tabs} label={`Secciones de ${flight.codigo || "la solicitud"}`} />
      <div className="tab-panel" id="tab-panel" role="region" aria-label={current?.label || TAB_DEFS[activeKey]?.label}>
        {current?.locked
          ? <Alert tone="info" title={`${current.label}: todavía no disponible`}>{current.reason} <Link to={basePath}>Volver al resumen</Link></Alert>
          : <Content key={id} ctx={ctx} basePath={basePath} />}
      </div>
      {cancelling && <CancelFlightDialog title={cancelLabel} confirmLabel="Confirmar cancelación" busy={busy} reasons={ctx.reasons} onClose={() => setCancelling(false)} onConfirm={confirmCancel}
        description={workspace === "DTS" ? "La solicitud se cancelará y se informará a Operaciones. Indique el motivo." : "El vuelo se cancelará y se informará a las partes involucradas. Indique el motivo."} />}
    </>
  );
}
