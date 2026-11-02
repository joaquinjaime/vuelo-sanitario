import React from "react";
import { useNotify } from "../../app/providers/NotifyProvider";
import { appPath } from "../../app/navigation";
import { PageHeader } from "../../components/ui/PageHeader";
import { GeographicCatalog } from "../catalogs/geography";
import { CommanderLocations } from "../catalogs/commanderLocations";
import { PatientMaintenance } from "../patients/patients";
import { AdminAudit } from "../audit/audit";
import { HealthStaffCatalog } from "../health-staff/healthStaff";

const crumbs = (label) => [{ label: "Inicio", to: appPath("inicio") }, { label }];

/** Geografía (administrador): provincias y localidades del catálogo. */
export function GeographyPage() {
  const notify = useNotify();
  return <><PageHeader title="Geografía" description="Provincias y localidades que usan las solicitudes y la ubicación de los comandantes." breadcrumbs={crumbs("Geografía")} /><GeographicCatalog notify={notify} /></>;
}

/** Ubicación operativa de los comandantes (administrador y Centro de Operaciones). */
export function CommanderLocationsPage() {
  const notify = useNotify();
  return <><PageHeader title="Ubicación de comandantes" description="Provincia o CABA donde se encuentra operativamente cada comandante: define a quién se puede asignar un vuelo." breadcrumbs={crumbs("Comandantes")} /><CommanderLocations notify={notify} /></>;
}

/** Mantenimiento de pacientes (administrador): corrección de identidad. */
export function PatientsPage() {
  const notify = useNotify();
  return <><PageHeader title="Pacientes" description="Búsqueda y mantenimiento de las fichas de pacientes." breadcrumbs={crumbs("Pacientes")} /><PatientMaintenance notify={notify} /></>;
}

/** Auditoría (administrador): eventos registrados, con filtros ejecutados en el servidor. */
export function AuditPage() {
  return <><PageHeader title="Auditoría" description="Operaciones administrativas y operativas registradas en el sistema." breadcrumbs={crumbs("Auditoría")} /><AdminAudit /></>;
}

/** Personal sanitario (DTS): médicos y enfermeros de su ámbito. */
export function HealthStaffPage() {
  const notify = useNotify();
  return <><PageHeader title="Personal sanitario" description="Médicos y enfermeros que usted puede seleccionar para los vuelos sanitarios." breadcrumbs={crumbs("Personal sanitario")} /><HealthStaffCatalog notify={notify} /></>;
}
