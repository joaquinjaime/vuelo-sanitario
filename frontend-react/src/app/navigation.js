/**
 * Mapa de navegación: una única definición de las áreas de trabajo, sus módulos y la ruta de cada uno.
 * La barra lateral y los guards de ruta salen de aquí, de modo que el menú nunca ofrece una pantalla que la ruta rechazaría.
 * La autorización real sigue siendo la del servidor: esto sólo decide qué se muestra.
 *
 * Áreas (workspaces): ADMIN (administrador), DTS, OPERACIONES (Centro de Operaciones) y COMANDANTE.
 */
export const APP_BASE = "/app";
export const appPath = (path = "") => `${APP_BASE}/${String(path).replace(/^\//, "")}`.replace(/\/$/, "");

/** Módulos de cada área, agrupados. `badge` indica un contador dinámico (ver Sidebar). */
export const NAVIGATION = {
  ADMIN: [
    { items: [{ to: "inicio", label: "Inicio", icon: "home" }] },
    { title: "Gestión", items: [
      { to: "usuarios", label: "Usuarios", icon: "users" },
      { to: "aeronaves", label: "Aeronaves", icon: "plane" },
    ] },
    { title: "Catálogos", items: [
      { to: "geografia", label: "Geografía", icon: "globe" },
      { to: "comandantes", label: "Ubicación de comandantes", icon: "map" },
      { to: "pacientes", label: "Pacientes", icon: "heart" },
    ] },
    { title: "Control", items: [{ to: "auditoria", label: "Auditoría", icon: "shield" }] },
  ],
  DTS: [
    { items: [{ to: "inicio", label: "Inicio", icon: "home" }] },
    { title: "Solicitudes", items: [
      { to: "solicitudes", label: "Mis solicitudes", icon: "clipboard", badge: "attention", excludes: ["solicitudes/nueva"] },
      { to: "solicitudes/nueva", label: "Nueva solicitud", icon: "plus" },
    ] },
    { title: "Mi equipo", items: [{ to: "personal-sanitario", label: "Personal sanitario", icon: "heart" }] },
    { title: "Avisos", items: [{ to: "notificaciones", label: "Notificaciones", icon: "bell", badge: "unread" }] },
  ],
  OPERACIONES: [
    { items: [{ to: "inicio", label: "Inicio", icon: "home" }] },
    { title: "Operación", items: [
      { to: "solicitudes", label: "Solicitudes", icon: "inbox", badge: "attention" },
      { to: "vuelos", label: "Vuelos", icon: "plane" },
      { to: "informes", label: "Informes finales", icon: "file" },
    ] },
    { title: "Recursos", items: [{ to: "comandantes", label: "Comandantes", icon: "map" }] },
    { title: "Avisos", items: [{ to: "notificaciones", label: "Notificaciones", icon: "bell", badge: "unread" }] },
  ],
  COMANDANTE: [
    { items: [{ to: "inicio", label: "Inicio", icon: "home" }] },
    { title: "Operación", items: [
      { to: "vuelos", label: "Mis vuelos", icon: "plane", badge: "attention" },
      { to: "informes", label: "Informes finales", icon: "file" },
    ] },
    { title: "Avisos", items: [{ to: "notificaciones", label: "Notificaciones", icon: "bell", badge: "unread" }] },
  ],
};

/** Qué áreas pueden abrir cada ruta (relativa a /app). El patrón `:id` y `:tab` coincide con los segmentos de la tabla de rutas. */
export const ROUTE_ACCESS = {
  inicio: ["ADMIN", "DTS", "OPERACIONES", "COMANDANTE"],
  "mi-cuenta": ["ADMIN", "DTS", "OPERACIONES", "COMANDANTE"],
  usuarios: ["ADMIN"],
  aeronaves: ["ADMIN"],
  geografia: ["ADMIN"],
  pacientes: ["ADMIN"],
  auditoria: ["ADMIN"],
  comandantes: ["ADMIN", "OPERACIONES"],
  solicitudes: ["DTS", "OPERACIONES"],
  "solicitudes/nueva": ["DTS"],
  vuelos: ["OPERACIONES", "COMANDANTE"],
  "vuelos/nuevo": ["OPERACIONES"],
  informes: ["OPERACIONES", "COMANDANTE"],
  "personal-sanitario": ["DTS"],
  notificaciones: ["DTS", "OPERACIONES", "COMANDANTE"],
};

/** Área que puede abrir la ruta (o null si la ruta no existe). `path` es el segmento principal: «usuarios», «vuelos»… */
export const workspacesFor = (segment) => ROUTE_ACCESS[segment] || null;

/**
 * Destinos de los enlaces antiguos con «#/…» (marcadores y correos ya enviados). Devuelve la ruta nueva o null.
 * Los enlaces de vuelo del DTS llevan a «solicitudes»; los del resto, a «vuelos».
 */
export function legacyHashTarget(hash, workspace) {
  const value = String(hash || "").replace(/^#/, "");
  if (!value.startsWith("/")) return null;
  const flight = /^\/vuelos\/(\d+)$/.exec(value);
  if (flight) return appPath(`${workspace === "DTS" ? "solicitudes" : "vuelos"}/${flight[1]}`);
  const map = {
    "/vuelos": workspace === "DTS" ? "solicitudes" : "vuelos",
    "/mi-cuenta": "mi-cuenta", "/notificaciones": "notificaciones", "/comandantes": "comandantes", "/personal-sanitario": "personal-sanitario",
    "/admin": "inicio", "/admin/usuarios": "usuarios", "/admin/usuarios/desactivados": "usuarios?estado=desactivados", "/admin/aeronaves": "aeronaves",
    "/admin/geografia": "geografia", "/admin/ubicacion-comandantes": "comandantes", "/admin/pacientes": "pacientes", "/admin/auditoria": "auditoria", "/admin/mi-cuenta": "mi-cuenta",
  };
  return map[value] ? appPath(map[value]) : null;
}
