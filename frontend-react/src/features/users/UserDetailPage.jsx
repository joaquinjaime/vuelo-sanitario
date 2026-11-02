import React from "react";
import { useParams } from "react-router-dom";
import { useNotify } from "../../app/providers/NotifyProvider";
import { appPath } from "../../app/navigation";
import { useResource } from "../../hooks/useResource";
import { useBack } from "../../hooks/useBack";
import { PageHeader } from "../../components/ui/PageHeader";
import { ROLE_LABEL, UserDetail } from "./users";

const fallbackRoles = Object.keys(ROLE_LABEL).filter((c) => c !== "OPERACIONES").map((codigo) => ({ codigo, nombre: ROLE_LABEL[codigo] }));

/** Detalle de una cuenta: datos, rectificación de DNI, edición, acceso y baja, historial administrativo. */
export function UserDetailPage() {
  const { id } = useParams();
  const notify = useNotify();
  const back = useBack(appPath("usuarios"));
  const roles = useResource("/auth/roles", { map: (rows) => (Array.isArray(rows) ? rows : fallbackRoles) });
  return (
    <>
      <PageHeader title="Cuenta de usuario" breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: "Usuarios", to: appPath("usuarios") }, { label: "Detalle" }]} />
      <UserDetail key={id} id={id} roleOptions={roles.data || fallbackRoles} notify={notify} onClose={back} />
    </>
  );
}
