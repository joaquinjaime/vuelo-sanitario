package com.vuelossanitarios.backend.service;

import static com.vuelossanitarios.backend.api.dto.CrewContactDtos.*;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.CrewContactDtos.*;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.person.EmailContact;
import com.vuelossanitarios.backend.domain.person.PhoneContact;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.CrewPersonRow;
import com.vuelossanitarios.backend.repository.CrewRoleRepository;
import com.vuelossanitarios.backend.repository.EmailContactRepository;
import com.vuelossanitarios.backend.repository.FlightCrewRepository;
import com.vuelossanitarios.backend.repository.FlightRepository;
import com.vuelossanitarios.backend.repository.PhoneContactRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consulta operativa de los contactos <b>laborales</b> de la tripulación vigente de un vuelo. No guarda nada: lee en el momento los
 * contactos que cada titular mantiene en "Mi cuenta" ({@code telefonos} / {@code correos_electronicos}, tipo {@code LABORAL}).
 *
 * <ul>
 * <li>Sólo Operaciones / Centro de Operaciones (se verifica contra los roles vigentes en la base). El rol de administración no alcanza.</li>
 * <li>El recurso es el vuelo: el comandante (la relación {@code vuelos.id_usuario_comandante}) y las asignaciones vigentes de
 *     {@code vuelos_tripulantes}; una persona figura una sola vez aunque el modelo la represente por las dos vías. Retirados y reemplazados no figuran.</li>
 * <li>No se consulta en vuelos terminados, cancelados ni en solicitudes rechazadas.</li>
 * <li>Nunca se devuelve un contacto personal ni se lo usa como sustituto: si no hay contacto laboral el estado es {@value com.vuelossanitarios.backend.api.dto.CrewContactDtos#NO_WORK_CONTACT},
 *     idéntico para quien no tiene contactos y para quien sólo tiene personales. Una cuenta que no está activa no expone contactos.</li>
 * <li>Selección determinista: el contacto laboral marcado principal primero, luego el más antiguo, hasta {@value #MAX_PER_KIND} por tipo.</li>
 * <li>Sólo correos <b>verificados</b> y teléfonos <b>validados con un país</b>: un correo laboral sin confirmar o un teléfono anterior a V54 sin validar no se entrega
 *     (se informa que existe pero no está disponible); nada se presenta como verificado por SMS.</li>
 * <li>Cada consulta autorizada se audita (usuario, vuelo, cantidades; nunca los valores).</li>
 * <li>Cantidad de sentencias constante: tripulación, teléfonos y correos se resuelven por lote y con proyecciones (sin cargar DNI ni cuentas).</li>
 * </ul>
 */
@Service public class CrewContactService {
 public static final int MAX_PER_KIND=3;
 static final String ENTITY_TYPE="FLIGHT_CREW_CONTACT";
 private static final Set<String> OPERATIONS_ROLES=Set.of("OPERACIONES","CENTRO_OPERACIONES");
 private final FlightRepository flights; private final FlightCrewRepository crews; private final UserRepository users; private final CrewRoleRepository crewRoles;
 private final PhoneContactRepository phones; private final EmailContactRepository emails; private final AuditService audit;
 public CrewContactService(FlightRepository f,FlightCrewRepository c,UserRepository u,CrewRoleRepository r,PhoneContactRepository p,EmailContactRepository e,AuditService a){flights=f;crews=c;users=u;crewRoles=r;phones=p;emails=e;audit=a;}

 @Transactional public CrewContactsView list(Long flightId,Long actorId){
  User actor=users.findWithRolesById(actorId).orElseThrow(()->new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a los contactos de la tripulación"));
  boolean operations=actor.getUserRoles().stream().filter(r->Boolean.TRUE.equals(r.getRole().getActivo())).anyMatch(r->OPERATIONS_ROLES.contains(r.getRole().getCodigo()));
  if(!operations)throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a los contactos de la tripulación");
  Flight f=flights.findById(flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));
  String closed=closedReason(f);
  if(closed!=null)throw new ApiException(HttpStatus.CONFLICT,"CREW_CONTACTS_CLOSED",closed,Map.of());

  List<CrewPersonRow> members=members(f);
  List<Long> personIds=members.stream().filter(CrewPersonRow::activeAccount).map(CrewPersonRow::personId).toList();
  Map<Long,List<PhoneContact>> phonesByPerson=personIds.isEmpty()?Map.of():phones.findActiveLaboralByPersonIds(personIds).stream().collect(Collectors.groupingBy(p->p.getPerson().getId()));
  Map<Long,List<EmailContact>> emailsByPerson=personIds.isEmpty()?Map.of():emails.findActiveLaboralByPersonIds(personIds).stream().collect(Collectors.groupingBy(e->e.getPerson().getId()));
  Set<Long> unverifiedMail=personIds.isEmpty()?Set.of():Set.copyOf(emails.personIdsWithUnverifiedLaboral(personIds)),unvalidatedPhone=personIds.isEmpty()?Set.of():Set.copyOf(phones.personIdsWithUnvalidatedLaboral(personIds));
  Long commanderId=f.getComandante()==null?null:f.getComandante().getId();

  List<MemberContacts> out=new ArrayList<>();int shown=0,without=0;
  for(CrewPersonRow m:members){
   boolean commander=m.userId().equals(commanderId);
   if(!m.activeAccount()){out.add(new MemberContacts(m.assignmentId(),m.nombre(),m.apellido(),m.roleCode(),m.roleName(),commander,INACTIVE_ACCOUNT,List.of(),List.of(),false,false,false));without++;continue;}
   List<PhoneContact> ph=phonesByPerson.getOrDefault(m.personId(),List.of());List<EmailContact> em=emailsByPerson.getOrDefault(m.personId(),List.of());
   List<ContactValue> phoneValues=ph.stream().limit(MAX_PER_KIND).map(p->new ContactValue(p.getNumero(),Boolean.TRUE.equals(p.getPrincipal()))).toList();
   List<ContactValue> emailValues=em.stream().limit(MAX_PER_KIND).map(e->new ContactValue(e.getDireccion(),Boolean.TRUE.equals(e.getPrincipal()))).toList();
   boolean any=!phoneValues.isEmpty()||!emailValues.isEmpty();
   if(any)shown+=phoneValues.size()+emailValues.size();else without++;
   out.add(new MemberContacts(m.assignmentId(),m.nombre(),m.apellido(),m.roleCode(),m.roleName(),commander,any?AVAILABLE:NO_WORK_CONTACT,phoneValues,emailValues,ph.size()>MAX_PER_KIND||em.size()>MAX_PER_KIND,unverifiedMail.contains(m.personId()),unvalidatedPhone.contains(m.personId())));
  }
  audit.record(f,actor,ENTITY_TYPE,null,"VIEW",null,"{\"tripulantes\":"+out.size()+",\"contactos\":"+shown+",\"sinContactoLaboral\":"+without+"}");
  return new CrewContactsView(f.getId(),f.getCodigo(),out);
 }

 /** Comandante (si lo hay) y asignaciones vigentes, sin repetir personas; el comandante va primero. */
 private List<CrewPersonRow> members(Flight f){
  List<CrewPersonRow> rows=crews.findCurrentPeopleByFlightId(f.getId());
  Map<Long,CrewPersonRow> byUser=new LinkedHashMap<>();
  Long commanderId=f.getComandante()==null?null:f.getComandante().getId();
  if(commanderId!=null){
   CrewPersonRow own=rows.stream().filter(r->r.userId().equals(commanderId)).findFirst().orElse(null);
   if(own==null){
    Object[] c=users.findCrewPersonRowById(commanderId).stream().findFirst().orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Comandante inexistente"));
    String name=crewRoles.findByCodigo("COMANDANTE").map(r->r.getNombre()).orElse("Comandante");
    own=new CrewPersonRow(null,(Long)c[0],(Boolean)c[1],(String)c[2],(Long)c[3],(String)c[4],(String)c[5],"COMANDANTE",name);
   }
   byUser.put(commanderId,own);
  }
  for(CrewPersonRow r:rows)byUser.putIfAbsent(r.userId(),r);
  return new ArrayList<>(byUser.values());
 }

 /** Mientras el vuelo no terminó ni se canceló y la solicitud sanitaria no fue rechazada, la coordinación sigue abierta. */
 private String closedReason(Flight f){
  String state=f.getEstadoVuelo()==null?null:f.getEstadoVuelo().getCodigo();
  if(state!=null&&FlightStates.TERMINAL.contains(state))return "El vuelo está "+state+"; los contactos de la tripulación no se consultan";
  var s=f.getSanitario();String request=s==null||s.getEstadoSolicitud()==null?null:s.getEstadoSolicitud().getCodigo();
  if("RECHAZADO".equals(request)||"CANCELADO".equals(request))return "La solicitud está "+request+"; los contactos de la tripulación no se consultan";
  return null;
 }
}
