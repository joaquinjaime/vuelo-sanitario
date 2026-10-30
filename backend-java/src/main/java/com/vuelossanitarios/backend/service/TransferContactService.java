package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.TransferContactDtos.*;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.SanitaryFlight;
import com.vuelossanitarios.backend.domain.flight.TransferContact;
import com.vuelossanitarios.backend.domain.person.ContactNormalizer;
import com.vuelossanitarios.backend.domain.person.PhoneNumbers;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.FlightRepository;
import com.vuelossanitarios.backend.repository.SanitaryFlightRepository;
import com.vuelossanitarios.backend.repository.TransferContactRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contactos para coordinar un traslado sanitario concreto. Semántica: pertenecen a la <b>solicitud</b>, no a una persona; no se
 * confunden con los contactos personales compartidos ({@code personas}/{@code telefonos}), no se marcan como verificados y no
 * generan ninguna comunicación automática.
 *
 * <ul>
 * <li>Registra y mantiene el DTS que solicitó el vuelo, mientras la coordinación está abierta (el vuelo no terminó, no se canceló
 *     y la solicitud no fue rechazada).</li>
 * <li>Consulta el DTS solicitante y Operaciones / Centro de Operaciones, siempre desde el vuelo; ni el administrador ni los
 *     comandantes tienen acceso (no existe una regla que se lo conceda). Cerrada la coordinación, los números dejan de mostrarse.</li>
 * <li>La consulta de Operaciones se audita (sin números); las altas, cambios y retiros se auditan con el teléfono parcialmente oculto.</li>
 * <li>Como máximo {@value #MAX_ACTIVE} contactos vigentes por solicitud, un solo contacto del propio paciente, y un teléfono
 *     no puede figurar dos veces en la misma solicitud (la ambigüedad se rechaza).</li>
 * </ul>
 */
@Service public class TransferContactService {
 public static final int MAX_ACTIVE=3;
 static final Set<String> RELATIONS=Set.of("PACIENTE","FAMILIAR_RESPONSABLE","ESTABLECIMIENTO_ORIGEN","ESTABLECIMIENTO_DESTINO","OTRO");
 private static final Set<String> OPERATIONS_ROLES=Set.of("OPERACIONES","CENTRO_OPERACIONES");
 private static final ObjectMapper JSON=new ObjectMapper();
 private final TransferContactRepository contacts; private final FlightRepository flights; private final SanitaryFlightRepository sanitary; private final UserRepository users; private final AuditService audit; private final Clock clock;
 public TransferContactService(TransferContactRepository c,FlightRepository f,SanitaryFlightRepository s,UserRepository u,AuditService a,Clock clock){contacts=c;flights=f;sanitary=s;users=u;audit=a;this.clock=clock;}

 /** Valor ya validado y normalizado; se construye sin tocar la base para poder rechazar antes de crear nada. */
 /** {@code phone}: número ya validado con las reglas de numeración del país elegido (E.164 y formato internacional). */
 public record Checked(String relacion,String nombre,PhoneNumbers.Parsed phone,String observaciones){}

 /** Valida la lista completa del alta de una solicitud (pura: no persiste). Nulo o vacío significa "sin contactos informados". */
 public List<Checked> validate(List<Input> inputs){
  if(inputs==null||inputs.isEmpty())return List.of();
  if(inputs.size()>MAX_ACTIVE)throw invalid("Una solicitud admite como máximo "+MAX_ACTIVE+" contactos de coordinación");
  List<Checked> out=new ArrayList<>();
  for(Input in:inputs){if(in==null)throw invalid("Contacto de coordinación inválido");out.add(check(in.relacion(),in.nombre(),in.telefono(),in.pais(),in.observaciones()));}
  rejectAmbiguity(out);
  return out;
 }
 private void rejectAmbiguity(List<Checked> list){
  Set<String> phones=list.stream().map(x->x.phone().e164()).collect(Collectors.toSet());
  if(phones.size()!=list.size())throw new ApiException(HttpStatus.BAD_REQUEST,"CONTACT_AMBIGUOUS","El mismo teléfono figura más de una vez en la solicitud: informe una sola vez a quién pertenece",Map.of());
  if(list.stream().filter(x->"PACIENTE".equals(x.relacion())).count()>1)throw new ApiException(HttpStatus.BAD_REQUEST,"CONTACT_AMBIGUOUS","Sólo puede informarse un contacto del propio paciente",Map.of());
 }
 private Checked check(String relation,String name,String phone,String country,String notes){
  String rel=relation==null?"":relation.trim().toUpperCase(java.util.Locale.ROOT);
  if(!RELATIONS.contains(rel))throw invalid("La relación del contacto debe ser PACIENTE, FAMILIAR_RESPONSABLE, ESTABLECIMIENTO_ORIGEN, ESTABLECIMIENTO_DESTINO u OTRO");
  String n=name==null||name.isBlank()?null:name.trim();
  if(n!=null&&n.length()>150)throw invalid("El nombre del contacto es demasiado largo");
  if(n==null&&!"PACIENTE".equals(rel))throw invalid("Indique el nombre de la persona o del establecimiento a contactar");
  PhoneNumbers.Parsed p;
  try{p=PhoneNumbers.parse(phone,country);}catch(PhoneNumbers.Rejected r){throw new ApiException(HttpStatus.BAD_REQUEST,"TRANSFER_CONTACT_INVALID",r.getMessage(),Map.of("campo","telefono","motivo",r.reason()));}
  String o=notes==null||notes.isBlank()?null:notes.trim();
  if(o!=null&&o.length()>200)throw invalid("Las indicaciones del contacto admiten hasta 200 caracteres");
  return new Checked(rel,n,p,o);
 }

 /** Parte de la transacción de alta de la solicitud: si algo falla, nada de esto queda. */
 @Transactional(propagation=Propagation.MANDATORY)
 public void registerAtRequest(Long flightId,Long actorId,List<Checked> checked){
  if(checked==null||checked.isEmpty())return;
  Flight f=flights.getReferenceById(flightId);User actor=users.getReferenceById(actorId);boolean first=true;
  for(Checked c:checked){TransferContact t=build(f,actor,c,first);first=false;t=contacts.saveAndFlush(t);audit.record(f,actor,"TRANSFER_CONTACT",t.getId(),"CREATE",null,snapshot(t));}
 }

 @Transactional public Listing list(Long flightId,Long actorId){
  Context ctx=context(flightId,actorId,false);
  if(!ctx.canRead())throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a los contactos de este vuelo");
  String closed=closedReason(ctx);
  if(closed!=null)return new Listing(false,closed,false,MAX_ACTIVE,List.of());
  List<TransferContact> items=contacts.findActiveByFlightId(flightId);
  if(!ctx.requester())audit.record(ctx.flight(),ctx.actor(),"TRANSFER_CONTACT",null,"VIEW",null,"{\"cantidad\":"+items.size()+"}");
  return new Listing(true,null,ctx.requester(),MAX_ACTIVE,items.stream().map(this::view).toList());
 }

 @Transactional public View add(Long flightId,Long actorId,Input in){
  Context ctx=context(flightId,actorId,true);requireEditable(ctx);
  Checked c=check(in.relacion(),in.nombre(),in.telefono(),in.pais(),in.observaciones());
  List<TransferContact> current=contacts.findActiveByFlightId(flightId);
  if(current.size()>=MAX_ACTIVE)throw new ApiException(HttpStatus.CONFLICT,"TRANSFER_CONTACT_LIMIT","La solicitud ya tiene "+MAX_ACTIVE+" contactos; retire uno antes de agregar otro",Map.of());
  rejectAmbiguityWith(current,null,c);
  TransferContact t=contacts.saveAndFlush(build(ctx.flight(),ctx.actor(),c,current.isEmpty()));
  audit.record(ctx.flight(),ctx.actor(),"TRANSFER_CONTACT",t.getId(),"CREATE",null,snapshot(t));
  return view(t);
 }

 @Transactional public View update(Long flightId,Long contactId,Long actorId,Update in){
  Context ctx=context(flightId,actorId,true);requireEditable(ctx);
  TransferContact t=contacts.findActiveByIdAndFlightId(contactId,flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Contacto inexistente"));
  Checked c=check(in.relacion(),in.nombre(),in.telefono(),in.pais(),in.observaciones());
  if(!Objects.equals(t.getVersion(),in.version()))throw new ApiException(HttpStatus.CONFLICT,"CONTACT_VERSION_CONFLICT","El contacto fue modificado por otra operación. Actualice los datos y reintente.",Map.of());
  rejectAmbiguityWith(contacts.findActiveByFlightId(flightId),contactId,c);
  if(c.relacion().equals(t.getRelacion())&&Objects.equals(c.nombre(),t.getNombre())&&c.phone().e164().equals(t.getTelefonoNormalizado())&&c.phone().region().equals(t.getCodigoPais())&&Objects.equals(c.observaciones(),t.getObservaciones()))return view(t);
  String before=snapshot(t);
  t.setRelacion(c.relacion());t.setNombre(c.nombre());t.setValidated(c.phone());t.setObservaciones(c.observaciones());t.setFechaActualizacion(now());
  t=contacts.saveAndFlush(t);audit.record(ctx.flight(),ctx.actor(),"TRANSFER_CONTACT",t.getId(),"UPDATE",before,snapshot(t));
  return view(t);
 }

 @Transactional public void retire(Long flightId,Long contactId,Long actorId){
  Context ctx=context(flightId,actorId,true);requireEditable(ctx);
  TransferContact t=contacts.findActiveByIdAndFlightId(contactId,flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Contacto inexistente"));
  List<TransferContact> current=contacts.findActiveByFlightId(flightId);
  String before=snapshot(t);boolean wasMain=Boolean.TRUE.equals(t.getPrincipal());
  t.darDeBaja(now(),ctx.actor());contacts.saveAndFlush(t);
  Long promoted=null;
  if(wasMain){var next=current.stream().filter(x->!x.getId().equals(contactId)).min(Comparator.comparing(TransferContact::getId));
   if(next.isPresent()){next.get().setPrincipal(true);next.get().setFechaActualizacion(now());contacts.saveAndFlush(next.get());promoted=next.get().getId();}}
  Map<String,Object> after=new LinkedHashMap<>();after.put("motivo","RETIRO");if(promoted!=null)after.put("principalPromovidoId",promoted);
  audit.record(ctx.flight(),ctx.actor(),"TRANSFER_CONTACT",contactId,"REMOVE",before,json(after));
 }

 @Transactional public void makePrimary(Long flightId,Long contactId,Long actorId){
  Context ctx=context(flightId,actorId,true);requireEditable(ctx);
  TransferContact target=contacts.findActiveByIdAndFlightId(contactId,flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Contacto inexistente"));
  if(Boolean.TRUE.equals(target.getPrincipal()))return;
  Long previous=null;
  for(TransferContact x:contacts.findActiveByFlightId(flightId))if(Boolean.TRUE.equals(x.getPrincipal())){x.setPrincipal(false);x.setFechaActualizacion(now());contacts.saveAndFlush(x);previous=x.getId();}
  target.setPrincipal(true);target.setFechaActualizacion(now());contacts.saveAndFlush(target);
  Map<String,Object> b=new LinkedHashMap<>(),a=new LinkedHashMap<>();b.put("principalAnteriorId",previous);a.put("principalId",contactId);
  audit.record(ctx.flight(),ctx.actor(),"TRANSFER_CONTACT",contactId,"SET_PRIMARY",json(b),json(a));
 }

 // ---- apoyo ----
 private record Context(Flight flight,SanitaryFlight request,User actor,boolean requester,boolean operations){boolean canRead(){return requester||operations;}}
 /** Carga el vuelo sanitario y quién consulta. Con {@code lock} bloquea la fila del vuelo: serializa los cambios de contactos de esa solicitud. */
 private Context context(Long flightId,Long actorId,boolean lock){
  Flight f=(lock?flights.lockById(flightId):flights.findById(flightId)).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));
  SanitaryFlight s=f.getSanitario()!=null?f.getSanitario():sanitary.findByFlightId(flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"El vuelo no es una solicitud sanitaria"));
  User actor=users.findWithRolesById(actorId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));
  Set<String> roles=actor.getUserRoles().stream().filter(r->Boolean.TRUE.equals(r.getRole().getActivo())).map(r->r.getRole().getCodigo()).collect(Collectors.toSet());
  boolean requester=roles.contains("DTS")&&s.getSolicitadoPor().getId().equals(actorId);
  boolean ops=roles.stream().anyMatch(OPERATIONS_ROLES::contains);
  return new Context(f,s,actor,requester,ops);
 }
 private void requireEditable(Context ctx){
  if(!ctx.requester())throw new ApiException(HttpStatus.FORBIDDEN,"Sólo el DTS que solicitó el vuelo puede modificar sus contactos de coordinación");
  String closed=closedReason(ctx);
  if(closed!=null)throw new ApiException(HttpStatus.CONFLICT,"TRANSFER_CONTACTS_CLOSED",closed,Map.of());
 }
 /** Una coordinación está abierta mientras el vuelo no terminó ni se canceló y la solicitud no fue rechazada. */
 private String closedReason(Context ctx){
  Flight f=ctx.flight();String state=f.getEstadoVuelo()==null?null:f.getEstadoVuelo().getCodigo();
  if(state!=null&&FlightStates.TERMINAL.contains(state))return "La coordinación de este traslado ya terminó ("+state+"); los contactos no se muestran";
  var s=ctx.request();String request=s==null||s.getEstadoSolicitud()==null?null:s.getEstadoSolicitud().getCodigo();
  if("RECHAZADO".equals(request)||"CANCELADO".equals(request))return "La solicitud está "+request+"; los contactos no se muestran";
  return null;
 }
 private void rejectAmbiguityWith(List<TransferContact> current,Long excludeId,Checked candidate){
  List<Checked> all=new ArrayList<>();
  for(TransferContact x:current)if(!x.getId().equals(excludeId))all.add(new Checked(x.getRelacion(),x.getNombre(),new PhoneNumbers.Parsed(x.getCodigoPais()==null?"":x.getCodigoPais(),0,"",x.getTelefonoNormalizado(),x.getTelefono()),x.getObservaciones()));
  all.add(candidate);rejectAmbiguity(all);
 }
 private TransferContact build(Flight f,User actor,Checked c,boolean main){
  TransferContact t=new TransferContact();t.setFlight(f);t.setRelacion(c.relacion());t.setNombre(c.nombre());t.setValidated(c.phone());t.setObservaciones(c.observaciones());
  t.setPrincipal(main);t.setCreadoPor(actor);LocalDateTime now=now();t.setFechaAlta(now);t.setFechaActualizacion(now);return t;
 }
 private View view(TransferContact t){return new View(t.getId(),t.getRelacion(),t.getNombre(),t.getTelefono(),t.getCodigoPais(),t.getObservaciones(),Boolean.TRUE.equals(t.getPrincipal()),t.getVersion());}
 private LocalDateTime now(){return LocalDateTime.now(clock);}
 /** Auditoría: relación y teléfono parcialmente oculto; ni el nombre ni las indicaciones (pueden identificar a un tercero). */
 private String snapshot(TransferContact t){Map<String,Object> m=new LinkedHashMap<>();m.put("relacion",t.getRelacion());m.put("valor",ContactNormalizer.maskPhone(t.getTelefonoNormalizado()));m.put("principal",Boolean.TRUE.equals(t.getPrincipal()));return json(m);}
 private String json(Map<String,Object> m){try{return JSON.writeValueAsString(m);}catch(JsonProcessingException e){throw new IllegalStateException(e);}}
 private ApiException invalid(String m){return new ApiException(HttpStatus.BAD_REQUEST,"TRANSFER_CONTACT_INVALID",m,Map.of());}
}
