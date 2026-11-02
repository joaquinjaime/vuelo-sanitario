/** Formatos y reglas de fecha/lugar compartidos por todas las pantallas. */

// La API entrega DATETIME2 como hora civil de la zona de negocio; no se convierte al huso del navegador.
export const BUSINESS_ZONE = "America/Argentina/Tucuman";
export const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");

/** Fecha civil de hoy en la zona de negocio (AAAA-MM-DD). */
export const businessDate = () => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${p.find((x) => x.type === "year").value}-${p.find((x) => x.type === "month").value}-${p.find((x) => x.type === "day").value}`;
};

/** ¿La fecha elegida es hoy o mañana (en la zona de negocio)? Esos vuelos sólo pueden pedirse como extrema urgencia. */
export const isTodayOrTomorrow = (v) => {
  if (!v) return false;
  const base = Date.parse(`${businessDate()}T00:00:00Z`), selected = Date.parse(`${v.slice(0, 10)}T00:00:00Z`), days = (selected - base) / 86400000;
  return days >= 0 && days < 2;
};

/** Acepta el lugar estructurado ({nombre, provincia}) o, en payloads antiguos, el nombre del aeropuerto como texto. */
export const locationLabel = (location) => !location ? "—" : typeof location === "string" ? (location.trim() || "—") : ([location.nombre, location.provincia].filter(Boolean).join(", ") || "—");

export const stateLabel = (state) => String(state || "SIN_ESTADO").replaceAll("_", " ");

/** Hora (HH:mm) de la zona de negocio, para «última actualización». */
export const updateStamp = () => new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: BUSINESS_ZONE }).format(new Date());

/** Estados en los que el vuelo o la solicitud ya no admiten acciones operativas. */
export const CLOSED_STATES = ["FINALIZADO", "COMPLETADO", "CANCELADO", "RECHAZADO"];
export const isOpenState = (state) => !CLOSED_STATES.includes(state);
