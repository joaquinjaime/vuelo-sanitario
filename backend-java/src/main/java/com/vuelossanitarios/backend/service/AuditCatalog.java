package com.vuelossanitarios.backend.service;

import java.util.LinkedHashMap;
import java.util.Map;

/** Etiquetas en español de tipos de entidad, operaciones y campos. Un código desconocido se muestra tal cual, nunca se inventa una descripción. */
final class AuditCatalog {
 private AuditCatalog(){}
 static final Map<String,String> ENTITY_TYPES=new LinkedHashMap<>();
 static final Map<String,String> OPERATIONS=new LinkedHashMap<>();
 static final Map<String,String> FIELDS=new LinkedHashMap<>();
 static {
  Map<String,String> t=ENTITY_TYPES;
  t.put("FLIGHT","Vuelo");t.put("SANITARY_REQUEST","Solicitud sanitaria");t.put("FLIGHT_CREW","Tripulación del vuelo");t.put("AIRCRAFT","Aeronave");
  t.put("FLIGHT_ROUTE","Ruta del vuelo");t.put("DOCUMENT","Documento del vuelo");t.put("DOCUMENT_LOCK","Bloqueo de documento");t.put("HANGAR_INFO","Preparación en hangar");
  t.put("AA2000_COORDINATION","Coordinación aeroportuaria");t.put("FLIGHT_LOG","Bitácora operativa");t.put("WEATHER","Condiciones meteorológicas");
  t.put("FINAL_REPORT","Informe final");t.put("FINAL_REPORT_OBLIGATION","Obligación de informe final");t.put("USER","Usuario");t.put("COMMANDER_PROFILE","Perfil de comandante");
  t.put("CREW_QUALIFICATION","Clasificación de tripulación");t.put("USER_ROLE","Roles de usuario");t.put("PROFESSIONAL_CREDENTIAL","Habilitación profesional");
  Map<String,String> o=OPERATIONS;
  o.put("CREATE","Alta");o.put("UPDATE","Modificación");o.put("DELETE","Eliminación");o.put("REMOVE","Retiro");o.put("REPLACE","Reemplazo");
  o.put("CREATE_SANITARY","Creación de la solicitud sanitaria");o.put("CREATE_OPERATIONAL","Creación del vuelo operativo");o.put("REPLAN_OPERATIONAL","Replanificación del vuelo");
  o.put("APPROVE","Aprobación");o.put("REJECT","Rechazo");o.put("COUNTERPROPOSE","Contrapropuesta de horario");o.put("REPLACE_COUNTERPROPOSAL","Reemplazo de la contrapropuesta");
  o.put("ACCEPT_COUNTERPROPOSAL","Aceptación de la contrapropuesta");o.put("COMMANDER_ASSIGNMENT_RESPONSE","Respuesta del comandante a la asignación");
  o.put("COMMANDER_SCHEDULE_RESPONSE","Respuesta de Operaciones a la propuesta del comandante");o.put("ASSIGN_RESOURCES","Asignación de aeronave y comandante");
  o.put("CHANGE_AIRCRAFT","Cambio de aeronave");o.put("OPERATIONAL_PLANNING","Planificación operativa");o.put("START","Inicio del vuelo");o.put("FINISH","Finalización del vuelo");
  o.put("COMPLETE","Cierre del vuelo");o.put("CANCEL","Cancelación");o.put("SET_ACTIVE","Cambio de estado activo");o.put("MANUAL_LOCATION_CHANGE","Cambio manual de ubicación");
  o.put("UPDATE_LOCATION_AFTER_FINISH","Ubicación actualizada al finalizar un vuelo");o.put("ACQUIRE","Bloqueo adquirido");o.put("RECOVER","Bloqueo recuperado");o.put("RELEASE","Bloqueo liberado");
  o.put("CREATE_VERSION","Nueva versión");o.put("SUBMIT","Presentación");o.put("RESUBMIT","Nueva presentación");o.put("RETURN","Devolución para corrección");o.put("OVERDUE","Plazo vencido");
  o.put("UNBLOCK_COMMANDER","Desbloqueo del comandante");o.put("EXTEND","Prórroga del plazo");o.put("CORRECT","Corrección");o.put("CREATE_AUTO","Registro automático");
  o.put("COMMANDER_OBSERVATION","Observación del comandante");o.put("UPLOAD_DOCUMENT","Carga de documento");o.put("VERIFICADA","Verificación");o.put("RECHAZADA","Rechazo");o.put("REVOCADA","Revocación");
  o.put("USUARIO_CREADO","Alta de cuenta");o.put("USUARIO_ACTUALIZADO","Modificación de datos personales");o.put("USUARIO_ACTIVADO","Cuenta activada por el usuario");o.put("CONTRASENA_CAMBIADA","Contraseña cambiada por el usuario");o.put("CODIGO_ACTIVACION_REGENERADO","Código de activación regenerado");o.put("ASSIGN_COMMANDER","Rol de comandante asignado");o.put("REMOVE_COMMANDER","Rol de comandante retirado");o.put("USUARIO_DESACTIVADO","Usuario desactivado");o.put("USUARIO_REACTIVADO","Usuario reactivado");o.put("CONTRASENA_RESTABLECIDA","Contraseña restablecida");o.put("UPDATE_LICENSE","Cambio de licencia");
  Map<String,String> f=FIELDS;
  f.put("estado","Estado");f.put("motivo","Motivo");f.put("salida","Salida");f.put("propuestaId","Propuesta");f.put("negociacionId","Negociación");f.put("aceptar","Aceptada");
  f.put("tipo","Tipo");f.put("aeronaveId","Aeronave");f.put("matricula","Matrícula");f.put("comandanteId","Comandante");f.put("origenId","Origen");f.put("destinoId","Destino");
  f.put("llegada","Llegada");f.put("salidaReal","Salida real");f.put("llegadaReal","Llegada real");f.put("recursosLiberados","Recursos liberados");
  f.put("requiereConfirmacionComandante","Requiere confirmación del comandante");f.put("userId","Persona");f.put("crewRoleCode","Función");f.put("motivoBaja","Motivo de baja");
  f.put("reemplazaAsignacionId","Reemplaza la asignación");f.put("numeroVersion","Versión");f.put("expiresAt","Vence");f.put("estadoObligacion","Estado de la obligación");
  f.put("estadoInforme","Estado del informe");f.put("formato","Formato");f.put("version","Versión");f.put("vencimiento","Vencimiento");f.put("comandanteBloqueado","Comandante bloqueado");
  f.put("adjuntoBytes","Tamaño del adjunto (bytes)");f.put("adjuntoSha256","Huella SHA-256 del adjunto");f.put("status","Estado");f.put("dueAt","Vencimiento");
  f.put("modelo","Modelo");f.put("capacidadPacientes","Capacidad de pacientes");f.put("capacidadTripulacion","Capacidad de tripulación");
  f.put("equipamientoMedico","Equipamiento médico");f.put("activo","Activo");f.put("aeropuertoActual","Ubicación");f.put("aeropuertoActualId","Ubicación");f.put("fecha","Fecha");
  f.put("provinciaActualId","Provincia actual");f.put("profileCreated","Perfil creado");f.put("licenseChanged","Licencia modificada");f.put("temporaryPasswordIssued","Contraseña temporal emitida");
  f.put("reason","Razón");f.put("descripcion","Descripción");f.put("importancia","Importancia");f.put("origen","Origen del registro");f.put("responsable","Responsable");
  f.put("registrado","Registrado");f.put("ocurrido","Ocurrido");f.put("correccionDe","Corrige la entrada");f.put("motivoCorreccion","Motivo de la corrección");
  f.put("alternativo","Aeropuerto alternativo");f.put("alternativoId","Aeropuerto alternativo");f.put("altitudPies","Altitud (pies)");f.put("creadoPor","Creado por");
  f.put("distanciaNm","Distancia (NM)");f.put("fechaCreacion","Fecha de creación");f.put("observaciones","Observaciones");f.put("recorrido","Recorrido");
  f.put("tiempoEstimadoMinutos","Tiempo estimado (min)");f.put("vigente","Vigente");f.put("aeronaveContextoId","Aeronave (contexto)");f.put("comandanteContextoId","Comandante (contexto)");
  f.put("origenContextoId","Origen (contexto)");f.put("combustibleHistorico","Combustible (histórico)");f.put("observacionesComandante","Observaciones del comandante");
  f.put("preparacionCompleta","Preparación completa");f.put("requiereHangar","Requiere hangar");f.put("actual","Vigente");f.put("aeropuerto","Aeropuerto");f.put("aeropuertoId","Aeropuerto");
  f.put("canal","Canal");f.put("contacto","Contacto");f.put("contextoPlanificacion","Contexto de planificación");f.put("estadoVigencia","Vigencia");f.put("fechaComunicacion","Fecha de comunicación");
  f.put("fechaRespuesta","Fecha de respuesta");f.put("fechaSlot","Fecha del slot");f.put("finalidad","Finalidad");f.put("fuenteRespuesta","Fuente de la respuesta");f.put("gestionId","Gestión");
  f.put("id","Identificador");f.put("roles","Roles");f.put("role","Rol");f.put("personaExistente","Asociada a una persona ya registrada");f.put("bloqueosDocumentalesLiberados","Bloqueos documentales liberados");f.put("username","Nombre de usuario");f.put("motivoCambio","Motivo del cambio");f.put("referenciaExterna","Referencia externa");f.put("role","Función");f.put("type","Tipo");f.put("number","Número");
  f.put("issuer","Emisor");f.put("issued","Emisión");f.put("expires","Vencimiento");f.put("noExpiry","Sin vencimiento");f.put("notes","Observaciones");
 }
 static String entityType(String code){return ENTITY_TYPES.getOrDefault(code,code);}
 static String operation(String code){return OPERATIONS.getOrDefault(code,code);}
 /** La última parte de una clave anidada ("recursosLiberados.aeronaveId") se traduce y el prefijo indica el contexto. */
 static String field(String path){
  int dot=path.lastIndexOf('.');
  if(dot<0)return FIELDS.getOrDefault(path,path);
  String leaf=path.substring(dot+1),parent=path.substring(0,dot);
  parent=parent.substring(parent.lastIndexOf('.')+1);
  return FIELDS.getOrDefault(parent,parent)+" · "+FIELDS.getOrDefault(leaf,leaf);
 }
}
