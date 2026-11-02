import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { useSession } from "../../app/providers/SessionProvider";
import { appPath } from "../../app/navigation";
import { AuthLayout } from "./AuthLayout";

export const activationErrors = (form) => {
  const errors = {};
  if (!form.password) errors.password = "La contraseña es obligatoria.";
  else if (form.password.length < 12) errors.password = "La contraseña debe tener al menos 12 caracteres.";
  else if (form.password.length > 100) errors.password = "La contraseña no puede tener más de 100 caracteres.";
  if (!form.confirmacionPassword) errors.confirmacionPassword = "La confirmación de contraseña es obligatoria.";
  else if (form.password !== form.confirmacionPassword) errors.confirmacionPassword = "Las contraseñas no coinciden.";
  return errors;
};

/**
 * Ingreso y activación de cuenta. Tras ingresar vuelve a la pantalla que se había pedido (si venía de un enlace directo)
 * o al inicio del área; si el usuario debe cambiar su contraseña temporal, el guard lo lleva a esa pantalla.
 */
export function LoginPage({ onSignedIn }) {
  const { signIn, notice } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [u, su] = useState(""), [p, sp] = useState(""), [e, se] = useState(null), [activate, setActivate] = useState(false), [activationSubmitted, setActivationSubmitted] = useState(false), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ dni: "", codigo: "", username: "", password: "", confirmacionPassword: "" });
  const change = (key, value) => { setForm({ ...form, [key]: value }); if (activate) se(null); };
  const errors = activate ? activationErrors(form) : {};
  const showPasswordError = activationSubmitted || form.password.length > 0;
  const showConfirmationError = activationSubmitted || form.confirmacionPassword.length > 0;
  const submit = async (x) => {
    x.preventDefault();
    if (busy) return;
    try {
      if (activate) {
        setActivationSubmitted(true);
        if (Object.keys(errors).length) return;
        setBusy(true);
        await api("/auth/activar-cuenta", { method: "POST", body: JSON.stringify(form) });
        setActivate(false); se({ type: "success", text: "Cuenta activada correctamente. Ya puede iniciar sesión." }); return;
      }
      setBusy(true);
      const r = await api("/auth/login", { method: "POST", body: JSON.stringify({ username: u, password: p }) });
      signIn(r);
      if (onSignedIn) onSignedIn(r);
      else navigate(r.debeCambiarContrasena ? "/cambiar-contrasena" : (location.state?.from || appPath("inicio")), { replace: true });
    } catch (x) {
      se({ type: "error", text: x.message });
    } finally { setBusy(false); }
  };
  return (
    <AuthLayout title="Gestión de Vuelos Sanitarios" lead="Acceso seguro para operaciones, planificación y coordinación.">
      <form className="auth-card" onSubmit={submit} noValidate={false}>
        <h2>{activate ? "Activar cuenta" : "Ingresar"}</h2>
        {!e && notice && !activate && <p className="error" role="alert">{notice}</p>}
        {e && <p className={e.type === "success" ? "success" : "error"} role={e.type === "success" ? "status" : "alert"}>{e.text}</p>}
        {!activate && <label>Usuario<input value={u} onChange={(x) => su(x.target.value)} autoComplete="username" required /></label>}
        {!activate && <label>Contraseña<input type="password" value={p} onChange={(x) => sp(x.target.value)} autoComplete="current-password" required /></label>}
        {activate && <>
          <label>DNI<input required value={form.dni} onChange={(x) => change("dni", x.target.value)} /></label>
          <label>Código de activación<input aria-label="Código de activación" required inputMode="numeric" autoComplete="one-time-code" value={form.codigo} onChange={(x) => change("codigo", x.target.value)} aria-describedby="activation-code-hint" /><small id="activation-code-hint" className="hint">Los códigos nuevos tienen 6 dígitos, vencen en 10 minutos y se usan una sola vez. Si recibiste uno alfanumérico antes de esta actualización, podés usarlo hasta su vencimiento.</small></label>
          <label>Nombre de usuario<input required value={form.username} onChange={(x) => change("username", x.target.value)} /></label>
          <label>Contraseña<input required type="password" minLength="12" maxLength="100" value={form.password} onChange={(x) => change("password", x.target.value)} aria-describedby={showPasswordError && errors.password ? "password-hint password-error" : "password-hint"} aria-invalid={Boolean(showPasswordError && errors.password)} />
            <small id="password-hint" className="hint">La contraseña debe tener al menos 12 caracteres.</small>
            {showPasswordError && errors.password && <small id="password-error" className="error">{errors.password}</small>}
          </label>
          <label>Confirmar contraseña<input required type="password" value={form.confirmacionPassword} onChange={(x) => change("confirmacionPassword", x.target.value)} aria-describedby={showConfirmationError && errors.confirmacionPassword ? "confirmation-error" : undefined} aria-invalid={Boolean(showConfirmationError && errors.confirmacionPassword)} />
            {showConfirmationError && errors.confirmacionPassword && <small id="confirmation-error" className="error">{errors.confirmacionPassword}</small>}
          </label>
        </>}
        <button disabled={busy}>{activate ? "Activar cuenta" : "Iniciar sesión"}</button>
        <button type="button" className="link-button" onClick={() => { setActivate(!activate); setActivationSubmitted(false); se(null); }}>
          {activate ? "Volver a iniciar sesión" : "Activar cuenta"}
        </button>
      </form>
    </AuthLayout>
  );
}
