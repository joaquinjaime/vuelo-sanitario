package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.AircraftDtos.*;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

class AircraftAdminServiceTest {
 private final AircraftRepository aircraft=mock(AircraftRepository.class);
 private final AirportRepository airports=mock(AirportRepository.class);
 private final FlightRepository flights=mock(FlightRepository.class);
 private final FlightCrewRepository crews=mock(FlightCrewRepository.class);
 private final FlightMedicalInfoRepository medical=mock(FlightMedicalInfoRepository.class);
 private final UserRepository users=mock(UserRepository.class);
 private final AuditEventRepository events=mock(AuditEventRepository.class);
 private final AuditService audit=mock(AuditService.class);
 private final Clock clock=Clock.fixed(Instant.parse("2030-01-01T12:00:00Z"),ZoneId.of("UTC"));
 private final AircraftAdminService service=new AircraftAdminService(aircraft,airports,mock(AirportLocks.class),flights,crews,medical,users,events,audit,clock);
 private User admin; private Airport tuc,aep,inactiveAirport; private Aircraft plane;

 private static Airport airport(long id,String name,long provinceId,boolean active){Airport a=new Airport();a.setId(id);a.setNombre(name);a.setActivo(active);Province p=new Province();p.setId(provinceId);p.setNombre("P"+provinceId);a.setProvinciaReferencial(p);return a;}
 private static Flight flight(long id,String state,Airport origin,LocalDateTime from,LocalDateTime to){Flight f=new Flight();f.setId(id);f.setCodigo("V-"+id);FlightStatus s=new FlightStatus();s.setCodigo(state);f.setEstadoVuelo(s);FlightType t=new FlightType();t.setCodigo("REGRESO_BASE");f.setTipoVuelo(t);f.setOrigen(origin);f.setFechaPlanificadaSalida(from);f.setFechaPlanificadaLlegada(to);return f;}
 private AircraftRequest request(String plate){return new AircraftRequest(plate,"King Air","Turbohélice",(short)1,(short)4,"Camilla",1L,true);}
 private AircraftUpdateRequest update(String plate,short crewCapacity,String equipment){return new AircraftUpdateRequest(plate,"King Air B200","Turbohélice",(short)2,crewCapacity,equipment,null,null);}

 @BeforeEach void setup(){
  admin=new User();admin.setId(1L);admin.setUsername("admin");when(users.findById(1L)).thenReturn(Optional.of(admin));
  tuc=airport(1L,"Tucumán",10L,true);aep=airport(2L,"Aeroparque",20L,true);inactiveAirport=airport(3L,"Cerrado",10L,false);
  when(airports.findById(1L)).thenReturn(Optional.of(tuc));when(airports.findById(2L)).thenReturn(Optional.of(aep));when(airports.findById(3L)).thenReturn(Optional.of(inactiveAirport));
  plane=new Aircraft();plane.setId(50L);plane.setMatricula("LV-ABC");plane.setModelo("King Air");plane.setTipo("Turbohélice");plane.setCapacidadPacientes((short)1);plane.setCapacidadTripulacion((short)4);plane.setActivo(true);plane.setAeropuertoActual(tuc);
  when(aircraft.lockById(50L)).thenReturn(Optional.of(plane));when(aircraft.findById(50L)).thenReturn(Optional.of(plane));
  when(aircraft.saveAndFlush(any(Aircraft.class))).thenAnswer(i->{Aircraft a=i.getArgument(0);if(a.getId()==null)a.setId(77L);return a;});
  when(flights.activeAircraftAssignments(eq(50L),any())).thenReturn(List.of());when(crews.activeCrewOfAircraftFlights(eq(50L),any())).thenReturn(List.of());
 }

 // ---------- Alta ----------
 @Test void createNormalizesThePlateAndAuditsTheActor(){
  AircraftAdminView view=service.create(request("  lv-xyz "),1L);
  ArgumentCaptor<Aircraft> saved=ArgumentCaptor.forClass(Aircraft.class);verify(aircraft).saveAndFlush(saved.capture());
  assertEquals("LV-XYZ",saved.getValue().getMatricula());assertTrue(saved.getValue().getActivo());assertSame(tuc,saved.getValue().getAeropuertoActual());
  assertEquals("SIN_ASIGNACIONES",view.estadoOperativo());assertEquals(0,view.vuelosComprometidos());
  verify(audit).record(isNull(),eq(admin),eq("AIRCRAFT"),eq(77L),eq("CREATE"),isNull(),contains("\"matricula\":\"LV-XYZ\""));
 }
 @Test void createCanRegisterAnInitiallyInactiveAircraft(){
  AircraftAdminView view=service.create(new AircraftRequest("LV-OFF","M","T",(short)1,(short)2,null,1L,false),1L);
  assertFalse(view.activo());assertEquals("DESACTIVADA",view.estadoOperativo());
 }
 @Test void createRejectsMissingOrInactiveAirportsAndDuplicatedPlatesWithoutPersisting(){
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.create(new AircraftRequest("LV-N1","M","T",(short)1,(short)2,null,99L,true),1L)).status());
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.create(new AircraftRequest("LV-N2","M","T",(short)1,(short)2,null,3L,true),1L)).status());
  when(aircraft.existsByMatriculaIgnoreCase("LV-ABC")).thenReturn(true);
  ApiException duplicate=assertThrows(ApiException.class,()->service.create(request("lv-abc"),1L));
  assertEquals(HttpStatus.CONFLICT,duplicate.status());assertEquals("DUPLICATE_PLATE",duplicate.code());
  verify(aircraft,never()).saveAndFlush(any());verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }
 @Test void createTranslatesTheDatabaseUniquenessViolationOfARaceIntoAConflict(){
  when(aircraft.saveAndFlush(any(Aircraft.class))).thenThrow(new DataIntegrityViolationException("uq"));
  assertEquals("DUPLICATE_PLATE",assertThrows(ApiException.class,()->service.create(request("LV-RACE"),1L)).code());
  verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }

 // ---------- Edición ----------
 @Test void updateChangesOnlyAdministrativeDataAndAuditsTheDifference(){
  AircraftAdminView view=service.update(50L,update("lv-new",(short)6,"Respirador"),1L);
  assertEquals("LV-NEW",plane.getMatricula());assertEquals("King Air B200",plane.getModelo());assertEquals((short)6,plane.getCapacidadTripulacion());assertSame(tuc,plane.getAeropuertoActual());assertTrue(plane.getActivo());
  assertEquals("LV-NEW",view.matricula());
  verify(audit).record(isNull(),eq(admin),eq("AIRCRAFT"),eq(50L),eq("UPDATE"),contains("\"matricula\":\"LV-ABC\""),contains("\"matricula\":\"LV-NEW\""));
 }
 @Test void updateWithoutChangesDoesNotAudit(){
  service.update(50L,new AircraftUpdateRequest("LV-ABC","King Air","Turbohélice",(short)1,(short)4,null,1L,true),1L);
  verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }
 @Test void updateCannotSmuggleStateOrLocationChanges(){
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.update(50L,new AircraftUpdateRequest("LV-ABC","M","T",(short)1,(short)2,null,1L,false),1L)).status());
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.update(50L,new AircraftUpdateRequest("LV-ABC","M","T",(short)1,(short)2,null,2L,null),1L)).status());
  assertTrue(plane.getActivo());assertSame(tuc,plane.getAeropuertoActual());assertEquals("King Air",plane.getModelo());
 }
 @Test void updateRejectsADuplicatedPlateButAllowsRecasingItsOwn(){
  when(aircraft.existsByMatriculaIgnoreCaseAndIdNot("LV-TAKEN",50L)).thenReturn(true);
  assertEquals("DUPLICATE_PLATE",assertThrows(ApiException.class,()->service.update(50L,update("LV-TAKEN",(short)4,null),1L)).code());
  service.update(50L,update("lv-abc",(short)4,null),1L);verify(aircraft,never()).existsByMatriculaIgnoreCaseAndIdNot(eq("LV-ABC"),any());
 }
 @Test void updateIsBlockedWhileTheAircraftIsFlying(){
  when(flights.activeAircraftAssignments(eq(50L),any())).thenReturn(List.of(flight(1L,"EN_CURSO",tuc,LocalDateTime.of(2030,1,1,10,0),LocalDateTime.of(2030,1,1,14,0))));
  ApiException e=assertThrows(ApiException.class,()->service.update(50L,update("LV-ABC",(short)4,null),1L));
  assertEquals(HttpStatus.CONFLICT,e.status());assertEquals("AIRCRAFT_IN_FLIGHT",e.code());
 }
 @Test void updateCannotReduceCrewCapacityBelowAnAssignedCrew(){
  Flight planned=flight(2L,"PLANIFICADO",tuc,LocalDateTime.of(2030,2,1,10,0),LocalDateTime.of(2030,2,1,12,0));planned.setAircraft(plane);
  when(flights.activeAircraftAssignments(eq(50L),any())).thenReturn(List.of(planned));
  User u1=new User(),u2=new User(),u3=new User();u1.setId(11L);u2.setId(12L);u3.setId(13L);
  FlightCrew c1=new FlightCrew(),c2=new FlightCrew(),c3=new FlightCrew();c1.setFlight(planned);c2.setFlight(planned);c3.setFlight(planned);c1.setUser(u1);c2.setUser(u2);c3.setUser(u3);
  when(crews.activeCrewOfAircraftFlights(eq(50L),any())).thenReturn(List.of(c1,c2,c3));
  ApiException e=assertThrows(ApiException.class,()->service.update(50L,update("LV-ABC",(short)2,null),1L));
  assertEquals("AIRCRAFT_CAPACITY_CONFLICT",e.code());assertTrue(e.getMessage().contains("V-2"));assertEquals((short)4,plane.getCapacidadTripulacion());
  service.update(50L,update("LV-ABC",(short)3,null),1L);assertEquals((short)3,plane.getCapacidadTripulacion());
 }
 @Test void updateCannotRemoveEquipmentRequiredByAnAssignedSanitaryFlight(){
  plane.setEquipamientoMedico("Respirador");Flight sanitary=flight(3L,"PLANIFICADO",tuc,LocalDateTime.of(2030,2,1,10,0),null);sanitary.setSanitario(new SanitaryFlight());
  FlightMedicalInfo info=new FlightMedicalInfo();info.setRequiereEquipamientoEspecial(true);when(medical.findByFlightId(3L)).thenReturn(Optional.of(info));
  when(flights.activeAircraftAssignments(eq(50L),any())).thenReturn(List.of(sanitary));
  assertEquals("AIRCRAFT_EQUIPMENT_CONFLICT",assertThrows(ApiException.class,()->service.update(50L,update("LV-ABC",(short)4,null),1L)).code());
  assertEquals("Respirador",plane.getEquipamientoMedico());
 }

 // ---------- Baja lógica y reactivación ----------
 @Test void deactivationKeepsTheAircraftAndItsHistoryAndIsAudited(){
  AircraftAdminView view=service.setActive(50L,false,"Mantenimiento mayor",1L);
  assertFalse(plane.getActivo());assertEquals("DESACTIVADA",view.estadoOperativo());verify(aircraft,never()).delete(any());verify(aircraft,never()).deleteById(any());
  verify(audit).record(isNull(),eq(admin),eq("AIRCRAFT"),eq(50L),eq("SET_ACTIVE"),contains("\"activo\":true"),argThat((String v)->v.contains("\"activo\":false")&&v.contains("Mantenimiento mayor")));
 }
 @Test void aircraftInAnOngoingFlightCannotBeDeactivated(){
  Flight flying=flight(4L,"EN_CURSO",tuc,LocalDateTime.of(2030,1,1,10,0),LocalDateTime.of(2030,1,1,14,0));when(flights.activeAircraftAssignments(eq(50L),any())).thenReturn(List.of(flying));
  ApiException e=assertThrows(ApiException.class,()->service.setActive(50L,false,null,1L));
  assertEquals("AIRCRAFT_IN_FLIGHT",e.code());assertTrue(plane.getActivo());verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }
 @Test void aircraftWithFutureConfirmedFlightsCannotBeDeactivatedAndTheFlightsAreListed(){
  Flight a=flight(5L,"PLANIFICADO",tuc,LocalDateTime.of(2030,3,1,10,0),LocalDateTime.of(2030,3,1,12,0)),b=flight(6L,"PENDIENTE_CONFIRMACION_COMANDANTE",tuc,LocalDateTime.of(2030,4,1,10,0),LocalDateTime.of(2030,4,1,12,0));
  when(flights.activeAircraftAssignments(eq(50L),any())).thenReturn(List.of(a,b));
  ApiException e=assertThrows(ApiException.class,()->service.setActive(50L,false,null,1L));
  assertEquals("AIRCRAFT_HAS_ASSIGNMENTS",e.code());assertEquals(HttpStatus.CONFLICT,e.status());assertTrue(e.getMessage().contains("V-5")&&e.getMessage().contains("V-6"));assertEquals(List.of("V-5","V-6"),e.details().get("vuelos"));
  assertTrue(plane.getActivo());
 }
 @Test void deactivatingTwiceOrActivatingAnActiveAircraftIsAConflict(){
  assertEquals("AIRCRAFT_ALREADY_ACTIVE",assertThrows(ApiException.class,()->service.setActive(50L,true,null,1L)).code());
  plane.setActivo(false);assertEquals("AIRCRAFT_ALREADY_INACTIVE",assertThrows(ApiException.class,()->service.setActive(50L,false,null,1L)).code());
 }
 @Test void reactivationRequiresAnActiveAirportLocationAndOtherwiseRestoresEligibility(){
  plane.setActivo(false);plane.setAeropuertoActual(null);
  assertEquals("AIRCRAFT_WITHOUT_LOCATION",assertThrows(ApiException.class,()->service.setActive(50L,true,null,1L)).code());
  plane.setAeropuertoActual(inactiveAirport);assertEquals("AIRCRAFT_WITHOUT_LOCATION",assertThrows(ApiException.class,()->service.setActive(50L,true,null,1L)).code());
  assertFalse(plane.getActivo());
  plane.setAeropuertoActual(tuc);AircraftAdminView view=service.setActive(50L,true,null,1L);
  assertTrue(plane.getActivo());assertEquals("SIN_ASIGNACIONES",view.estadoOperativo());
 }

 // ---------- Ubicación ----------
 @Test void manualMoveRecordsPreviousAndNewLocationActorAndReason(){
  AircraftAdminView view=service.move(50L,2L,"Traslado en tierra",1L);
  assertSame(aep,plane.getAeropuertoActual());assertEquals("Aeroparque",view.aeropuertoActual());
  verify(audit).record(isNull(),eq(admin),eq("AIRCRAFT"),eq(50L),eq("MANUAL_LOCATION_CHANGE"),argThat((String v)->v.contains("\"aeropuertoActualId\":1")&&v.contains("Tucumán")),argThat((String v)->v.contains("\"aeropuertoActualId\":2")&&v.contains("Aeroparque")&&v.contains("Traslado en tierra")));
 }
 @Test void manualMoveRejectsInvalidSameOrInactiveAirports(){
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.move(50L,1L,null,1L)).status());
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.move(50L,3L,null,1L)).status());
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.move(50L,99L,null,1L)).status());
  assertSame(tuc,plane.getAeropuertoActual());verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }
 @Test void manualMoveIsBlockedWhileFlyingAndWhenItContradictsCommittedFlights(){
  Flight flying=flight(7L,"EN_CURSO",tuc,LocalDateTime.of(2030,1,1,10,0),LocalDateTime.of(2030,1,1,14,0));when(flights.activeAircraftAssignments(eq(50L),any())).thenReturn(List.of(flying));
  assertEquals("AIRCRAFT_IN_FLIGHT",assertThrows(ApiException.class,()->service.move(50L,2L,null,1L)).code());
  Flight planned=flight(8L,"PLANIFICADO",tuc,LocalDateTime.of(2030,3,1,10,0),LocalDateTime.of(2030,3,1,12,0));when(flights.activeAircraftAssignments(eq(50L),any())).thenReturn(List.of(planned));
  ApiException e=assertThrows(ApiException.class,()->service.move(50L,2L,null,1L));
  assertEquals("AIRCRAFT_LOCATION_CONFLICT",e.code());assertTrue(e.getMessage().contains("V-8"));assertSame(tuc,plane.getAeropuertoActual());
 }
 @Test void manualMoveToThePlannedOriginOfACommittedFlightIsConsistent(){
  plane.setAeropuertoActual(aep);Flight planned=flight(9L,"PLANIFICADO",tuc,LocalDateTime.of(2030,3,1,10,0),LocalDateTime.of(2030,3,1,12,0));when(flights.activeAircraftAssignments(eq(50L),any())).thenReturn(List.of(planned));
  AircraftAdminView view=service.move(50L,1L,null,1L);assertSame(tuc,plane.getAeropuertoActual());assertEquals("ASIGNADA",view.estadoOperativo());assertEquals(1,view.vuelosComprometidos());
 }
 @Test void aSanitaryFlightWithoutPlannedOriginOnlyConstrainsTheRequestedProvince(){
  Locality origin=new Locality();Province requested=new Province();requested.setId(10L);origin.setProvincia(requested);SanitaryFlight s=new SanitaryFlight();s.setLocalidadOrigenSolicitada(origin);
  Flight sanitary=flight(10L,"PLANIFICADO",null,LocalDateTime.of(2030,3,1,10,0),null);sanitary.setSanitario(s);when(flights.activeAircraftAssignments(eq(50L),any())).thenReturn(List.of(sanitary));
  assertEquals("AIRCRAFT_LOCATION_CONFLICT",assertThrows(ApiException.class,()->service.move(50L,2L,null,1L)).code());
  Airport sameProvince=airport(4L,"Otro Tucumán",10L,true);when(airports.findById(4L)).thenReturn(Optional.of(sameProvince));
  service.move(50L,4L,null,1L);assertSame(sameProvince,plane.getAeropuertoActual());
 }

 // ---------- Estados y disponibilidad ----------
 @Test void operationalStateDistinguishesInactiveAssignedFlyingAndFree(){
  Flight future=flight(11L,"PLANIFICADO",tuc,LocalDateTime.of(2030,3,1,10,0),LocalDateTime.of(2030,3,1,12,0));future.setAircraft(plane);
  Aircraft free=new Aircraft();free.setId(51L);free.setMatricula("LV-FRE");free.setActivo(true);free.setAeropuertoActual(tuc);
  Aircraft off=new Aircraft();off.setId(52L);off.setMatricula("LV-OFF");off.setActivo(false);off.setAeropuertoActual(tuc);
  Aircraft flying=new Aircraft();flying.setId(53L);flying.setMatricula("LV-FLY");flying.setActivo(true);flying.setAeropuertoActual(tuc);Flight inFlight=flight(12L,"EN_CURSO",tuc,LocalDateTime.of(2030,1,1,9,0),LocalDateTime.of(2030,1,1,13,0));inFlight.setAircraft(flying);
  when(aircraft.findAllWithCurrentAirportOrderByMatricula()).thenReturn(List.of(plane,free,off,flying));when(flights.committedWithAircraft(any())).thenReturn(List.of(future,inFlight));
  var byPlate=service.adminList().stream().collect(java.util.stream.Collectors.toMap(AircraftAdminView::matricula,x->x));
  assertEquals("ASIGNADA",byPlate.get("LV-ABC").estadoOperativo());assertEquals("V-11",byPlate.get("LV-ABC").proximoVuelo().codigo());
  assertEquals("SIN_ASIGNACIONES",byPlate.get("LV-FRE").estadoOperativo());assertEquals("DESACTIVADA",byPlate.get("LV-OFF").estadoOperativo());
  assertEquals("EN_VUELO",byPlate.get("LV-FLY").estadoOperativo());assertTrue(byPlate.get("LV-FLY").enVuelo());
  assertEquals(3,service.activeList().size());
 }
 @Test void anActiveAircraftWithAFlightTomorrowIsStillAvailableTodayButNotDuringThatFlight(){
  Flight tomorrow=flight(13L,"PLANIFICADO",tuc,LocalDateTime.of(2030,1,2,10,0),LocalDateTime.of(2030,1,2,12,0));tomorrow.setAircraft(plane);
  when(aircraft.findAllWithCurrentAirportOrderByMatricula()).thenReturn(List.of(plane));
  LocalDateTime todayFrom=LocalDateTime.of(2030,1,1,14,0),todayTo=LocalDateTime.of(2030,1,1,16,0);
  when(flights.aircraftBusyIn(50L,todayFrom,todayTo)).thenReturn(List.of());
  AircraftAvailabilityView today=service.availability(todayFrom,todayTo).get(0);assertTrue(today.disponible());assertNull(today.motivoNoDisponible());assertTrue(today.conflictos().isEmpty());
  LocalDateTime overlapFrom=LocalDateTime.of(2030,1,2,11,0),overlapTo=LocalDateTime.of(2030,1,2,13,0);
  when(flights.aircraftBusyIn(50L,overlapFrom,overlapTo)).thenReturn(List.of(tomorrow));
  AircraftAvailabilityView clash=service.availability(overlapFrom,overlapTo).get(0);assertFalse(clash.disponible());assertEquals("V-13",clash.conflictos().get(0).codigo());
 }
 @Test void availabilityExcludesInactiveAircraftReportsFlyingOnesAndValidatesTheInterval(){
  plane.setActivo(false);Aircraft flying=new Aircraft();flying.setId(53L);flying.setMatricula("LV-FLY");flying.setActivo(true);flying.setAeropuertoActual(tuc);
  when(aircraft.findAllWithCurrentAirportOrderByMatricula()).thenReturn(List.of(plane,flying));when(flights.activeAircraftAssignments(eq(53L),any())).thenReturn(List.of(flight(14L,"EN_CURSO",tuc,LocalDateTime.of(2030,1,1,9,0),LocalDateTime.of(2030,1,1,13,0))));
  var list=service.availability(LocalDateTime.of(2030,5,1,10,0),LocalDateTime.of(2030,5,1,12,0));
  assertEquals(1,list.size());assertFalse(list.get(0).disponible());assertEquals("Actualmente en vuelo",list.get(0).motivoNoDisponible());
  assertThrows(ApiException.class,()->service.availability(LocalDateTime.of(2030,5,1,12,0),LocalDateTime.of(2030,5,1,10,0)));
  assertThrows(ApiException.class,()->service.availability(null,null));
 }
 @Test void unknownAircraftIsReportedAsNotFound(){
  when(aircraft.lockById(404L)).thenReturn(Optional.empty());when(aircraft.findById(404L)).thenReturn(Optional.empty());
  assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.update(404L,update("LV-X",(short)2,null),1L)).status());
  assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.setActive(404L,false,null,1L)).status());
  assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.move(404L,1L,null,1L)).status());
  assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.get(404L)).status());
  assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.history(404L)).status());
 }
 @Test void historyExposesActorsAndTheStoredBeforeAndAfterValues(){
  AuditEvent e=new AuditEvent();e.setOperation("MANUAL_LOCATION_CHANGE");e.setActor(admin);e.setOldValues("{\"aeropuertoActualId\":1}");e.setNewValues("{\"aeropuertoActualId\":2}");
  when(events.findByEntityTypeAndEntityIdOrderByOccurredAtDesc("AIRCRAFT",50L)).thenReturn(List.of(e));
  AircraftHistoryEntry entry=service.history(50L).get(0);assertEquals("admin",entry.usuario());assertEquals("MANUAL_LOCATION_CHANGE",entry.operacion());assertNotNull(entry.fecha());assertTrue(entry.valoresNuevos().contains("2"));
 }
}
