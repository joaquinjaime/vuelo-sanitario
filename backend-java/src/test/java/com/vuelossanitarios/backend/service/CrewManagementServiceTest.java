package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.Crew;
import com.vuelossanitarios.backend.domain.catalog.Aircraft;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

/** Asignación del copiloto (V66): un usuario COMANDANTE sin clasificación, política ni habilitación, con control de horarios, duplicados, capacidad e historial. */
class CrewManagementServiceTest {
 private final FlightRepository flights=mock(FlightRepository.class);
 private final FlightCrewRepository crews=mock(FlightCrewRepository.class);
 private final UserRepository users=mock(UserRepository.class);
 private final CrewRoleRepository roles=mock(CrewRoleRepository.class);
 private final AuditService audit=mock(AuditService.class);
 private final NotificationService notifications=mock(NotificationService.class);
 private final Clock clock=Clock.fixed(Instant.parse("2030-01-01T12:00:00Z"),ZoneId.of("UTC"));
 private final CrewManagementService service=new CrewManagementService(flights,crews,users,roles,audit,notifications,clock);
 private Flight flight; private User copilot,commander,actor; private CrewRole copilotRole,commanderRole;

 /** Cuenta activa con rol de acceso COMANDANTE y licencia registrada: es todo lo que se exige. */
 private static User commanderAccount(long id,String username){
  User u=new User();u.setId(id);u.setUsername(username);u.setActivo(true);u.setEstadoCuenta("ACTIVO");
  Person p=new Person();p.setNombre("N"+id);p.setApellido("A"+id);u.setPerson(p);
  CommanderProfile profile=new CommanderProfile();profile.setPerson(p);profile.setLicenseNumber("LIC"+id);p.setCommanderProfile(profile);
  Role r=new Role();r.setCodigo("COMANDANTE");r.setNombre("Comandante");r.setActivo(true);u.getUserRoles().add(new UserRole(u,r));
  return u;
 }
 private static Flight flightWithState(long id,String state,LocalDateTime from,LocalDateTime to){Flight f=new Flight();f.setId(id);if(state!=null){FlightStatus s=new FlightStatus();s.setCodigo(state);f.setEstadoVuelo(s);}f.setFechaPlanificadaSalida(from);f.setFechaPlanificadaLlegada(to);f.setCodigo("V-"+id);return f;}
 private FlightCrew row(long id,Flight f,User u,CrewRole r){FlightCrew c=new FlightCrew();c.setId(id);c.setFlight(f);c.setUser(u);c.setCrewRole(r);return c;}

 @BeforeEach void setup(){
  flight=flightWithState(1L,"PLANIFICADO",LocalDateTime.of(2030,1,1,23,0),LocalDateTime.of(2030,1,2,1,0));
  copilot=commanderAccount(2L,"copiloto");commander=commanderAccount(9L,"comandante");actor=commanderAccount(3L,"ops");
  copilotRole=new CrewRole();copilotRole.setCodigo("COPILOTO");copilotRole.setNombre("Copiloto");commanderRole=new CrewRole();commanderRole.setCodigo("COMANDANTE");commanderRole.setNombre("Comandante");
  flight.setComandante(commander);
  when(flights.lockById(1L)).thenReturn(Optional.of(flight));when(flights.findById(1L)).thenReturn(Optional.of(flight));
  when(users.lockById(2L)).thenReturn(Optional.of(copilot));when(users.lockById(9L)).thenReturn(Optional.of(commander));when(users.findById(3L)).thenReturn(Optional.of(actor));
  when(roles.findByCodigo("COPILOTO")).thenReturn(Optional.of(copilotRole));when(roles.findByCodigo("COMANDANTE")).thenReturn(Optional.of(commanderRole));
  when(crews.saveAndFlush(any(FlightCrew.class))).thenAnswer(i->i.getArgument(0));
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(1L)).thenReturn(List.of(row(100L,flight,commander,commanderRole)));
 }
 private ApiException rejected(Runnable r){return assertThrows(ApiException.class,r::run);}

 @Test void aCommanderAccountIsAssignableAsCopilotWithoutClassificationPolicyOrCredential(){
  service.assign(1L,new Crew(2L,"COPILOTO"),3L);
  ArgumentCaptor<FlightCrew> saved=ArgumentCaptor.forClass(FlightCrew.class);verify(crews).saveAndFlush(saved.capture());
  assertSame(copilot,saved.getValue().getUser());assertEquals("COPILOTO",saved.getValue().getCrewRole().getCodigo());assertSame(actor,saved.getValue().getAsignadoPor());
  verify(audit).record(eq(flight),eq(actor),eq("FLIGHT_CREW"),any(),eq("CREATE"),isNull(),contains("COPILOTO"));
  verify(notifications).createOnce(eq(copilot),eq(flight),eq("CREW_ASSIGNED"),contains("Copiloto"),any());
 }
 @Test void aFlightWithoutKnownDepartureCannotReceiveACopilot(){
  flight.setFechaPlanificadaSalida(null);rejected(()->service.assign(1L,new Crew(2L,"COPILOTO"),3L));verify(crews,never()).saveAndFlush(any());
 }
 @Test void aReservedFlightWithoutArrivalAcceptsACopilotBecauseOnlyTheDepartureIsRequired(){
  flight.setFechaPlanificadaLlegada(null);flight.setEstadoVuelo(null);
  service.assign(1L,new Crew(2L,"COPILOTO"),3L);verify(crews).saveAndFlush(any(FlightCrew.class));
 }
 @Test void nonCommanderAccountsAndMedicalRolesCannotBeAssignedAsCrewWithAccount(){
  User plain=commanderAccount(5L,"sin-licencia");plain.getPerson().getCommanderProfile().setLicenseNumber(" ");when(users.lockById(5L)).thenReturn(Optional.of(plain));
  assertEquals("PERFIL_COMANDANTE_INCOMPLETO",rejected(()->service.assign(1L,new Crew(5L,"COPILOTO"),3L)).code());
  User noRole=commanderAccount(6L,"sin-rol");noRole.getUserRoles().clear();when(users.lockById(6L)).thenReturn(Optional.of(noRole));
  assertEquals("PERFIL_COMANDANTE_INCOMPLETO",rejected(()->service.assign(1L,new Crew(6L,"COPILOTO"),3L)).code());
  assertEquals(400,rejected(()->service.assign(1L,new Crew(2L,"MEDICO"),3L)).status().value());
  assertEquals(400,rejected(()->service.assign(1L,new Crew(2L,"ENFERMERO"),3L)).status().value());
  verify(crews,never()).saveAndFlush(any());
 }
 @Test void deactivatedOrPendingAccountsAreRejected(){
  copilot.setActivo(false);assertEquals("CUENTA_INACTIVA",rejected(()->service.assign(1L,new Crew(2L,"COPILOTO"),3L)).code());
  copilot.setActivo(true);copilot.setEstadoCuenta("PENDIENTE_ACTIVACION");assertEquals("CUENTA_INACTIVA",rejected(()->service.assign(1L,new Crew(2L,"COPILOTO"),3L)).code());
 }
 @Test void theMainCommanderCannotAlsoBeTheCopilotOfTheSameFlight(){
  var e=rejected(()->service.assign(1L,new Crew(9L,"COPILOTO"),3L));assertEquals(409,e.status().value());assertTrue(e.getMessage().contains("comandante principal"));
  verify(crews,never()).saveAndFlush(any());
 }
 @Test void samePersonCannotJoinTheSameFlightTwice(){
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(1L)).thenReturn(List.of(row(100L,flight,commander,commanderRole),row(101L,flight,copilot,copilotRole)));
  assertEquals(409,rejected(()->service.assign(1L,new Crew(2L,"COPILOTO"),3L)).status().value());verify(crews,never()).saveAndFlush(any());
 }
 @Test void theCommanderIsNotAssignedAsAdditionalCrew(){assertEquals(400,rejected(()->service.assign(1L,new Crew(9L,"COMANDANTE"),3L)).status().value());}

 // ---- disponibilidad horaria (como comandante o como copiloto)
 private void otherCommitment(Flight other,CrewRole role){when(crews.findByUserIdAndFechaBajaIsNull(2L)).thenReturn(List.of(row(200L,other,copilot,role)));}
 @Test void anOverlappingFlightOfThePersonBlocksTheAssignmentWhateverHerFunctionThere(){
  Flight other=flightWithState(4L,"PLANIFICADO",LocalDateTime.of(2030,1,1,22,0),LocalDateTime.of(2030,1,2,0,30));otherCommitment(other,copilotRole);
  var e=rejected(()->service.assign(1L,new Crew(2L,"COPILOTO"),3L));assertEquals("CONFLICTO_ASIGNACION",e.code());assertEquals(409,e.status().value());
  reset(crews);when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(1L)).thenReturn(List.of(row(100L,flight,commander,commanderRole)));
  other.setComandante(copilot);when(crews.findByUserIdAndFechaBajaIsNull(2L)).thenReturn(List.of());when(flights.findByComandanteId(2L)).thenReturn(List.of(other));
  assertEquals("CONFLICTO_ASIGNACION",rejected(()->service.assign(1L,new Crew(2L,"COPILOTO"),3L)).code());
 }
 @Test void aPreviousFlightThatEndsAfterThisOneDepartsIsAConflict(){
  Flight a=flightWithState(4L,"PLANIFICADO",LocalDateTime.of(2030,1,1,20,0),LocalDateTime.of(2030,1,1,23,30));otherCommitment(a,copilotRole);
  assertEquals("CONFLICTO_ASIGNACION",rejected(()->service.assign(1L,new Crew(2L,"COPILOTO"),3L)).code());
 }
 @Test void chainedFlightsAreCompatibleWhenTheFirstEndsBeforeTheSecondDeparts(){
  Flight a=flightWithState(4L,"PLANIFICADO",LocalDateTime.of(2030,1,1,18,0),LocalDateTime.of(2030,1,1,22,59));otherCommitment(a,copilotRole);
  service.assign(1L,new Crew(2L,"COPILOTO"),3L);verify(crews).saveAndFlush(any(FlightCrew.class));
 }
 @Test void anotherFlightWithoutArrivalThatMayStillBeRunningIsReportedAsIndeterminateAndNotConfirmed(){
  Flight other=flightWithState(4L,"PLANIFICADO",LocalDateTime.of(2030,1,1,20,0),null);otherCommitment(other,copilotRole);
  var e=rejected(()->service.assign(1L,new Crew(2L,"COPILOTO"),3L));assertEquals("HORARIO_INDETERMINADO",e.code());assertTrue(e.getMessage().contains("V-4"));verify(crews,never()).saveAndFlush(any());
 }
 @Test void aLaterFlightWithoutArrivalDoesNotBlockWhenThisOneEndsBeforeItDeparts(){
  Flight later=flightWithState(4L,"PLANIFICADO",LocalDateTime.of(2030,1,2,6,0),null);otherCommitment(later,copilotRole);
  service.assign(1L,new Crew(2L,"COPILOTO"),3L);verify(crews).saveAndFlush(any(FlightCrew.class));
 }
 @Test void cancelledOrFinishedFlightsOfThePersonDoNotBlock(){
  otherCommitment(flightWithState(4L,"CANCELADO",flight.getFechaPlanificadaSalida(),flight.getFechaPlanificadaLlegada()),copilotRole);
  service.assign(1L,new Crew(2L,"COPILOTO"),3L);verify(crews).saveAndFlush(any(FlightCrew.class));
 }
 @Test void theOverdueFinalReportBlockOnlyAppliesToTheMainCommander(){
  var access=mock(CommanderReportAccessService.class);when(access.isBlocked(anyLong())).thenReturn(true);
  org.springframework.test.util.ReflectionTestUtils.setField(service,"commanderAccess",access);
  assertEquals("INFORME_FINAL_VENCIDO",service.evaluate(flight,copilot,"COMANDANTE",false).code());
  assertTrue(service.evaluate(flight,copilot,"COPILOTO",false).eligible());
 }

 @Test void startedFinishedOrCancelledFlightsDoNotAllowCrewChanges(){
  for(String state:List.of("EN_CURSO","FINALIZADO","COMPLETADO","CANCELADO")){flight.setEstadoVuelo(new FlightStatus());flight.getEstadoVuelo().setCodigo(state);
   assertEquals(400,rejected(()->service.assign(1L,new Crew(2L,"COPILOTO"),3L)).status().value());}
  verify(crews,never()).saveAndFlush(any());
 }
 @Test void aircraftCrewCapacityLimitsAssignments(){
  Aircraft plane=new Aircraft();plane.setMatricula("LV-X");plane.setCapacidadTripulacion((short)1);flight.setAircraft(plane);
  assertEquals(409,rejected(()->service.assign(1L,new Crew(2L,"COPILOTO"),3L)).status().value());
  plane.setCapacidadTripulacion((short)2);service.assign(1L,new Crew(2L,"COPILOTO"),3L);verify(crews).saveAndFlush(any(FlightCrew.class));
 }
 @Test void healthStaffAssignedByTheDtsAlsoOccupiesSeats(){
  var staff=mock(FlightHealthStaffRepository.class);org.springframework.test.util.ReflectionTestUtils.setField(service,"healthStaff",staff);
  when(staff.findCurrentByFlightId(1L)).thenReturn(List.of(new com.vuelossanitarios.backend.domain.flight.FlightHealthStaff(),new com.vuelossanitarios.backend.domain.flight.FlightHealthStaff()));
  Aircraft plane=new Aircraft();plane.setMatricula("LV-X");plane.setCapacidadTripulacion((short)3);flight.setAircraft(plane);
  assertEquals(409,rejected(()->service.assign(1L,new Crew(2L,"COPILOTO"),3L)).status().value());
 }

 // ---- retiro y reemplazo conservan el historial
 @Test void removalKeepsTheRowAsHistoryAndFreesThePerson(){
  FlightCrew row=row(101L,flight,copilot,copilotRole);when(crews.findById(101L)).thenReturn(Optional.of(row));
  service.remove(1L,101L,3L);
  assertFalse(row.isVigente());assertEquals(FlightCrew.BAJA_RETIRO,row.getMotivoBaja());assertSame(actor,row.getBajaPor());
  verify(crews,never()).delete(any(FlightCrew.class));verify(crews,never()).deleteById(any());
  verify(audit).record(eq(flight),eq(actor),eq("FLIGHT_CREW"),eq(101L),eq("REMOVE"),any(),contains("RETIRO"));
 }
 @Test void theMainCommanderOrAnAlreadyRemovedMemberCannotBeRemoved(){
  FlightCrew main=row(100L,flight,commander,commanderRole);when(crews.findById(100L)).thenReturn(Optional.of(main));
  assertEquals(400,rejected(()->service.remove(1L,100L,3L)).status().value());
  FlightCrew gone=row(102L,flight,copilot,copilotRole);gone.darDeBaja(LocalDateTime.now(clock),actor,FlightCrew.BAJA_RETIRO);when(crews.findById(102L)).thenReturn(Optional.of(gone));
  assertEquals(409,rejected(()->service.remove(1L,102L,3L)).status().value());
 }
 @Test void replacementClosesTheOldAssignmentAndCreatesANewOneKeepingBothAsHistory(){
  User other=commanderAccount(7L,"otro");when(users.lockById(7L)).thenReturn(Optional.of(other));
  FlightCrew old=row(101L,flight,copilot,copilotRole);when(crews.findById(101L)).thenReturn(Optional.of(old));
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(1L)).thenReturn(List.of(row(100L,flight,commander,commanderRole),old));
  service.replace(1L,101L,new Crew(7L,"COPILOTO"),3L);
  assertEquals(FlightCrew.BAJA_REEMPLAZO,old.getMotivoBaja());
  ArgumentCaptor<FlightCrew> saved=ArgumentCaptor.forClass(FlightCrew.class);verify(crews,atLeastOnce()).saveAndFlush(saved.capture());
  assertTrue(saved.getAllValues().stream().anyMatch(c->c.getUser()==other&&c.isVigente()));
  verify(notifications).createOnce(eq(copilot),eq(flight),eq("CREW_REMOVED"),any(),any());verify(notifications).createOnce(eq(other),eq(flight),eq("CREW_ASSIGNED"),any(),any());
 }
 @Test void usersInvolvedInAReplacementAreLockedInAscendingOrder(){
  User other=commanderAccount(1L,"menor");when(users.lockById(1L)).thenReturn(Optional.of(other));
  FlightCrew old=row(101L,flight,copilot,copilotRole);when(crews.findById(101L)).thenReturn(Optional.of(old));
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(1L)).thenReturn(List.of(row(100L,flight,commander,commanderRole),old));
  service.replace(1L,101L,new Crew(1L,"COPILOTO"),3L);
  InOrder order=inOrder(flights,users);order.verify(flights).lockById(1L);order.verify(users).lockById(1L);order.verify(users).lockById(2L);
 }

 // ---- requisitos explicados
 @Test void requirementsExplainEachConditionWithoutAnyProfessionalCertificationStep(){
  var list=service.requirements(flight,copilot,"COPILOTO");
  assertEquals(List.of("CUENTA_ACTIVA","ROL_ACCESO","LICENCIA","DISPONIBILIDAD"),list.stream().map(r->r.codigo()).toList());
  assertTrue(list.stream().allMatch(r->r.cumplido()));
  assertTrue(list.stream().filter(r->r.codigo().equals("LICENCIA")).findFirst().orElseThrow().mensaje().contains("no verificado"));
  copilot.getPerson().getCommanderProfile().setLicenseNumber("");
  var missing=service.requirements(flight,copilot,"COPILOTO").stream().filter(r->!r.cumplido()).toList();
  assertEquals(1,missing.size());assertEquals("LICENCIA",missing.get(0).codigo());assertEquals("ADMINISTRADOR",missing.get(0).resuelve());
 }
 @Test void historicalMedicalCrewRowsAreNotReevaluated(){
  assertTrue(service.evaluate(flight,copilot,"MEDICO",true).eligible());assertEquals("HISTORICO",service.evaluate(flight,copilot,"ENFERMERO",true).code());
 }
}
