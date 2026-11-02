import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { useNotify } from "../../app/providers/NotifyProvider";
import { appPath } from "../../app/navigation";
import { useResource } from "../../hooks/useResource";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card, Field } from "../../components/ui/Card";
import { PhoneField } from "../../components/forms/PhoneField";
import { DEFAULT_COUNTRY, emailProblem, phoneProblem } from "../../utils/contactRules";
import { ROLE_LABEL, SecretNotice } from "./users";

export const CREATABLE_ROLES = ["ADMINISTRADOR", "DTS", "CENTRO_OPERACIONES", "COMANDANTE"];
const emptyForm = () => ({ nombre: "", apellido: "", dni: "", fechaNacimiento: "", licenciaAeronautica: "", provinciaId: "", roles: [], correos: [{ direccion: "", tipo: "PERSONAL" }], telefonos: [{ numero: "", pais: DEFAULT_COUNTRY, tipo: "PERSONAL" }] });

/**
 * Alta de usuario (administrador): crea una cuenta pendiente de activación y muestra una única vez el código de activación.
 * Si el DNI ya existe, el servidor lo informa y se ofrece asociar la identidad existente o revisar la cuenta desactivada.
 */
export function UserCreatePage({ provinces: provincesProp }) {
  const notify = useNotify();
  const navigate = useNavigate();
  const loaded = useResource(provincesProp ? null : "/catalogs/provinces", { map: (rows) => (Array.isArray(rows) ? rows : []) });
  const provinces = provincesProp || loaded.data || [];
  const [form, setForm] = useState(emptyForm), [creating, setCreating] = useState(false), [activationCode, setActivationCode] = useState("");
  const commander = form.roles.includes("COMANDANTE");
  const toggle = (role) => setForm({ ...form, roles: form.roles.includes(role) ? form.roles.filter((x) => x !== role) : [...form.roles, role] });
  const payload = (extra = {}) => ({ ...form, fechaNacimiento: form.fechaNacimiento || null, provinciaId: commander && form.provinciaId ? Number(form.provinciaId) : null, ...extra });
  const receive = (result) => { if (!result?.codigo) throw new Error("El servidor no devolvió el código de activación. Regeneralo antes de continuar."); setActivationCode(result.codigo); };

  const create = async (e) => {
    e.preventDefault();
    if (creating) return;
    const problem = emailProblem(form.correos[0].direccion) || phoneProblem(form.telefonos[0].numero, form.telefonos[0].pais);
    if (problem) { notify(problem, true); return; }
    setCreating(true);
    try {
      receive(await api("/auth/users", { method: "POST", body: JSON.stringify(payload()) }));
      setForm(emptyForm());
      notify("Cuenta pendiente creada. Guardá el código de activación antes de continuar.");
    } catch (x) {
      if (x.code === "PERSON_EXISTS_WITHOUT_ACCOUNT" && x.personaId) {
        if (x.coincideNombre && confirm("Ya existe una persona registrada con ese DNI y el mismo nombre, sin cuenta en el sistema. ¿Asociar la nueva cuenta a esa identidad existente? No se creará una persona nueva.")) {
          try {
            receive(await api("/auth/users", { method: "POST", body: JSON.stringify(payload({ personaExistenteId: x.personaId })) }));
            setForm(emptyForm());
            notify("Cuenta pendiente creada y asociada a la identidad existente. Guardá el código de activación antes de continuar.");
          } catch (y) { notify(y.message, true); }
          return;
        }
        notify(x.coincideNombre ? x.message : "Ya existe una persona con ese DNI pero con un nombre distinto; verifique los datos antes de continuar.", true);
        return;
      }
      if (x.code === "INACTIVE_USER_WITH_DNI_EXISTS" && x.userId) {
        if (confirm(`${x.message}\n\n${x.nombre} ${x.apellido} · ${x.username || "sin usuario"}\n\n¿Revisar y reactivar la cuenta existente?`)) { navigate(appPath(`usuarios/${x.userId}`)); return; }
      }
      notify(x.message, true);
    } finally { setCreating(false); }
  };

  return (
    <>
      <PageHeader title="Añadir usuario" description="La cuenta quedará pendiente hasta que la persona complete su activación con el código que se genera al crearla."
        breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: "Usuarios", to: appPath("usuarios") }, { label: "Añadir usuario" }]} />
      <form className="form-page" onSubmit={create} aria-busy={creating} aria-label="Alta de usuario">
        <Card title="Identificación">
          <div className="form-grid">
            <Field label="Nombre" required><input required disabled={creating} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
            <Field label="Apellido" required><input required disabled={creating} value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} /></Field>
            <Field label="DNI" required><input required disabled={creating} inputMode="numeric" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></Field>
            <Field label="Fecha de nacimiento"><input type="date" disabled={creating} value={form.fechaNacimiento} onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })} /></Field>
          </div>
        </Card>
        <Card title="Contacto principal">
          <div className="form-grid">
            <Field label="Correo principal" required className="span-2" hint="El correo se verifica después desde «Mi cuenta»."><input type="email" required disabled={creating} value={form.correos[0].direccion} onChange={(e) => setForm({ ...form, correos: [{ direccion: e.target.value, tipo: "PERSONAL" }] })} /></Field>
            <div className="span-2 admin-phone">
              <PhoneField label="Teléfono principal" idPrefix="alta-telefono" disabled={creating} value={{ pais: form.telefonos[0].pais, numero: form.telefonos[0].numero }} onChange={(v) => setForm({ ...form, telefonos: [{ numero: v.numero, pais: v.pais, tipo: "PERSONAL" }] })} />
              <small className="hint">Elegí el país antes del número. El prefijo se muestra una sola vez.</small>
            </div>
          </div>
        </Card>
        <Card title="Acceso">
          <fieldset className="role-options" disabled={creating}>
            <legend>Roles</legend>
            {CREATABLE_ROLES.map((role) => <label className="check" key={role}><input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggle(role)} />{ROLE_LABEL[role] || role}</label>)}
          </fieldset>
          {commander && (
            <div className="form-grid">
              <Field label="Número de licencia" required><input required disabled={creating} value={form.licenciaAeronautica} onChange={(e) => setForm({ ...form, licenciaAeronautica: e.target.value })} /></Field>
              <Field label="Provincia o CABA de ubicación operativa" required>
                <select required disabled={creating} value={form.provinciaId} onChange={(e) => setForm({ ...form, provinciaId: e.target.value })}><option value="">Seleccionar</option>{provinces.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
              </Field>
              <small className="hint span-2">Al crear la cuenta el comandante queda disponible para recibir asignaciones: no hay clasificaciones ni documentos que cargar. La licencia es un dato de su perfil que la aplicación no verifica.</small>
            </div>
          )}
        </Card>
        <div className="form-actions sticky-actions">
          <button type="button" className="secondary-action" disabled={creating} onClick={() => navigate(appPath("usuarios"))}>Cancelar</button>
          <button disabled={creating}>{creating ? "Creando cuenta…" : "Crear cuenta pendiente"}</button>
        </div>
      </form>
      {activationCode && (
        <SecretNotice eyebrow="CUENTA PENDIENTE CREADA" title="Código de activación" secret={activationCode} label=""
          intro="Este código numérico de 6 dígitos vence en 10 minutos y se mostrará una sola vez. Guardalo antes de cerrar este aviso."
          onClose={() => { setActivationCode(""); navigate(appPath("usuarios")); }} />
      )}
    </>
  );
}
