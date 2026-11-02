import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { useNotify } from "../../app/providers/NotifyProvider";
import { useSession } from "../../app/providers/SessionProvider";
import { useResource } from "../../hooks/useResource";
import { appPath } from "../../app/navigation";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card, Field } from "../../components/ui/Card";
import { MyContacts } from "./MyContacts";

const FIELDS = [["passwordActual", "Contraseña actual"], ["nuevaPassword", "Nueva contraseña"], ["confirmacionPassword", "Confirmar contraseña"]];

/** Mi cuenta (todas las áreas): contactos de la propia persona y cambio de contraseña. Cambiarla cierra la sesión para ingresar de nuevo. */
export function MyAccountPage() {
  const notify = useNotify();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const me = useResource("/auth/me");
  const [password, setPassword] = useState({ passwordActual: "", nuevaPassword: "", confirmacionPassword: "" }), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); if (busy) return;
    setBusy(true);
    try { await api("/auth/me/password", { method: "POST", body: JSON.stringify(password) }); signOut(); navigate("/login", { replace: true }); }
    catch (x) { notify(x.message, true); setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Mi cuenta" description="Sus datos de contacto y la seguridad de su cuenta." breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: "Mi cuenta" }]} />
      <MyContacts notify={notify} />
      <Card title="Seguridad de la cuenta">
        {me.data && <p>{me.data.nombre} {me.data.apellido} · usuario {me.data.username}</p>}
        <h3>Cambiar contraseña</h3>
        <form className="form-grid narrow" onSubmit={submit}>
          {FIELDS.map(([key, label]) => <Field key={key} label={label} required><input type="password" required autoComplete={key === "passwordActual" ? "current-password" : "new-password"} value={password[key]} onChange={(e) => setPassword({ ...password, [key]: e.target.value })} /></Field>)}
          <div className="form-actions span-2"><button disabled={busy}>Actualizar contraseña</button></div>
        </form>
        <p className="hint">Al cambiar la contraseña se cierra la sesión y deberá ingresar nuevamente.</p>
      </Card>
    </>
  );
}
