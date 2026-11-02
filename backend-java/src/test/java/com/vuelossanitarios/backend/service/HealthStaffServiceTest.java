package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.HealthStaffDtos.*;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.catalog.SanitaryRequestStatus;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Personal sanitario del DTS (V66): registro sencillo sin cuenta, pertenencia por DTS, asignación a vuelos aprobados, historial e incompatibilidades. */
class HealthStaffServiceTest {
 private final HealthStaffRepository staff=mock(HealthStaffRepository.class);
 private final FlightHealthStaffRepository assignments=mock(FlightHealthStaffRepository.class);
 private final PersonRepository persons=mock(PersonRepository.class);
 private final UserRepository users=mock(UserRepository.class);
 private final PatientRepository patients=mock(PatientRepository.class);
 private final FlightRepository flights=mock(FlightRepository.class);
 private final SanitaryFlightRepository sanitary=mock(SanitaryFlightRepository.class);
 private final AuditService audit=mock(AuditService.class);
 private final FlightAuthorizationService access=mock(FlightAuthorizationService.class);
 private final Clock clock=Clock.fixed(Instant.parse("2030-01-01T12:00:00Z"),ZoneId.of("UTC"));
 private final HealthStaffService service=new HealthStaffService(staff,assignments,persons,users,patients,flights,sanitary,audit,access,clock);
 private User dts,otherDts;private Flight flight;private SanitaryFlight request;

 private static User user(long id,String username){User u=new User();u.setId(id);u.setUsername(username);Person p=new Person();p.setNombre("U"+id);p.setApellido("A"+id);u.setPerson(p);return u;}
 private static Flight flight(long id,String state,LocalDateTime from,LocalDateTime to){Flight f=new Flight();f.setId(id);f.setCodigo("V-"+id);if(state!=null){FlightStatus s=new FlightStatus();s.setCodigo(state);f.setEstadoVuelo(s);}f.setFechaPlanificadaSalida(from);f.setFechaPlanificadaLlegada(to);return f;}
 private HealthStaff professional(long id,User owner,String type,String registration,boolean active){Person p=new Person();p.setNombre("Nombre"+id);p.setApellido("Apellido"+id);p.setDni("2000000"+id);HealthStaff h=new HealthStaff();h.setId(id);h.setOwner(owner);h.setPerson(p);h.setType(type);h.setRegistration(registration);if(!active)h.deactivate(LocalDateTime.now(clock));return h;}
 private void state(SanitaryFlight s,String code){SanitaryRequestStatus st=new SanitaryRequestStatus();st.setCodigo(code);s.setEstadoSolicitud(st);}

 @BeforeEach void setup(){
  dts=user(1L,"dts1");otherDts=user(2L,"dts2");
  flight=flight(10L,"PLANIFICADO",LocalDateTime.of(2030,1,5,10,0),LocalDateTime.of(2030,1,5,13,0));
  request=new SanitaryFlight();request.setFlight(flight);request.setSolicitadoPor(dts);state(request,"APROBADO");
  when(users.findById(1L)).thenReturn(Optional.of(dts));when(users.findById(2L)).thenReturn(Optional.of(otherDts));
  when(flights.findById(10L)).thenReturn(Optional.of(flight));when(flights.lockById(10L)).thenReturn(Optional.of(flight));
  when(sanitary.findByFlightId(10L)).thenReturn(Optional.of(request));
  when(staff.saveAndFlush(any(HealthStaff.class))).thenAnswer(i->{HealthStaff h=i.getArgument(0);if(h.getId()==null)h.setId(500L);return h;});
  when(assignments.saveAndFlush(any(FlightHealthStaff.class))).thenAnswer(i->{FlightHealthStaff a=i.getArgument(0);if(a.getId()==null)a.setId(900L);return a;});
 }
 private ApiException rejected(Runnable r){return assertThrows(ApiException.class,r::run);}

 // ---- catálogo
 @Test void aDoctorIsRegisteredWithOnlyBasicDataAndWithoutAnyAccount(){
  StaffView view=service.create(new StaffInput("Juan","Pérez","30.111.222","MEDICO","MP-1234"),1L);
  assertEquals("MEDICO",view.tipoProfesional());assertEquals("MP-1234",view.matricula());assertTrue(view.activo());assertEquals("30111222",view.dni());
  ArgumentCaptor<Person> person=ArgumentCaptor.forClass(Person.class);verify(persons).saveAndFlush(person.capture());assertEquals("30111222",person.getValue().getDni());
  ArgumentCaptor<HealthStaff> saved=ArgumentCaptor.forClass(HealthStaff.class);verify(staff).saveAndFlush(saved.capture());assertSame(dts,saved.getValue().getOwner());
  verify(users,never()).save(any());verify(audit).record(isNull(),eq(dts),eq("HEALTH_STAFF"),any(),eq("CREATE"),isNull(),contains("MEDICO"));
 }
 @Test void aNurseIsRegisteredTheSameWay(){
  assertEquals("ENFERMERO",service.create(new StaffInput("Laura","Díaz","31222333","ENFERMERO","ME-77"),1L).tipoProfesional());verify(users,never()).save(any());
 }
 @Test void anExistingIdentityIsReusedOnlyWhenTheNameMatchesAndNeverMerged(){
  Person known=new Person();known.setId(77L);known.setNombre("Ana");known.setApellido("García");known.setDni("40111222");
  when(persons.findByDniForUpdate("40111222")).thenReturn(Optional.of(known));
  service.create(new StaffInput("ana","GARCIA","40111222","MEDICO","MP-9"),1L);
  verify(persons,never()).saveAndFlush(any());ArgumentCaptor<HealthStaff> saved=ArgumentCaptor.forClass(HealthStaff.class);verify(staff).saveAndFlush(saved.capture());assertSame(known,saved.getValue().getPerson());
  var e=rejected(()->service.create(new StaffInput("Otra","Persona","40111222","MEDICO","MP-10"),1L));assertEquals("STAFF_IDENTITY_CONFLICT",e.code());assertEquals(409,e.status().value());
 }
 @Test void theSamePersonOrRegistrationCannotBeRegisteredTwiceInTheSameCatalog(){
  Person known=new Person();known.setId(77L);known.setNombre("Ana");known.setApellido("García");known.setDni("40111222");when(persons.findByDniForUpdate("40111222")).thenReturn(Optional.of(known));
  when(staff.findByOwnerIdAndPersonId(1L,77L)).thenReturn(Optional.of(professional(5L,dts,"MEDICO","X",true)));
  assertEquals("STAFF_ALREADY_REGISTERED",rejected(()->service.create(new StaffInput("Ana","García","40111222","MEDICO","MP-9"),1L)).code());
  when(staff.registrationTaken(1L,"MEDICO","MP-5",null)).thenReturn(true);
  assertEquals("STAFF_REGISTRATION_TAKEN",rejected(()->service.create(new StaffInput("Nuevo","Nombre","50111222","MEDICO","MP-5"),1L)).code());
 }
 @Test void invalidDniIsRejected(){
  assertEquals(400,rejected(()->service.create(new StaffInput("A","B","abc","MEDICO","1"),1L)).status().value());
  assertEquals(400,rejected(()->service.create(new StaffInput("A","B","123","MEDICO","1"),1L)).status().value());
 }
 @Test void aDtsCannotSeeOrModifyTheStaffOfAnotherDts(){
  when(staff.findOwned(5L,2L)).thenReturn(Optional.empty());
  assertEquals(404,rejected(()->service.update(5L,new StaffUpdate("A","B","30111222","MEDICO","1",0L),2L)).status().value());
  assertEquals(404,rejected(()->service.setActive(5L,new ActiveRequest(false,0L),2L)).status().value());
  verify(staff,never()).saveAndFlush(any());
 }
 @Test void updatingKeepsTheIdentityWhenItBelongsToAnAccountOrAPatient(){
  HealthStaff h=professional(5L,dts,"MEDICO","MP-1",true);when(staff.findOwned(5L,1L)).thenReturn(Optional.of(h));when(staff.lockById(5L)).thenReturn(Optional.of(h));
  User account=user(9L,"cuenta");when(users.findByPersonId(any())).thenReturn(Optional.of(account));
  assertEquals("STAFF_IDENTITY_SHARED",rejected(()->service.update(5L,new StaffUpdate("Otro","Nombre",h.getPerson().getDni(),"MEDICO","MP-1",h.getVersion()),1L)).code());
  StaffView ok=service.update(5L,new StaffUpdate(h.getPerson().getNombre(),h.getPerson().getApellido(),h.getPerson().getDni(),"MEDICO","MP-2",h.getVersion()),1L);assertEquals("MP-2",ok.matricula());
 }
 @Test void staleVersionsAreRejected(){
  HealthStaff h=professional(5L,dts,"MEDICO","MP-1",true);when(staff.findOwned(5L,1L)).thenReturn(Optional.of(h));when(staff.lockById(5L)).thenReturn(Optional.of(h));
  assertEquals("STAFF_STALE",rejected(()->service.update(5L,new StaffUpdate(h.getPerson().getNombre(),h.getPerson().getApellido(),h.getPerson().getDni(),"MEDICO","MP-2",99L),1L)).code());
 }
 @Test void deactivationKeepsTheHistoryButIsRejectedWhileTheProfessionalIsOnAnOpenFlight(){
  HealthStaff h=professional(5L,dts,"MEDICO","MP-1",true);when(staff.findOwned(5L,1L)).thenReturn(Optional.of(h));when(staff.lockById(5L)).thenReturn(Optional.of(h));
  FlightHealthStaff a=new FlightHealthStaff();a.setFlight(flight);a.setStaff(h);when(assignments.findCurrentByStaffId(5L)).thenReturn(List.of(a));
  var e=rejected(()->service.setActive(5L,new ActiveRequest(false,h.getVersion()),1L));assertEquals("STAFF_IN_USE",e.code());assertTrue(h.isActive());
  when(assignments.findCurrentByStaffId(5L)).thenReturn(List.of());
  StaffView view=service.setActive(5L,new ActiveRequest(false,h.getVersion()),1L);assertFalse(view.activo());assertNotNull(h.getDeactivatedAt());verify(staff,never()).delete(any());
  assertTrue(service.setActive(5L,new ActiveRequest(true,h.getVersion()),1L).activo());
 }

 // ---- asignación a vuelos
 private HealthStaff available(long id,String type){HealthStaff h=professional(id,dts,type,"M"+id,true);when(staff.lockById(id)).thenReturn(Optional.of(h));return h;}
 @Test void theDtsAssignsADoctorAndANurseToAnApprovedFlight(){
  available(5L,"MEDICO");available(6L,"ENFERMERO");
  FlightStaffView doctor=service.assign(10L,new AssignStaff(5L),1L),nurse=service.assign(10L,new AssignStaff(6L),1L);
  assertEquals("MEDICO",doctor.tipoProfesional());assertEquals("ENFERMERO",nurse.tipoProfesional());assertTrue(doctor.vigente());
  verify(audit,times(2)).record(eq(flight),eq(dts),eq("FLIGHT_HEALTH_STAFF"),any(),eq("CREATE"),isNull(),any());
 }
 @Test void aReservedFlightWithoutStateAlsoAcceptsStaffAsLongAsTheRequestIsApproved(){
  flight.setEstadoVuelo(null);available(5L,"MEDICO");assertTrue(service.assign(10L,new AssignStaff(5L),1L).vigente());
 }
 @Test void staffCannotBeAssignedBeforeTheScheduleIsAgreedNorOnceTheFlightStartedOrFinished(){
  available(5L,"MEDICO");
  state(request,"SOLICITADO");assertEquals("STAFF_FLIGHT_NOT_CONFIRMED",rejected(()->service.assign(10L,new AssignStaff(5L),1L)).code());
  state(request,"APROBADO");
  for(String s:List.of("EN_CURSO","FINALIZADO","COMPLETADO","CANCELADO")){flight.setEstadoVuelo(new FlightStatus());flight.getEstadoVuelo().setCodigo(s);assertEquals("STAFF_FLIGHT_LOCKED",rejected(()->service.assign(10L,new AssignStaff(5L),1L)).code());}
  verify(assignments,never()).saveAndFlush(any());
 }
 @Test void onlyTheRequestingDtsManagesTheStaffOfAFlightAndOnlyWithItsOwnProfessionals(){
  available(5L,"MEDICO");assertEquals(403,rejected(()->service.assign(10L,new AssignStaff(5L),2L)).status().value());
  HealthStaff foreign=professional(7L,otherDts,"MEDICO","Z",true);when(staff.lockById(7L)).thenReturn(Optional.of(foreign));
  assertEquals(404,rejected(()->service.assign(10L,new AssignStaff(7L),1L)).status().value());
  verify(assignments,never()).saveAndFlush(any());
 }
 @Test void aNonSanitaryFlightDoesNotAdmitStaff(){
  when(sanitary.findByFlightId(10L)).thenReturn(Optional.empty());available(5L,"MEDICO");assertEquals(400,rejected(()->service.assign(10L,new AssignStaff(5L),1L)).status().value());
 }
 @Test void inactiveOrDuplicateProfessionalsAreRejected(){
  HealthStaff off=professional(8L,dts,"MEDICO","Q",false);when(staff.lockById(8L)).thenReturn(Optional.of(off));
  assertEquals("STAFF_INACTIVE",rejected(()->service.assign(10L,new AssignStaff(8L),1L)).code());
  available(5L,"MEDICO");when(assignments.existsByFlightIdAndStaffIdAndRemovedAtIsNull(10L,5L)).thenReturn(true);
  assertEquals("STAFF_DUPLICATE",rejected(()->service.assign(10L,new AssignStaff(5L),1L)).code());
 }
 @Test void simultaneousFlightsOfTheSameProfessionalAreRejectedWhenTheirSchedulesAreDefined(){
  HealthStaff h=available(5L,"MEDICO");
  Flight other=flight(11L,"PLANIFICADO",LocalDateTime.of(2030,1,5,12,0),LocalDateTime.of(2030,1,5,15,0));FlightHealthStaff existing=new FlightHealthStaff();existing.setFlight(other);existing.setStaff(h);
  when(assignments.findCurrentByStaffId(5L)).thenReturn(List.of(existing));
  var e=rejected(()->service.assign(10L,new AssignStaff(5L),1L));assertEquals("STAFF_TIME_CONFLICT",e.code());assertTrue(e.getMessage().contains("V-11"));
  other.setFechaPlanificadaSalida(LocalDateTime.of(2030,1,5,13,0));other.setFechaPlanificadaLlegada(LocalDateTime.of(2030,1,5,15,0));
  assertTrue(service.assign(10L,new AssignStaff(5L),1L).vigente(),"salir justo cuando termina el otro vuelo no es un conflicto");
 }
 @Test void aFlightWithoutADefinedScheduleNeverBlocksAndAnOpenEndedOneOccupiesFromItsDeparture(){
  HealthStaff h=available(5L,"MEDICO");Flight other=flight(11L,"PLANIFICADO",LocalDateTime.of(2030,1,5,10,30),null);FlightHealthStaff existing=new FlightHealthStaff();existing.setFlight(other);existing.setStaff(h);
  when(assignments.findCurrentByStaffId(5L)).thenReturn(List.of(existing));
  assertEquals("STAFF_TIME_CONFLICT",rejected(()->service.assign(10L,new AssignStaff(5L),1L)).code());
  other.setFechaPlanificadaSalida(null);assertTrue(service.assign(10L,new AssignStaff(5L),1L).vigente());
 }
 @Test void removalAndReplacementKeepTheParticipationAsHistory(){
  HealthStaff first=available(5L,"MEDICO"),second=available(6L,"MEDICO");
  FlightHealthStaff current=new FlightHealthStaff();current.setId(900L);current.setFlight(flight);current.setStaff(first);current.setAssignedBy(dts);when(assignments.findById(900L)).thenReturn(Optional.of(current));
  FlightStaffView replaced=service.replace(10L,900L,new AssignStaff(6L),1L);
  assertFalse(current.isCurrent());assertEquals(FlightHealthStaff.REPLACEMENT,current.getRemovalReason());assertSame(dts,current.getRemovedBy());assertEquals(6L,replaced.personalSanitarioId());
  verify(assignments,never()).delete(any(FlightHealthStaff.class));verify(audit).record(eq(flight),eq(dts),eq("FLIGHT_HEALTH_STAFF"),any(),eq("REPLACE"),any(),any());
  FlightHealthStaff other=new FlightHealthStaff();other.setId(901L);other.setFlight(flight);other.setStaff(second);when(assignments.findById(901L)).thenReturn(Optional.of(other));
  service.remove(10L,901L,1L);assertEquals(FlightHealthStaff.REMOVAL,other.getRemovalReason());assertFalse(other.isCurrent());
  assertEquals("STAFF_ASSIGNMENT_CLOSED",rejected(()->service.remove(10L,901L,1L)).code());
 }
 @Test void theFlightStaffCanBeReadThroughTheFlightAccessPolicyAndNeverIncludesTheDni(){
  HealthStaff h=professional(5L,dts,"MEDICO","MP-1",true);FlightHealthStaff a=new FlightHealthStaff();a.setId(900L);a.setFlight(flight);a.setStaff(h);a.setAssignedBy(dts);
  when(assignments.findCurrentByFlightId(10L)).thenReturn(List.of(a));
  var list=service.forFlight(10L,7L,false);assertEquals(1,list.size());verify(access).mayRead(flight,7L);
  assertTrue(Arrays.stream(FlightStaffView.class.getRecordComponents()).noneMatch(c->c.getName().equalsIgnoreCase("dni")));
 }
 @Test void candidatesListOnlyActiveProfessionalsOfTheDtsAndExplainTheirConflicts(){
  HealthStaff free=professional(5L,dts,"MEDICO","M5",true),busy=professional(6L,dts,"ENFERMERO","M6",true);when(staff.findByOwner(1L,false)).thenReturn(List.of(free,busy));
  Flight other=flight(11L,"PLANIFICADO",LocalDateTime.of(2030,1,5,11,0),LocalDateTime.of(2030,1,5,12,0));FlightHealthStaff existing=new FlightHealthStaff();existing.setFlight(other);existing.setStaff(busy);when(assignments.findCurrentByStaffId(6L)).thenReturn(List.of(existing));
  var list=service.candidates(10L,1L);assertEquals(2,list.size());assertTrue(list.get(0).disponible());assertFalse(list.get(1).disponible());assertTrue(list.get(1).motivoNoDisponible().contains("V-11"));
  assertEquals(403,rejected(()->service.candidates(10L,2L)).status().value());
 }
}
