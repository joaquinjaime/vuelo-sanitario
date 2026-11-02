import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { useSession } from "../../app/providers/SessionProvider";
import { AuthLayout } from "./AuthLayout";

/** Cambio obligatorio de la contraseña temporal: es lo único permitido hasta completarlo. Después se vuelve a ingresar. */
export function PasswordChangePage() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ passwordActual: "", nuevaPassword: "", confirmacionPassword: "" }), [error, setError] = useState("");
  if (!session) return <Navigate to="/login" replace />;
  if (!session.debeCambiarContrasena) return <Navigate to="/app/inicio" replace />;
  return (
    <AuthLayout eyebrow="SEGURIDAD DE LA CUENTA" title="Actualizá tu contraseña" lead="La contraseña temporal sólo permite este cambio antes de continuar.">
      <form className="auth-card" onSubmit={async (e) => {
        e.preventDefault();
        try { await api("/auth/me/password", { method: "POST", body: JSON.stringify(form) }); signOut(); navigate("/login", { replace: true }); }
        catch (x) { setError(x.message); }
      }}>
        <h2>Nueva contraseña</h2>
        {error && <p className="error" role="alert">{error}</p>}
        {[["passwordActual", "Contraseña temporal"], ["nuevaPassword", "Nueva contraseña"], ["confirmacionPassword", "Confirmar contraseña"]].map(([key, label]) => (
          <label key={key}>{label}<input type="password" required value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>
        ))}
        <button>Guardar y volver a ingresar</button>
      </form>
    </AuthLayout>
  );
}
