package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import jakarta.validation.constraints.*;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.*;
import java.util.*;

@Service
public class FlightLogService {
 public record Input(@NotBlank @Size(max=40) String tipo,@NotBlank @Size(max=4000) String descripcion,@NotNull @PastOrPresent OffsetDateTime ocurrido,@NotBlank String importancia,Long correccionDe,@Size(max=1000) String motivoCorreccion) {}
 public record Entry(Long id,String tipo,String descripcion,OffsetDateTime ocurrido,OffsetDateTime registrado,String origen,String importancia,String responsable,Long correccionDe,String motivoCorreccion) {}
 public record History(List<Entry> entradas,boolean hayMas,boolean puedeRegistrar,String motivo) {}
 private static final Set<String> MANUAL_TYPES=Set.of("PREPARACION","DEMORA","INCIDENCIA","METEOROLOGIA","AERONAVE","EJECUCION","CIERRE","OTRO");
 private final FlightRepository flights; private final FlightAuditLogRepository entries; private final UserRepository users; private final AuditService audit; private final ObjectMapper json; private final Clock clock; private final CommanderReportAccessService commanderAccess;
 public FlightLogService(FlightRepository f,FlightAuditLogRepository e,UserRepository u,AuditService au,ObjectMapper j,Clock c,CommanderReportAccessService ca){commanderAccess=ca;flights=f;entries=e;users=u;audit=au;json=j;clock=c;}
 @Transactional(readOnly=true) public History history(Long id,Long actor,int page){if(page<0||page>100000)throw bad("Página inválida");Flight f=flights.findById(id).orElseThrow(()->missing("Vuelo"));User u=roles(actor);if(!hasRole(u,"OPERACIONES","CENTRO_OPERACIONES","ADMINISTRADOR")&&!(hasRole(u,"COMANDANTE")&&f.getComandante()!=null&&f.getComandante().getId().equals(actor)))throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a la bitácora de este vuelo");boolean allowed=canWrite(f,u);Slice<FlightAuditLog> rows=entries.history(id,PageRequest.of(page,20));return new History(rows.getContent().stream().map(this::view).toList(),rows.hasNext(),allowed,allowed?null:!writable(f)?"El vuelo no admite nuevas novedades en su estado actual":"Sólo Operaciones o el comandante asignado pueden registrar novedades");}
 @Transactional public Entry create(Long id,Long actor,Input req){Flight f=flights.lockById(id).orElseThrow(()->missing("Vuelo"));User user=roles(actor);if(!canWrite(f,user))throw new ApiException(HttpStatus.FORBIDDEN,"No puede registrar novedades para este vuelo o su estado no lo permite");if(!hasRole(user,"OPERACIONES","CENTRO_OPERACIONES"))commanderAccess.requireOperationalAccess(actor);if(!MANUAL_TYPES.contains(req.tipo()))throw bad("Tipo de acontecimiento inválido");if(!Set.of("NORMAL","IMPORTANTE").contains(req.importancia()))throw bad("Importancia inválida");if(req.ocurrido().toInstant().isAfter(Instant.now(clock)))throw bad("El acontecimiento no puede estar en el futuro");
  FlightAuditLog target=null;if(req.correccionDe()!=null){target=entries.findById(req.correccionDe()).filter(x->x.getFlight().getId().equals(id)&&x.getOrigen()!=null).orElseThrow(()->missing("Acontecimiento"));if(req.motivoCorreccion()==null||req.motivoCorreccion().isBlank())throw bad("La corrección requiere motivo");}else if(req.motivoCorreccion()!=null&&!req.motivoCorreccion().isBlank())throw bad("El motivo requiere un acontecimiento a corregir");
  FlightAuditLog e=base(f,user,req.tipo(),req.descripcion().trim(),"MANUAL",req.importancia(),req.ocurrido().withOffsetSameInstant(ZoneOffset.UTC));e.setCorreccionDe(target);e.setMotivoCorreccion(target==null?null:req.motivoCorreccion().trim());entries.saveAndFlush(e);Entry v=view(e);audit.record(f,user,"FLIGHT_LOG",e.getId(),target==null?"CREATE":"CORRECT",target==null?null:serialize(view(target)),serialize(v));return v;
 }
 /** Se ejecuta dentro de la misma transacción y bajo el bloqueo de vuelo de la transición. */
 @Transactional(propagation=Propagation.MANDATORY) public void automatic(Flight f,User actor,String type,String description){if(!Set.of("INICIO","FINALIZACION","CANCELACION").contains(type))throw new IllegalArgumentException("Transición no admitida");if(entries.existsByFlightIdAndOrigenAndTipo(f.getId(),"AUTOMATICO",type))return;FlightAuditLog e=base(f,actor,type,description,"AUTOMATICO","IMPORTANTE",now());entries.saveAndFlush(e);audit.record(f,actor,"FLIGHT_LOG",e.getId(),"CREATE_AUTO",null,serialize(view(e)));}
 private FlightAuditLog base(Flight f,User u,String type,String desc,String origin,String importance,OffsetDateTime occurred){FlightAuditLog e=new FlightAuditLog();e.setFlight(f);e.setUsuario(u);e.setCampo("ACONTECIMIENTO_OPERATIVO");e.setTipo(type);e.setDescripcion(desc);e.setOcurrido(occurred);e.setRegistrado(now());e.setOrigen(origin);e.setImportancia(importance);return e;}
 private User roles(Long actor){User u=users.findById(actor).orElseThrow(()->missing("Usuario"));return users.findWithRolesByUsername(u.getUsername()).orElseThrow(()->missing("Usuario"));}
 private boolean hasRole(User u,String... codes){return u.getUserRoles().stream().anyMatch(r->Arrays.asList(codes).contains(r.getRole().getCodigo()));}
 private boolean canWrite(Flight f,User u){return writable(f)&&(hasRole(u,"OPERACIONES","CENTRO_OPERACIONES")||(hasRole(u,"COMANDANTE")&&f.getComandante()!=null&&f.getComandante().getId().equals(u.getId())));}
 private boolean writable(Flight f){if(f.getEstadoVuelo()!=null)return Set.of("PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PENDIENTE_REPLANIFICACION","PLANIFICADO","EN_CURSO","FINALIZADO","CANCELADO").contains(f.getEstadoVuelo().getCodigo());return f.getSanitario()!=null&&f.getSanitario().getEstadoSolicitud()!=null&&!"RECHAZADO".equals(f.getSanitario().getEstadoSolicitud().getCodigo());}
 private Entry view(FlightAuditLog e){return new Entry(e.getId(),e.getTipo(),e.getDescripcion(),e.getOcurrido(),e.getRegistrado(),e.getOrigen(),e.getImportancia(),e.getUsuario()==null?null:e.getUsuario().getUsername(),e.getCorreccionDe()==null?null:e.getCorreccionDe().getId(),e.getMotivoCorreccion());}
 private OffsetDateTime now(){return OffsetDateTime.ofInstant(clock.instant(),ZoneOffset.UTC);}private String serialize(Object v){try{return json.writeValueAsString(v);}catch(JsonProcessingException ex){throw new IllegalStateException(ex);}}private ApiException bad(String s){return new ApiException(HttpStatus.BAD_REQUEST,s);}private ApiException missing(String s){return new ApiException(HttpStatus.NOT_FOUND,s+" inexistente");}
}
