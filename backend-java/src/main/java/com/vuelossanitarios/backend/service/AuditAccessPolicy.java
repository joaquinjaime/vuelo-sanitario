package com.vuelossanitarios.backend.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Qué eventos de un vuelo ve cada perfil y con qué campos. La política vive en el servidor y se traduce a condiciones SQL,
 * de modo que el total y la paginación sólo cuentan lo que el usuario puede ver. Todo tipo de entidad que no figure
 * en la tabla de un perfil queda excluido (lista blanca): un tipo nuevo no se expone por omisión.
 *
 * <ul>
 * <li>ADMIN: toda la auditoría, incluidos los eventos sin vuelo (usuarios, aeronaves, habilitaciones).</li>
 * <li>OPERACIONES: todos los hechos asociados a un vuelo; nunca los eventos sin vuelo.</li>
 * <li>COMANDANTE (actual): hechos de ejecución y planificación; sin la evaluación sanitaria ni bloqueos documentales.</li>
 * <li>DTS (solicitante): sólo la evolución de su solicitud, con un subconjunto de campos y sin identificar al personal.</li>
 * </ul>
 */
final class AuditAccessPolicy {
 private AuditAccessPolicy(){}
 enum Audience { ADMIN, OPERACIONES, COMANDANTE, DTS }
 /** {@code operations} y {@code fields} nulos significan "todos" (los campos sensibles se ocultan igualmente). */
 record Rule(Set<String> operations, Set<String> fields){
  boolean allowsOperation(String op){return operations==null||operations.contains(op);}
 }
 private static final Rule ALL=new Rule(null,null);
 private static Rule ops(String... ops){return new Rule(Set.of(ops),null);}
 private static Rule opsFields(Set<String> ops,Set<String> fields){return new Rule(ops,fields);}

 private static final Map<String,Rule> OPERATIONS_CENTER=new LinkedHashMap<>();
 private static final Map<String,Rule> COMMANDER=new LinkedHashMap<>();
 private static final Map<String,Rule> REQUESTER=new LinkedHashMap<>();
 static {
  for(String t:List.of("FLIGHT","SANITARY_REQUEST","FLIGHT_CREW","AIRCRAFT","FLIGHT_ROUTE","DOCUMENT","DOCUMENT_LOCK","HANGAR_INFO","AA2000_COORDINATION","FLIGHT_LOG","WEATHER","FINAL_REPORT","FINAL_REPORT_OBLIGATION"))OPERATIONS_CENTER.put(t,ALL);

  COMMANDER.put("FLIGHT",ops("CREATE_OPERATIONAL","REPLAN_OPERATIONAL","ASSIGN_RESOURCES","CHANGE_AIRCRAFT","OPERATIONAL_PLANNING","START","FINISH","COMPLETE","CANCEL","COMMANDER_ASSIGNMENT_RESPONSE","COMMANDER_SCHEDULE_RESPONSE"));
  COMMANDER.put("SANITARY_REQUEST",opsFields(Set.of("APPROVE","ACCEPT_COUNTERPROPOSAL"),Set.of("estado","salida")));
  COMMANDER.put("FLIGHT_CREW",ALL);
  COMMANDER.put("AIRCRAFT",ops("UPDATE_LOCATION_AFTER_FINISH"));
  COMMANDER.put("FLIGHT_ROUTE",ALL);
  COMMANDER.put("DOCUMENT",ops("CREATE","CREATE_VERSION","DEACTIVATE"));
  COMMANDER.put("HANGAR_INFO",ALL);
  COMMANDER.put("AA2000_COORDINATION",ALL);
  COMMANDER.put("FLIGHT_LOG",ALL);
  COMMANDER.put("WEATHER",ALL);
  COMMANDER.put("FINAL_REPORT",ALL);
  COMMANDER.put("FINAL_REPORT_OBLIGATION",ALL);

  REQUESTER.put("SANITARY_REQUEST",opsFields(null,Set.of("estado","salida","motivo")));
  REQUESTER.put("FLIGHT",opsFields(Set.of("CREATE_SANITARY","CANCEL","START","FINISH","COMPLETE"),Set.of("estado","motivo","salida","salidaReal","llegadaReal","tipo")));
 }

 static Map<String,Rule> rules(Audience a){
  return switch(a){case OPERACIONES->OPERATIONS_CENTER;case COMANDANTE->COMMANDER;case DTS->REQUESTER;case ADMIN->Collections.emptyMap();};
 }
 static Rule rule(Audience a,String entityType){return a==Audience.ADMIN?ALL:rules(a).get(entityType);}
 static boolean allows(Audience a,String entityType,String operation){
  Rule r=rule(a,entityType);return r!=null&&r.allowsOperation(operation);
 }
 /** Prioridad de evaluación cuando una misma persona reúne varios vínculos con el vuelo (la primera que permite el evento lo muestra). */
 static List<Audience> ordered(boolean admin,boolean operations,boolean commander,boolean requester){
  List<Audience> list=new ArrayList<>();
  if(admin)list.add(Audience.ADMIN);if(operations)list.add(Audience.OPERACIONES);if(commander)list.add(Audience.COMANDANTE);if(requester)list.add(Audience.DTS);
  return list;
 }
}
