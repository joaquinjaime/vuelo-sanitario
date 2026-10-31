import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { MyContacts } from "./account";

vi.mock("./api", () => ({ api: vi.fn() }));

const person = (extra = {}) => ({
  id: 3, nombre: "Ana", apellido: "Paz", dni: "30111222", username: "ana", estado: "ACTIVO", activo: true, roles: ["DTS"],
  correos: [
    { id: 11, valor: "ana@example.test", tipo: "PERSONAL", principal: true, version: 0, verificacion: "VERIFICADO" },
    { id: 12, valor: "ana.trabajo@example.test", tipo: "LABORAL", principal: false, version: 2, verificacion: "SIN_VERIFICAR" },
  ],
  telefonos: [{ id: 21, valor: "+54 381 555-1234", tipo: "PERSONAL", principal: true, version: 0, pais: "AR" }],
  ...extra,
});
let state, calls;
function backend({ onWrite } = {}) {
  state = person(); calls = [];
  vi.mocked(api).mockImplementation((path, options) => {
    calls.push([path, options]);
    if (path === "/auth/me" && !options) return Promise.resolve(JSON.parse(JSON.stringify(state)));
    if (onWrite) { const r = onWrite(path, options); if (r !== undefined) return r; }
    return Promise.resolve(null);
  });
}
const writes = () => calls.filter(([, o]) => o && o.method);
const body = (i = 0) => JSON.parse(writes()[i][1].body);
const row = (text) => screen.getByText(text).closest("li");
beforeEach(() => { vi.mocked(api).mockReset(); window.confirm = vi.fn(() => true); });
afterEach(cleanup);

test("muestra a qué persona pertenecen los contactos, su estado de verificación y sus alcances sin afirmar más de lo comprobado", async () => {
  backend();
  render(<MyContacts />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando contactos");
  expect(await screen.findByText(/Ana Paz/)).toBeInTheDocument();
  expect(screen.getByText(/DNI 30111222/)).toBeInTheDocument();
  expect(screen.getByText(/pertenecen a su persona/)).toBeInTheDocument();
  expect(screen.getByText(/no cambia su contraseña/)).toBeInTheDocument();
  expect(screen.getByText(/Los correos se verifican con un código/)).toHaveTextContent(/no se verifican por SMS/);
  expect(within(row("ana@example.test")).getByText("Verificado")).toBeInTheDocument();
  expect(within(row("ana.trabajo@example.test")).getByText("Sin verificar")).toBeInTheDocument();
  expect(within(row("ana.trabajo@example.test")).getByText("Laboral")).toBeInTheDocument();
  expect(within(row("+54 381 555-1234")).getByText("Formato validado (Argentina)")).toBeInTheDocument();
  expect(screen.getAllByText("Principal")).toHaveLength(2);
});

test("una falla al cargar se informa sin dejar la pantalla en blanco", async () => {
  vi.mocked(api).mockRejectedValue(new Error("Servicio no disponible"));
  render(<MyContacts />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Servicio no disponible");
});

test("agrega un correo validando el formato antes de enviar y avisa que se envió un código", async () => {
  const notify = vi.fn();
  backend({ onWrite: (path, o) => { if (path === "/auth/me/correos" && o.method === "POST") { state.correos.push({ id: 13, valor: JSON.parse(o.body).direccion, tipo: "LABORAL", principal: false, version: 0, verificacion: "PENDIENTE" }); return Promise.resolve({ id: 13, envio: "ENVIADO", verificacion: "PENDIENTE" }); } } });
  render(<MyContacts notify={notify} />);
  await screen.findByText("ana@example.test");
  const form = screen.getByRole("form", { name: "Agregar correo electrónico" });
  for (const bad of ["sin-dominio@x", "a b@example.test", "dos@@example.test", ".punto@example.test", "ana@example..test"]) {
    fireEvent.change(within(form).getByLabelText("Nuevo correo electrónico"), { target: { value: bad } });
    fireEvent.click(within(form).getByRole("button", { name: "Agregar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  }
  fireEvent.change(within(form).getByLabelText("Nuevo correo electrónico"), { target: { value: " nuevo+vuelos@example.test " } });
  fireEvent.change(within(form).getByLabelText("Tipo del nuevo correo electrónico"), { target: { value: "LABORAL" } });
  fireEvent.click(within(form).getByRole("button", { name: "Agregar" }));
  expect(await screen.findByText("nuevo+vuelos@example.test")).toBeInTheDocument();
  expect(body()).toEqual({ direccion: "nuevo+vuelos@example.test", tipo: "LABORAL" });
  expect(notify).toHaveBeenCalledWith("Contacto agregado");
  expect(await screen.findByText(/Enviamos un código de 6 dígitos a nuevo\+vuelos@example.test/)).toBeInTheDocument();
  expect(within(row("nuevo+vuelos@example.test")).getByText("Pendiente de verificación")).toBeInTheDocument();
  expect(within(form).getByLabelText("Nuevo correo electrónico")).toHaveValue("");
});

test("si no hay servicio de correo o el envío falla, el correo queda registrado sin verificar y se explica", async () => {
  for (const [envio, text] of [["NO_CONFIGURADO", /servicio de correo no está configurado/], ["FALLIDO", /no aceptó el mensaje/], ["LIMITE_ALCANZADO", /límite de códigos/]]) {
    cleanup();
    backend({ onWrite: (path, o) => { if (path === "/auth/me/correos" && o.method === "POST") { state.correos.push({ id: 13, valor: "nuevo@example.test", tipo: "PERSONAL", principal: false, version: 0, verificacion: "SIN_VERIFICAR" }); return Promise.resolve({ id: 13, envio, verificacion: "SIN_VERIFICAR" }); } } });
    render(<MyContacts />);
    await screen.findByText("ana@example.test");
    const form = screen.getByRole("form", { name: "Agregar correo electrónico" });
    fireEvent.change(within(form).getByLabelText("Nuevo correo electrónico"), { target: { value: "nuevo@example.test" } });
    fireEvent.click(within(form).getByRole("button", { name: "Agregar" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(within(row("nuevo@example.test")).getByText("Sin verificar")).toBeInTheDocument();
  }
});

test("solicita el código, lo confirma y el correo pasa a verificado; un código incorrecto se informa sin perder lo escrito", async () => {
  const notify = vi.fn();
  backend({ onWrite: (path, o) => {
    if (path === "/auth/me/correos/12/verificacion" && o.method === "POST") { state.correos[1].verificacion = "PENDIENTE"; return Promise.resolve({ id: 12, envio: "ENVIADO" }); }
    if (path === "/auth/me/correos/12/verificacion/confirmar") {
      if (JSON.parse(o.body).codigo === "111111") { const e = new Error("El código no es correcto. Intentos restantes: 4"); e.code = "VERIFICATION_CODE_INVALID"; return Promise.reject(e); }
      state.correos[1].verificacion = "VERIFICADO"; return Promise.resolve({ id: 12 });
    }
  } });
  render(<MyContacts notify={notify} />);
  await screen.findByText("ana.trabajo@example.test");
  fireEvent.click(within(row("ana.trabajo@example.test")).getByRole("button", { name: "Enviar código" }));
  expect(await screen.findByText(/Enviamos un código de 6 dígitos a ana.trabajo@example.test/)).toBeInTheDocument();
  expect(writes()[0]).toEqual(["/auth/me/correos/12/verificacion", { method: "POST" }]);
  expect(within(row("ana.trabajo@example.test")).getByText("Pendiente de verificación")).toBeInTheDocument();
  const box = screen.getByLabelText("Código de verificación de ana.trabajo@example.test");
  fireEvent.click(within(row("ana.trabajo@example.test")).getByRole("button", { name: "Confirmar código" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Ingrese los 6 dígitos");
  expect(writes()).toHaveLength(1);
  fireEvent.change(box, { target: { value: "111111" } });
  fireEvent.click(within(row("ana.trabajo@example.test")).getByRole("button", { name: "Confirmar código" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Intentos restantes: 4");
  expect(within(row("ana.trabajo@example.test")).getByText("Pendiente de verificación")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Código de verificación de ana.trabajo@example.test"), { target: { value: "012345" } });
  fireEvent.click(within(row("ana.trabajo@example.test")).getByRole("button", { name: "Confirmar código" }));
  await waitFor(() => expect(within(row("ana.trabajo@example.test")).getByText("Verificado")).toBeInTheDocument());
  expect(writes()[2]).toEqual(["/auth/me/correos/12/verificacion/confirmar", { method: "POST", body: JSON.stringify({ codigo: "012345" }) }]);
  expect(notify).toHaveBeenCalledWith("Correo verificado");
  expect(within(row("ana.trabajo@example.test")).queryByRole("button", { name: "Confirmar código" })).not.toBeInTheDocument();
});

test("un código vencido invita a pedir otro y un error del servicio de correo se muestra tal cual", async () => {
  backend({ onWrite: (path) => { if (path === "/auth/me/correos/12/verificacion") { const e = new Error("El servicio de correo no está configurado: no se puede enviar el código. Contacte al administrador"); e.code = "MAIL_NOT_CONFIGURED"; return Promise.reject(e); } } });
  state = person({ correos: [person().correos[0], { ...person().correos[1], verificacion: "EXPIRADO" }] });
  vi.mocked(api).mockImplementation((path, options) => { calls.push([path, options]); if (path === "/auth/me" && !options) return Promise.resolve(JSON.parse(JSON.stringify(state))); if (path === "/auth/me/correos/12/verificacion") { const e = new Error("El servicio de correo no está configurado: no se puede enviar el código. Contacte al administrador"); e.code = "MAIL_NOT_CONFIGURED"; return Promise.reject(e); } return Promise.resolve(null); });
  render(<MyContacts />);
  await screen.findByText("ana.trabajo@example.test");
  expect(within(row("ana.trabajo@example.test")).getByText("Código vencido")).toBeInTheDocument();
  expect(within(row("ana.trabajo@example.test")).getByText(/venció o se agotaron los intentos/)).toBeInTheDocument();
  fireEvent.click(within(row("ana.trabajo@example.test")).getByRole("button", { name: "Enviar código" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("servicio de correo no está configurado");
});

test("sólo un correo verificado puede hacerse principal y uno verificado no se reemplaza en el lugar", async () => {
  backend();
  render(<MyContacts />);
  await screen.findByText("ana.trabajo@example.test");
  expect(within(row("ana.trabajo@example.test")).queryByRole("button", { name: "Hacer principal" })).not.toBeInTheDocument();
  fireEvent.click(within(row("ana@example.test")).getByRole("button", { name: "Editar" }));
  const edit = screen.getByRole("form", { name: "Editar correo electrónico" });
  expect(within(edit).getByLabelText("Nuevo valor del correo electrónico")).toHaveAttribute("readonly");
  expect(within(edit).getByText(/agregue el nuevo correo, confírmelo con su código y luego retire este/)).toBeInTheDocument();
});

test("edita enviando la versión leída y muestra el conflicto del servidor sin perder el estado vigente", async () => {
  backend({ onWrite: (path, o) => {
    if (path === "/auth/me/correos/12" && o.method === "PUT") {
      state.correos[1] = { ...state.correos[1], version: 3, valor: "otra.sesion@example.test" };
      const e = new Error("El contacto fue modificado por otra operación. Actualice los datos y reintente."); e.code = "CONTACT_VERSION_CONFLICT"; return Promise.reject(e);
    }
  } });
  render(<MyContacts />);
  await screen.findByText("ana.trabajo@example.test");
  fireEvent.click(within(row("ana.trabajo@example.test")).getByRole("button", { name: "Editar" }));
  fireEvent.change(screen.getByLabelText("Nuevo valor del correo electrónico"), { target: { value: "corregido@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("modificado por otra operación");
  expect(body()).toEqual({ direccion: "corregido@example.test", tipo: "LABORAL", version: 2 });
  expect(await screen.findByText("otra.sesion@example.test")).toBeInTheDocument();
});

test("hacer principal y quitar piden la operación correcta; quitar exige confirmar y no se ofrece sobre el único contacto", async () => {
  const notify = vi.fn();
  backend({ onWrite: (path, o) => {
    if (path === "/auth/me/telefonos/22/principal") { state.telefonos[0].principal = false; state.telefonos[1].principal = true; return Promise.resolve(null); }
    if (path === "/auth/me/telefonos/21" && o.method === "DELETE") { state.telefonos.splice(0, 1); return Promise.resolve(null); }
  } });
  state = person();
  vi.mocked(api).mockImplementation((path, options) => { calls.push([path, options]); if (path === "/auth/me" && !options) return Promise.resolve(JSON.parse(JSON.stringify(state))); const r = (path === "/auth/me/telefonos/22/principal" ? (state.telefonos[0].principal = false, state.telefonos[1].principal = true, Promise.resolve(null)) : path === "/auth/me/telefonos/21" && options?.method === "DELETE" ? (state.telefonos.splice(0, 1), Promise.resolve(null)) : undefined); return r || Promise.resolve(null); });
  state.telefonos.push({ id: 22, valor: "+56 9 8765 4321", tipo: "LABORAL", principal: false, version: 0, pais: "CL" });
  render(<MyContacts notify={notify} />);
  await screen.findByText("+56 9 8765 4321");
  fireEvent.click(within(row("+56 9 8765 4321")).getByRole("button", { name: "Hacer principal" }));
  await waitFor(() => expect(within(row("+56 9 8765 4321")).getByText("Principal")).toBeInTheDocument());
  expect(writes()[0]).toEqual(["/auth/me/telefonos/22/principal", { method: "POST" }]);
  window.confirm = vi.fn(() => false);
  fireEvent.click(within(row("+54 381 555-1234")).getByRole("button", { name: "Quitar" }));
  expect(writes()).toHaveLength(1);
  window.confirm = vi.fn(() => true);
  fireEvent.click(within(row("+54 381 555-1234")).getByRole("button", { name: "Quitar" }));
  await waitFor(() => expect(screen.queryByText("+54 381 555-1234")).not.toBeInTheDocument());
  expect(writes()[1]).toEqual(["/auth/me/telefonos/21", { method: "DELETE" }]);
  expect(notify).toHaveBeenCalledWith("Contacto retirado");
  expect(within(row("+56 9 8765 4321")).queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
  expect(screen.getByText(/Debe conservar al menos un teléfono/)).toBeInTheDocument();
});

test("el teléfono se registra con país: prefijo automático, búsqueda por nombre, validación por país y número final", async () => {
  backend({ onWrite: (path, o) => { if (path === "/auth/me/telefonos" && o.method === "POST") return Promise.resolve({ id: 30 }); } });
  render(<MyContacts />);
  await screen.findByText("+54 381 555-1234");
  const form = screen.getByRole("form", { name: "Agregar teléfono" });
  const country = within(form).getByLabelText("País del teléfono"), number = within(form).getByLabelText("Nuevo teléfono");
  expect(country).toHaveValue("AR");   // Argentina sólo como sugerencia inicial
  expect(within(form).getByLabelText("Prefijo internacional")).toHaveTextContent("+54");
  expect(within(country).getByRole("option", { name: "Argentina (+54)" })).toBeInTheDocument();
  expect(within(country).getByRole("option", { name: "Chile (+56)" })).toBeInTheDocument();
  expect(within(country).getByRole("option", { name: "Estados Unidos (+1)" })).toBeInTheDocument();
  expect(within(country).getByRole("option", { name: "Canadá (+1)" })).toBeInTheDocument();
  // pocos dígitos y dígitos de más
  fireEvent.change(number, { target: { value: "381 555" } });
  expect(within(form).getByText(/muy pocos dígitos|incompleto|válido de Argentina/)).toBeInTheDocument();
  fireEvent.change(number, { target: { value: "381 555 1234 5678 9012" } });
  expect(within(form).getByText(/demasiados dígitos/)).toBeInTheDocument();
  fireEvent.change(number, { target: { value: "381-555-12ab" } });
  expect(within(form).getByText(/sólo admite dígitos|extensiones ni letras/)).toBeInTheDocument();
  fireEvent.click(within(form).getByRole("button", { name: "Agregar" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
  // formato nacional argentino con 0 y 15: se muestra cómo quedará
  fireEvent.change(number, { target: { value: "0381 15 555-1234" } });
  expect(within(form).getByText(/Se guardará como \+54 9 381 555 1234 \(\+5493815551234\)/)).toBeInTheDocument();
  expect(within(form).queryByText(/no se verifica por SMS/)).toBeInTheDocument();
  // el prefijo escrito se quita del campo (no se duplica con el prefijo mostrado)
  fireEvent.change(number, { target: { value: "+54 381 444-5566" } });
  expect(number).toHaveValue("381 444-5566");
  // buscar y cambiar de país actualiza prefijo y validación
  fireEvent.change(within(form).getByLabelText("Buscar país"), { target: { value: "chil" } });
  expect(within(country).queryByRole("option", { name: "Brasil (+55)" })).not.toBeInTheDocument();   // el filtro oculta los demás países (el elegido se conserva)
  expect(within(country).getByRole("option", { name: "Chile (+56)" })).toBeInTheDocument();
  fireEvent.change(country, { target: { value: "CL" } });
  expect(within(form).getByLabelText("Prefijo internacional")).toHaveTextContent("+56");
  expect(within(form).getByText(/válido de Chile|muy pocos|demasiados/)).toBeInTheDocument();
  fireEvent.change(number, { target: { value: "9 8765 4321" } });
  expect(within(form).getByText(/Se guardará como \+56 9 8765 4321/)).toBeInTheDocument();
  fireEvent.change(within(form).getByLabelText("Tipo del nuevo teléfono"), { target: { value: "LABORAL" } });
  fireEvent.click(within(form).getByRole("button", { name: "Agregar" }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(body()).toEqual({ numero: "9 8765 4321", tipo: "LABORAL", pais: "CL" });
});

test("un prefijo de otro país inequívoco cambia el país elegido y un prefijo compartido (+1) no lo cambia", async () => {
  backend();
  render(<MyContacts />);
  await screen.findByText("+54 381 555-1234");
  const form = screen.getByRole("form", { name: "Agregar teléfono" });
  const country = within(form).getByLabelText("País del teléfono"), number = within(form).getByLabelText("Nuevo teléfono");
  fireEvent.change(number, { target: { value: "+56 9 8765 4321" } });
  expect(country).toHaveValue("CL");
  expect(number).toHaveValue("9 8765 4321");
  fireEvent.change(country, { target: { value: "CA" } });
  fireEvent.change(number, { target: { value: "+1 416 555 0123" } });
  expect(country).toHaveValue("CA");
  expect(within(form).getByText(/Se guardará como \+1 416 555 0123/)).toBeInTheDocument();
  fireEvent.change(country, { target: { value: "US" } });
  expect(within(form).getByText(/no es un teléfono válido de Estados Unidos/)).toBeInTheDocument();
});

test("un teléfono anterior sin país se conserva marcado y exige elegir el país al editarlo; no se supone Argentina", async () => {
  backend({ onWrite: (path, o) => { if (path === "/auth/me/telefonos/22" && o.method === "PUT") return Promise.resolve({ id: 22 }); } });
  state = person();
  render(<MyContacts />);
  await screen.findByText("+54 381 555-1234");
  cleanup();
  vi.mocked(api).mockImplementation((path, options) => { calls.push([path, options]); if (path === "/auth/me" && !options) return Promise.resolve({ ...person(), telefonos: [...person().telefonos, { id: 22, valor: "3815559999", tipo: "PERSONAL", principal: false, version: 1, pais: null }] }); return Promise.resolve({ id: 22 }); });
  render(<MyContacts />);
  await screen.findByText("3815559999");
  expect(within(row("3815559999")).getByText("Sin país: edítelo para validarlo")).toBeInTheDocument();
  fireEvent.click(within(row("3815559999")).getByRole("button", { name: "Editar" }));
  const edit = screen.getByRole("form", { name: "Editar teléfono" });
  expect(within(edit).getByLabelText("País del teléfono")).toHaveValue("");
  fireEvent.click(within(edit).getByRole("button", { name: "Guardar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Seleccione el país");
  expect(writes()).toHaveLength(0);
  fireEvent.change(within(edit).getByLabelText("País del teléfono"), { target: { value: "AR" } });
  fireEvent.click(within(edit).getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(body()).toEqual({ numero: "3815559999", tipo: "PERSONAL", version: 1, pais: "AR" });
});

test("las respuestas de validación del servidor se muestran y no se descartan", async () => {
  backend({ onWrite: (path, o) => { if (path === "/auth/me/telefonos" && o.method === "POST") { const e = new Error("Ya tiene registrado ese teléfono"); e.code = "CONTACT_DUPLICATE"; return Promise.reject(e); } } });
  render(<MyContacts />);
  await screen.findByText("+54 381 555-1234");
  const form = screen.getByRole("form", { name: "Agregar teléfono" });
  fireEvent.change(within(form).getByLabelText("Nuevo teléfono"), { target: { value: "0381 555-1234" } });
  fireEvent.click(within(form).getByRole("button", { name: "Agregar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Ya tiene registrado ese teléfono");
  expect(body()).toEqual({ numero: "0381 555-1234", tipo: "PERSONAL", pais: "AR" });
});

test("mientras se guarda, las acciones quedan deshabilitadas para no duplicar la operación", async () => {
  let release;
  backend({ onWrite: (path, o) => { if (path === "/auth/me/telefonos/21" && o.method === "PUT") return new Promise((resolve) => { release = resolve; }); } });
  render(<MyContacts />);
  await screen.findByText("+54 381 555-1234");
  fireEvent.click(within(row("+54 381 555-1234")).getByRole("button", { name: "Editar" }));
  const edit = screen.getByRole("form", { name: "Editar teléfono" });
  expect(within(edit).getByLabelText("Nuevo valor del teléfono")).toHaveValue("0381 555-1234");   // el número nacional; el prefijo queda en el selector
  fireEvent.change(within(edit).getByLabelText("Nuevo valor del teléfono"), { target: { value: "381 555 9999" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled());
  expect(within(screen.getByRole("form", { name: "Agregar teléfono" })).getByRole("button", { name: "Agregar" })).toBeDisabled();
  release(null);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument());
});

test("distingue contacto personal de laboral e indica que Operaciones sólo consulta los laborales verificados de vuelos abiertos", async () => {
  backend();
  render(<MyContacts />);
  await screen.findByText("ana@example.test");
  const scope = screen.getByText(/sólo los contactos/i);
  expect(scope).toHaveTextContent(/laborales pueden ser consultados por el Centro de Operaciones/);
  expect(scope).toHaveTextContent(/mientras usted esté asignado a un vuelo abierto/);
  expect(scope).toHaveTextContent(/correo laboral sólo se muestra una vez verificado/);
  expect(scope).toHaveTextContent(/Los personales nunca se muestran a Operaciones/);
  const form = screen.getByRole("form", { name: "Agregar teléfono" });
  const select = within(form).getByLabelText("Tipo del nuevo teléfono");
  expect(within(select).getByRole("option", { name: "Personal (privado)" })).toBeInTheDocument();
  expect(within(select).getByRole("option", { name: "Laboral (lo consulta Operaciones)" })).toBeInTheDocument();
  expect(within(form).getByRole("note")).toHaveTextContent("privado, nunca se muestra al Centro de Operaciones");
  fireEvent.change(select, { target: { value: "LABORAL" } });
  expect(within(form).getByRole("note")).toHaveTextContent(/Centro de Operaciones podrá consultarlo/);
  expect(within(form).getByRole("note")).toHaveTextContent(/vuelo abierto/);
  expect(within(form).getByRole("note")).toHaveTextContent(/auditada/);
});

test("al editar un contacto el aviso sigue el tipo elegido y se envía el tipo laboral con el país", async () => {
  backend({ onWrite: (path, o) => { if (path === "/auth/me/telefonos/21" && o.method === "PUT") return Promise.resolve({ id: 21 }); } });
  render(<MyContacts />);
  await screen.findByText("+54 381 555-1234");
  fireEvent.click(within(row("+54 381 555-1234")).getByRole("button", { name: "Editar" }));
  const edit = screen.getByRole("form", { name: "Editar teléfono" });
  expect(within(edit).getByRole("note")).toHaveTextContent("privado");
  fireEvent.change(within(edit).getByLabelText("Tipo de contacto"), { target: { value: "LABORAL" } });
  expect(within(edit).getByRole("note")).toHaveTextContent("Centro de Operaciones podrá consultarlo");
  fireEvent.click(within(edit).getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(body()).toEqual({ numero: "0381 555-1234", tipo: "LABORAL", version: 0, pais: "AR" });
});
