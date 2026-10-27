package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.Crew;
import com.vuelossanitarios.backend.api.dto.FlightDtos.CrewCandidateView;
import com.vuelossanitarios.backend.api.dto.FlightDtos.QualificationView;
import com.vuelossanitarios.backend.domain.catalog.Aircraft;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import com.vuelossanitarios.backend.domain.flight.CrewQualification;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class CrewManagementServiceTest {
 private final FlightRepository flights=mock(FlightRepository.class);
 private final FlightCrewRepository crews=mock(FlightCrewRepository.class);
 private final UserRepository users=mock(UserRepository.class);
 private final CrewRoleRepository roles=mock(CrewRoleRepository.class);
 private final CrewQualificationRepository qualifications=mock(CrewQualificationRepository.class);
 private final AuditService audit=mock(AuditService.class);
 private final ProfessionalCredentialService credentials=mock(ProfessionalCredentialService.class);
 private final NotificationService notifications=mock(NotificationService.class);
 private final Clock clock=Clock.fixed(Instant.parse("2030-01-01T12:00:00Z"),ZoneId.of("UTC"));
 private final CrewManagementService service=new CrewManagementService(flights,crews,users,roles,qualifications,audit,credentials,notifications,clock);
 private Flight flight; private User member,commander,actor; private CrewRole medico,commanderRole;

 private static User user(long id,String username){User u=new User();u.setId(id);u.setUsername(username);u.setActivo(true);u.setEstadoCuenta("ACTIVO");Person p=new Person();p.setNombre("N"+id);p.setApellido("A"+id);u.setPerson(p);return u;}
 private static Flight flightWithState(long id,String state,LocalDateTime from,LocalDateTime to){Flight f=new Flight();f.setId(id);FlightStatus s=new FlightStatus();s.setCodigo(state);f.setEstadoVuelo(s);f.setFechaPlanificadaSalida(from);f.setFechaPlanificadaLlegada(to);f.setCodigo("V-"+id);return f;}
 private FlightCrew row(long id,Flight f,User u,CrewRole r){FlightCrew c=new FlightCrew();c.setId(id);c.setFlight(f);c.setUser(u);c.setCrewRole(r);return c;}
 private CrewQualification classified(User u){CrewQualification q=new CrewQualification();q.setUser(u);q.setRole(medico);return q;}

 @BeforeEach void setup(){
  flight=flightWithState(1L,"PLANIFICADO",LocalDateTime.of(2030,1,1,23,0),LocalDateTime.of(2030,1,2,1,0));
  member=user(2L,"medico");commander=user(9L,"comandante");actor=user(3L,"ops");
  medico=new CrewRole();medico.setCodigo("MEDICO");medico.setNombre("Médico");commanderRole=new CrewRole();commanderRole.setCodigo("COMANDANTE");commanderRole.setNombre("Comandante");
  flight.setComandante(commander);
  when(flights.lockById(1L)).thenReturn(Optional.of(flight));when(flights.findById(1L)).thenReturn(Optional.of(flight));
  when(users.lockById(2L)).thenReturn(Optional.of(member));when(users.lockById(9L)).thenReturn(Optional.of(commander));when(users.findById(3L)).thenReturn(Optional.of(actor));
  when(credentials.assess(any(),eq("MEDICO"),any())).thenReturn(new ProfessionalCredentialService.Assessment(true,"ELEGIBLE","Vigente",null));
  when(roles.findByCodigo("MEDICO")).thenReturn(Optional.of(medico));when(qualifications.existsByUserIdAndRoleCodigo(2L,"MEDICO")).thenReturn(true);
  when(crews.saveAndFlush(any(FlightCrew.class))).thenAnswer(i->i.getArgument(0));
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(1L)).thenReturn(List.of(row(100L,flight,commander,commanderRole)));
 }

 @Test void missingOrInvalidTimeCannotAssign(){
  flight.setFechaPlanificadaLlegada(null);assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));
  flight.setFechaPlanificadaLlegada(flight.getFechaPlanificadaSalida());assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));
  verify(crews,never()).saveAndFlush(any());
 }
 @Test void unknownTimeInAnotherCommitmentBlocksAssignment(){
  Flight other=new Flight();other.setId(4L);other.setFechaPlanificadaSalida(flight.getFechaPlanificadaSalida());
  FlightCrew otherAssignment=new FlightCrew();otherAssignment.setFlight(other);when(crews.findByUserIdAndFechaBajaIsNull(2L)).thenReturn(List.of(otherAssignment));
  assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));verify(crews,never()).saveAndFlush(any());
 }
 @Test void overlappingAcrossMidnightBlocksAssignment(){
  Flight other=new Flight();other.setId(4L);other.setFechaPlanificadaSalida(LocalDateTime.of(2030,1,2,0,30));other.setFechaPlanificadaLlegada(LocalDateTime.of(2030,1,2,2,0));
  FlightCrew otherAssignment=new FlightCrew();otherAssignment.setFlight(other);when(crews.findByUserIdAndFechaBajaIsNull(2L)).thenReturn(List.of(otherAssignment));
  assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));verify(crews,never()).saveAndFlush(any());
 }
 @Test void overlapReportsConflictAndTheCancelledFlightOfTheSamePersonDoesNotBlock(){
  Flight cancelled=flightWithState(5L,"CANCELADO",flight.getFechaPlanificadaSalida(),flight.getFechaPlanificadaLlegada());
  when(crews.findByUserIdAndFechaBajaIsNull(2L)).thenReturn(List.of(row(50L,cancelled,member,medico)));
  service.assign(1L,new Crew(2L,"MEDICO"),3L);
  verify(crews).saveAndFlush(argThat((FlightCrew c)->c.getUser()==member&&c.getFechaBaja()==null));
 }
 @Test void conflictIsReportedAsHttp409(){
  Flight other=flightWithState(4L,"PLANIFICADO",LocalDateTime.of(2030,1,2,0,30),LocalDateTime.of(2030,1,2,2,0));when(crews.findByUserIdAndFechaBajaIsNull(2L)).thenReturn(List.of(row(50L,other,member,medico)));
  ApiException e=assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));
  assertEquals(org.springframework.http.HttpStatus.CONFLICT,e.status());assertTrue(e.getMessage().contains("V-4"));
 }
 @Test void validAssignmentPersistsAuditsAndNotifiesWithoutMedicalData(){
  service.assign(1L,new Crew(2L,"MEDICO"),3L);
  ArgumentCaptor<FlightCrew> saved=ArgumentCaptor.forClass(FlightCrew.class);verify(crews).saveAndFlush(saved.capture());
  assertSame(member,saved.getValue().getUser());assertSame(actor,saved.getValue().getAsignadoPor());assertNull(saved.getValue().getFechaBaja());
  verify(audit).record(eq(flight),eq(actor),eq("FLIGHT_CREW"),any(),eq("CREATE"),isNull(),contains("\"MEDICO\""));
  ArgumentCaptor<String> text=ArgumentCaptor.forClass(String.class);verify(notifications).createOnce(eq(member),eq(flight),eq("CREW_ASSIGNED"),text.capture(),startsWith("CREW_ASSIGNED:"));
  assertTrue(text.getValue().contains("V-1"));
 }
 @Test void samePersonCannotJoinTheSameFlightTwice(){
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(1L)).thenReturn(List.of(row(100L,flight,commander,commanderRole),row(101L,flight,member,medico)));
  ApiException e=assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));
  assertEquals(org.springframework.http.HttpStatus.CONFLICT,e.status());verify(crews,never()).saveAndFlush(any());
 }
 @Test void commanderCannotBeAddedAsAdditionalCrew(){
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(1L)).thenReturn(List.of());when(qualifications.existsByUserIdAndRoleCodigo(9L,"MEDICO")).thenReturn(true);
  assertThrows(ApiException.class,()->service.assign(1L,new Crew(9L,"MEDICO"),3L));
  assertThrows(ApiException.class,()->service.assign(1L,new Crew(9L,"COMANDANTE"),3L));
 }
 @Test void deactivatedOrPendingUsersAndUnqualifiedUsersAreRejected(){
  member.setActivo(false);assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));
  member.setActivo(true);member.setEstadoCuenta("PENDIENTE_ACTIVACION");assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));
  member.setEstadoCuenta("ACTIVO");when(credentials.assess(any(),eq("MEDICO"),any())).thenReturn(new ProfessionalCredentialService.Assessment(false,"HABILITACION_AUSENTE","Sin habilitación",null));assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));
  when(credentials.assess(any(),eq("MEDICO"),any())).thenReturn(new ProfessionalCredentialService.Assessment(true,"ELEGIBLE","Vigente",null));when(qualifications.existsByUserIdAndRoleCodigo(2L,"MEDICO")).thenReturn(false);assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));
  verify(crews,never()).saveAndFlush(any());
 }
 @Test void startedFinishedOrCancelledFlightsDoNotAllowCrewChanges(){
  FlightCrew existing=row(101L,flight,member,medico);when(crews.findById(101L)).thenReturn(Optional.of(existing));
  for(String state:List.of("EN_CURSO","FINALIZADO","COMPLETADO","CANCELADO","RECHAZADO")){
   FlightStatus s=new FlightStatus();s.setCodigo(state);flight.setEstadoVuelo(s);
   assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L),state);
   assertThrows(ApiException.class,()->service.remove(1L,101L,3L),state);
   assertThrows(ApiException.class,()->service.replace(1L,101L,new Crew(2L,"MEDICO"),3L),state);
  }
  assertNull(existing.getFechaBaja());verify(crews,never()).saveAndFlush(any());
 }
 @Test void aircraftCrewCapacityLimitsAssignments(){
  Aircraft plane=new Aircraft();plane.setMatricula("LV-CAP");plane.setCapacidadTripulacion((short)1);flight.setAircraft(plane);
  ApiException e=assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));
  assertEquals(org.springframework.http.HttpStatus.CONFLICT,e.status());
  plane.setCapacidadTripulacion((short)2);service.assign(1L,new Crew(2L,"MEDICO"),3L);
  verify(crews).saveAndFlush(argThat((FlightCrew c)->c.getUser()==member));
 }
 @Test void removalKeepsTheRowAsHistoryAndFreesThePerson(){
  FlightCrew existing=row(101L,flight,member,medico);when(crews.findById(101L)).thenReturn(Optional.of(existing));
  service.remove(1L,101L,3L);
  assertEquals(LocalDateTime.of(2030,1,1,12,0),existing.getFechaBaja());assertSame(actor,existing.getBajaPor());assertEquals("RETIRO",existing.getMotivoBaja());assertFalse(existing.isVigente());
  verify(crews,never()).delete(any());verify(crews,never()).deleteById(any());verify(crews).saveAndFlush(existing);
  verify(audit).record(eq(flight),eq(actor),eq("FLIGHT_CREW"),eq(101L),eq("REMOVE"),contains("\"MEDICO\""),contains("RETIRO"));
  verify(notifications).createOnce(eq(member),eq(flight),eq("CREW_REMOVED"),anyString(),eq("CREW_REMOVED:101"));
 }
 @Test void removingTheCommanderOrAnAlreadyRemovedMemberIsRejected(){
  FlightCrew commanderRow=row(100L,flight,commander,commanderRole);when(crews.findById(100L)).thenReturn(Optional.of(commanderRow));
  assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.remove(1L,100L,3L)).status());
  FlightCrew gone=row(101L,flight,member,medico);gone.darDeBaja(LocalDateTime.of(2030,1,1,10,0),actor,"RETIRO");when(crews.findById(101L)).thenReturn(Optional.of(gone));
  assertEquals(org.springframework.http.HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.remove(1L,101L,3L)).status());
  FlightCrew foreign=row(102L,flightWithState(7L,"PLANIFICADO",null,null),member,medico);when(crews.findById(102L)).thenReturn(Optional.of(foreign));
  assertEquals(org.springframework.http.HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.remove(1L,102L,3L)).status());
 }
 @Test void replacementClosesTheOldAssignmentAndCreatesANewOneKeepingBothAsHistory(){
  User newcomer=user(4L,"otro");CrewRole enfermero=new CrewRole();enfermero.setCodigo("ENFERMERO");enfermero.setNombre("Enfermero");
  FlightCrew existing=row(101L,flight,member,medico);when(crews.findById(101L)).thenReturn(Optional.of(existing));
  when(users.lockById(4L)).thenReturn(Optional.of(newcomer));when(roles.findByCodigo("ENFERMERO")).thenReturn(Optional.of(enfermero));when(qualifications.existsByUserIdAndRoleCodigo(4L,"ENFERMERO")).thenReturn(true);when(credentials.assess(any(),eq("ENFERMERO"),any())).thenReturn(new ProfessionalCredentialService.Assessment(true,"ELEGIBLE","Vigente",null));
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(1L)).thenReturn(List.of(row(100L,flight,commander,commanderRole),existing));
  service.replace(1L,101L,new Crew(4L,"ENFERMERO"),3L);
  assertEquals("REEMPLAZO",existing.getMotivoBaja());assertNotNull(existing.getFechaBaja());
  ArgumentCaptor<FlightCrew> saved=ArgumentCaptor.forClass(FlightCrew.class);verify(crews,times(2)).saveAndFlush(saved.capture());
  assertSame(existing,saved.getAllValues().get(0));assertSame(newcomer,saved.getAllValues().get(1).getUser());assertNull(saved.getAllValues().get(1).getFechaBaja());
  verify(audit).record(eq(flight),eq(actor),eq("FLIGHT_CREW"),any(),eq("REPLACE"),contains("\"MEDICO\""),contains("reemplazaAsignacionId"));
  verify(notifications).createOnce(eq(member),eq(flight),eq("CREW_REMOVED"),anyString(),anyString());verify(notifications).createOnce(eq(newcomer),eq(flight),eq("CREW_ASSIGNED"),anyString(),anyString());
  verify(crews,never()).delete(any());
 }
 @Test void usersInvolvedInAReplacementAreLockedInAscendingOrder(){
  User newcomer=user(1L,"primero");FlightCrew existing=row(101L,flight,member,medico);when(crews.findById(101L)).thenReturn(Optional.of(existing));when(users.lockById(1L)).thenReturn(Optional.of(newcomer));
  when(qualifications.existsByUserIdAndRoleCodigo(1L,"MEDICO")).thenReturn(true);when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(1L)).thenReturn(List.of(row(100L,flight,commander,commanderRole),existing));
  service.replace(1L,101L,new Crew(1L,"MEDICO"),3L);
  org.mockito.InOrder order=inOrder(users);order.verify(users).lockById(1L);order.verify(users).lockById(2L);
 }
 private CrewQualification vigente(long id,User u,CrewRole r){CrewQualification q=new CrewQualification();q.setId(id);q.setUser(u);q.setRole(r);q.setClassifier(actor);return q;}
 @Test void retiringAClassificationKeepsTheRowWithWhoWhenAndWhyAndAuditsIt(){
  CrewQualification q=vigente(70L,member,medico);when(qualifications.findByUserIdAndRoleCodigo(2L,"MEDICO")).thenReturn(Optional.of(q));when(crews.findByUserIdAndFechaBajaIsNull(2L)).thenReturn(List.of());
  service.unclassify(2L,"MEDICO","Cambio de función",3L);
  assertFalse(q.isVigente());assertEquals("Cambio de función",q.getRetireReason());assertSame(actor,q.getRetiredBy());assertNotNull(q.getRetiredAt());
  verify(qualifications).saveAndFlush(q);verify(qualifications,never()).delete(any());
  verify(audit).record(isNull(),eq(actor),eq("CREW_QUALIFICATION"),eq(70L),eq("RETIRE"),contains("MEDICO"),contains("Cambio de función"));
  CrewQualification other=vigente(71L,member,medico);when(qualifications.findByUserIdAndRoleCodigo(2L,"MEDICO")).thenReturn(Optional.of(other));service.unclassify(2L,"MEDICO",null,3L);assertEquals(CrewQualification.RETIRO_ADMINISTRATIVO,other.getRetireReason(),"sin motivo queda el retiro administrativo");
 }
 @Test void aClassificationInUseByACommittedFlightCannotBeRetiredAndNothingChanges(){
  CrewQualification q=vigente(72L,member,medico);when(qualifications.findByUserIdAndRoleCodigo(2L,"MEDICO")).thenReturn(Optional.of(q));
  when(crews.findByUserIdAndFechaBajaIsNull(2L)).thenReturn(List.of(row(101L,flight,member,medico)));
  ApiException e=assertThrows(ApiException.class,()->service.unclassify(2L,"MEDICO","x",3L));
  assertEquals(409,e.status().value());assertEquals("CLASIFICACION_EN_USO",e.code());assertTrue(q.isVigente());verify(qualifications,never()).saveAndFlush(any());
  Flight done=flightWithState(5L,"FINALIZADO",LocalDateTime.of(2029,1,1,0,0),LocalDateTime.of(2029,1,1,2,0));
  when(crews.findByUserIdAndFechaBajaIsNull(2L)).thenReturn(List.of(row(102L,done,member,medico)));
  service.unclassify(2L,"MEDICO","El vuelo ya terminó",3L);assertFalse(q.isVigente(),"un vuelo terminado es historia y no impide el retiro");
 }
 @Test void retiringACommanderClassificationAlsoProtectsAFlightThatOnlyReferencesTheCommanderField(){
  when(roles.findByCodigo("COMANDANTE")).thenReturn(Optional.of(commanderRole));CrewQualification q=vigente(73L,commander,commanderRole);when(qualifications.findByUserIdAndRoleCodigo(9L,"COMANDANTE")).thenReturn(Optional.of(q));when(crews.findByUserIdAndFechaBajaIsNull(9L)).thenReturn(List.of());
  when(flights.findByComandanteId(9L)).thenReturn(List.of(flight));
  assertEquals("CLASIFICACION_EN_USO",assertThrows(ApiException.class,()->service.unclassify(9L,"COMANDANTE","x",3L)).code());
 }
 @Test void unknownRolesAndMissingClassificationsAreRejectedWithCodes(){
  assertEquals(400,assertThrows(ApiException.class,()->service.classify(2L,"PILOTO_INEXISTENTE",3L)).status().value());
  assertEquals(400,assertThrows(ApiException.class,()->service.unclassify(2L,"PILOTO_INEXISTENTE",null,3L)).status().value());
  when(qualifications.findByUserIdAndRoleCodigo(2L,"MEDICO")).thenReturn(Optional.empty());
  ApiException e=assertThrows(ApiException.class,()->service.unclassify(2L,"MEDICO",null,3L));assertEquals(409,e.status().value());assertEquals("CLASIFICACION_NO_VIGENTE",e.code());
 }
 @Test void classifyingAnAlreadyClassifiedPersonDoesNotDuplicateOrRewriteTheClassification(){
  when(qualifications.existsByUserIdAndRoleCodigo(2L,"MEDICO")).thenReturn(true);service.classify(2L,"MEDICO",3L);
  verify(qualifications,never()).saveAndFlush(any());verify(audit,never()).record(any(),any(),eq("CREW_QUALIFICATION"),any(),any(),any(),any());
 }
 @Test void theQualificationViewShowsEligibilityForCurrentOnesAndKeepsRetiredOnesAsHistory(){
  CrewQualification current=vigente(80L,member,medico),retired=vigente(79L,member,medico);retired.retire(LocalDateTime.of(2029,12,1,0,0),actor,"Cambio de función");
  when(users.findById(2L)).thenReturn(Optional.of(member));when(qualifications.findAllByUserId(2L)).thenReturn(List.of(current,retired));when(qualifications.existsByUserIdAndRoleCodigo(2L,"MEDICO")).thenReturn(true);
  List<QualificationView> now=service.qualifications(2L,false),all=service.qualifications(2L,true);
  assertEquals(1,now.size());assertTrue(now.get(0).vigente());assertTrue(now.get(0).elegible());assertEquals("ELEGIBLE",now.get(0).elegibilidadCodigo());
  assertEquals(2,all.size());QualificationView old=all.get(1);assertFalse(old.vigente());assertEquals("Cambio de función",old.motivoBaja());assertEquals("ops3".equals(old.retiradoPor())||old.retiradoPor()!=null,true);assertNull(old.elegible());
  assertEquals(List.of("COMANDANTE","COPILOTO","MEDICO","ENFERMERO"),List.copyOf(CrewManagementService.RULES.keySet()));assertEquals("RECURSOS",CrewManagementService.RULES.get("COMANDANTE").asignacion());assertTrue(CrewManagementService.RULES.values().stream().allMatch(CrewManagementService.RoleRule::requiereHabilitacionVerificada));
 }
 @Test void aFlightWithoutPlannedArrivalIsEvaluatedAtItsDepartureInsteadOfFailing(){
  flight.setFechaPlanificadaLlegada(null); // solicitud sanitaria aprobada: ya tiene salida y todavía no la planificación del comandante
  User busy=user(5L,"ocupado"),free=user(6L,"libre");
  Flight covering=flightWithState(8L,"PLANIFICADO",LocalDateTime.of(2030,1,1,22,0),LocalDateTime.of(2030,1,2,2,0)),later=flightWithState(9L,"PLANIFICADO",LocalDateTime.of(2030,1,2,6,0),LocalDateTime.of(2030,1,2,8,0));
  when(qualifications.findByRoleCodigo("MEDICO")).thenReturn(List.of(classified(busy),classified(free)));when(qualifications.existsByUserIdAndRoleCodigo(5L,"MEDICO")).thenReturn(true);when(qualifications.existsByUserIdAndRoleCodigo(6L,"MEDICO")).thenReturn(true);
  when(crews.findByUserIdAndFechaBajaIsNull(5L)).thenReturn(List.of(row(61L,covering,busy,medico)));when(crews.findByUserIdAndFechaBajaIsNull(6L)).thenReturn(List.of(row(62L,later,free,medico)));
  assertFalse(assertDoesNotThrow(()->service.evaluate(flight,busy,"MEDICO",true)).eligible(),"su compromiso cubre el instante de salida");
  assertTrue(assertDoesNotThrow(()->service.evaluate(flight,free,"MEDICO",true)).eligible(),"un compromiso posterior a la salida no lo bloquea");
 }
 @Test void candidatesExposeTheConflictInsteadOfHidingTheReason(){
  User busy=user(5L,"ocupado");busy.getPerson().setNombre("Ocupado");
  Flight other=flightWithState(8L,"PLANIFICADO",LocalDateTime.of(2030,1,2,0,30),LocalDateTime.of(2030,1,2,2,0));
  when(qualifications.findByRoleCodigo("MEDICO")).thenReturn(List.of(classified(member),classified(busy)));when(qualifications.existsByUserIdAndRoleCodigo(5L,"MEDICO")).thenReturn(true);
  when(crews.findByUserIdAndFechaBajaIsNull(5L)).thenReturn(List.of(row(60L,other,busy,medico)));
  List<CrewCandidateView> list=service.candidates(1L,"MEDICO");
  assertEquals(2,list.size());
  CrewCandidateView free=list.stream().filter(c->c.userId()==2L).findFirst().orElseThrow(),taken=list.stream().filter(c->c.userId()==5L).findFirst().orElseThrow();
  assertTrue(free.disponible());assertNull(free.motivoNoDisponible());assertFalse(taken.disponible());assertTrue(taken.motivoNoDisponible().contains("V-8"));
  assertEquals(1,service.available(1L,"MEDICO").size());
 }
}
