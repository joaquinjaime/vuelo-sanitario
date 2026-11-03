/**
 * «Qué sigue» para cada área, según el estado real del vuelo. Es una guía (no habilita acciones: las acciones las
 * habilitan las pestañas y el servidor). tone: "action" = el usuario debe actuar · "wait" = espera a otra parte · "done" = nada pendiente.
 * `tab` indica la pestaña donde se resuelve.
 */
export function nextStep({ workspace, flight }) {
  const state = flight?.estado;
  const sanitary = Boolean(flight?.datosSanitarios);
  if (!flight) return null;
  const closed = { RECHAZADO: "La solicitud fue rechazada: no hubo acuerdo sobre el horario.", CANCELADO: "El vuelo fue cancelado. El historial se conserva para consulta.", COMPLETADO: "El vuelo está completo y su informe final fue aprobado." };
  if (closed[state]) return { tone: "done", title: state === "COMPLETADO" ? "Vuelo completado" : state === "RECHAZADO" ? "Solicitud rechazada" : "Vuelo cancelado", text: closed[state] };

  if (workspace === "DTS") {
    if (state === "SOLICITADO") return { tone: "wait", title: "Pendiente de evaluación", text: "Operaciones debe aceptar el horario solicitado, proponer otro o rechazar la solicitud." };
    if (state === "PENDIENTE_RESPUESTA_DTS") return { tone: "action", title: "Debe responder la contrapropuesta", text: "Operaciones propuso otro horario: acéptelo o rechácelo (si lo rechaza, la solicitud se cancela).", tab: "negociacion", cta: "Responder contrapropuesta" };
    if (state === "APROBADO") return { tone: "wait", title: "Horario acordado", text: "Operaciones asignará la aeronave y el comandante. Mientras tanto puede cargar el personal sanitario y los contactos del traslado.", tab: "equipo", cta: "Personal y contactos" };
    if (state === "FINALIZADO") return { tone: "done", title: "Vuelo finalizado", text: "Falta el informe final del comandante y su revisión por Operaciones." };
    if (state === "EN_CURSO") return { tone: "done", title: "Vuelo en curso", text: "El traslado se está realizando." };
    return { tone: "wait", title: "En preparación", text: "El vuelo está siendo preparado por Operaciones y el comandante. Puede mantener actualizado el personal sanitario.", tab: "equipo", cta: "Personal y contactos" };
  }

  if (workspace === "COMANDANTE") {
    if (state === "PENDIENTE_CONFIRMACION_COMANDANTE") return { tone: "action", title: "Confirme la asignación", text: "Acepte el vuelo o rechácelo con un motivo (el rechazo vuelve a Operaciones para replanificar) o proponga otro horario.", tab: "resumen", inline: true };
    if (state === "PENDIENTE_RESPUESTA_OPERACIONES") return { tone: "wait", title: "Esperando a Operaciones", text: "Operaciones debe responder la propuesta de horario que usted presentó." };
    if (state === "PENDIENTE_REPLANIFICACION") return { tone: "wait", title: "Para replanificar", text: "Operaciones debe asignar nuevamente el vuelo." };
    if (state === "PLANIFICADO") return { tone: "action", title: "Prepare el vuelo", text: "Planifique la ruta, registre el clima y revise la documentación. Operaciones inicia el vuelo.", tab: "planificacion", cta: "Preparar el vuelo" };
    if (state === "EN_CURSO") return { tone: "done", title: "Vuelo en curso", text: "Operaciones lo finaliza al aterrizar; luego dispondrá de 48 horas para el informe final." };
    if (state === "FINALIZADO") return { tone: "action", title: "Presente el informe final", text: "El vuelo finalizó. Dispone de 48 horas desde su finalización.", link: "informes", cta: "Ir a informes finales" };
    return null;
  }

  // Centro de Operaciones
  if (state === "SOLICITADO") return { tone: "action", title: "Nueva solicitud: decida el horario", text: "Acepte el horario solicitado, proponga otro o rechace la solicitud. Hasta el acuerdo no se habilita la documentación ni la preparación del vuelo.", tab: "negociacion", cta: "Negociar horario" };
  if (state === "PENDIENTE_RESPUESTA_DTS") return { tone: "wait", title: "Esperando la respuesta del DTS", text: "El DTS debe aceptar o rechazar la contrapropuesta. Puede reemplazarla mientras no responda.", tab: "negociacion", cta: "Ver negociación" };
  if (state === "APROBADO") return { tone: "action", title: "Horario acordado: asigne los recursos", text: "Confirme el comandante y la aeronave y defina los aeropuertos de salida y llegada.", tab: "planificacion", cta: "Asignar recursos" };
  if (state === "PENDIENTE_CONFIRMACION_COMANDANTE") return { tone: "wait", title: "Esperando al comandante", text: "El comandante debe aceptar la asignación o responder con un motivo." };
  if (state === "PENDIENTE_RESPUESTA_OPERACIONES") return { tone: "action", title: "El comandante propuso otro horario", text: "Acepte la propuesta o rechácela con un motivo.", tab: "negociacion", cta: "Responder propuesta" };
  if (state === "PENDIENTE_REPLANIFICACION") return { tone: "action", title: "Replanifique la asignación", text: sanitary ? "El comandante rechazó la asignación: asigne nuevamente los recursos." : "Envíe una nueva asignación al comandante.", tab: sanitary ? "planificacion" : "negociacion", cta: "Replanificar" };
  if (state === "PLANIFICADO") return { tone: "action", title: "Vuelo planificado", text: "Revise la ruta y la documentación. Cuando corresponda, inicie el vuelo.", tab: "operacion", cta: "Ejecución y cierre" };
  if (state === "EN_CURSO") return { tone: "action", title: "Vuelo en curso", text: "Finalícelo al aterrizar para registrar la hora real y generar la obligación de informe final.", tab: "operacion", cta: "Finalizar vuelo" };
  if (state === "FINALIZADO") return { tone: "wait", title: "Esperando el informe final", text: "El comandante presenta el informe y Operaciones lo revisa y completa el vuelo.", link: "informes", cta: "Ir a informes finales" };
  return null;
}
