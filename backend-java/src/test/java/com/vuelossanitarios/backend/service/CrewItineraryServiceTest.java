package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.domain.catalog.Airport;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.flight.CommanderGeographicException;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDateTime;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Ubicación prevista de un comandante o copiloto derivada de sus vuelos asignados, sin tocar su ubicación actual, y revalidación cuando algo cambia. */
class CrewItineraryServiceTest {
 private final FlightRepository flights=mock(FlightRepository.class);
 private final FlightCrewRepository crews=mock(FlightCrewRepository.class);
 private final UserRepository users=mock(UserRepository.class);
 private final CommanderGeographicExceptionRepository exceptions=mock(CommanderGeographicExceptionRepository.class);
 private final NotificationService notifications=mock(NotificationService.class);
 private final AuditService audit=mock(AuditService.class);
 private final CrewItineraryService service=new CrewItineraryService(flights,crews,users,exceptions,notifications,audit);
 private Province tucuman,cordoba,salta;private Airport tuc,cba,sla;private User maria;
 private static final LocalDateTime D=LocalDateTime.of(2030,5,1,0,0);

 private static Province province(long id,String name){Province p=new Province();p.setId(id);p.setNombre(name);return p;}
 private static Airport airport(long id,String name,Province p){Airport a=new Airport();a.setId(id);a.setNombre(name);a.setProvinciaReferencial(p);return a;}
 private Flight flight(long id,String state,Airport from,Airport to,LocalDateTime dep,LocalDateTime arr){
  Flight f=new Flight();f.setId(id);f.setCodigo("V-"+id);f.setOrigen(from);f.setDestino(to);f.setFechaPlanificadaSalida(dep);f.setFechaPlanificadaLlegada(arr);
  if(state!=null){FlightStatus s=new FlightStatus();s.setCodigo(state);f.setEstadoVuelo(s);}return f;
 }
 private FlightCrew copilotRow(Flight f,User u){CrewRole r=new CrewRole();r.setCodigo("COPILOTO");FlightCrew c=new FlightCrew();c.setFlight(f);c.setUser(u);c.setCrewRole(r);return c;}

 @BeforeEach void setup(){
  tucuman=province(1,"Tucumán");cordoba=province(2,"Córdoba");salta=province(3,"Salta");tuc=airport(1,"Tucumán",tucuman);cba=airport(2,"Córdoba",cordoba);sla=airport(3,"Salta",salta);
  maria=new User();maria.setId(20L);Person p=new Person();p.setNombre("María");p.setApellido("López");maria.setPerson(p);
  CommanderProfile profile=new CommanderProfile();profile.setProvinciaActual(tucuman);p.setCommanderProfile(profile);
  when(users.findById(20L)).thenReturn(Optional.of(maria));
 }

 @Test void withoutFlightsThePositionIsTheRegisteredLocation(){
  var pos=service.positionAt(maria,D.plusDays(1),99L);assertEquals(tucuman,pos.province());assertFalse(pos.projected());
 }
 @Test void afterACopilotFlightTucumanToCordobaThePersonWillBeInCordobaButHerProfileIsUntouched(){
  Flight a=flight(1,"PLANIFICADO",tuc,cba,D.plusHours(8),D.plusHours(12));
  when(crews.findByUserIdAndFechaBajaIsNull(20L)).thenReturn(List.of(copilotRow(a,maria)));
  var pos=service.positionAt(maria,D.plusHours(14),99L);
  assertEquals(cordoba,pos.province());assertTrue(pos.projected());assertEquals("V-1",pos.afterFlight());
  assertEquals(tucuman,maria.getPerson().getCommanderProfile().getProvinciaActual(),"la ubicación actual no se adelanta");
  assertEquals(tucuman,service.positionAt(maria,D.plusHours(10),99L).province(),"todavía en vuelo: no hay ubicación prevista posterior");
 }
 @Test void theLatestArrivalBeforeTheDepartureWinsAndTheEvaluatedFlightItselfNeverCounts(){
  Flight a=flight(1,"PLANIFICADO",tuc,cba,D.plusHours(1),D.plusHours(3)),b=flight(2,"PLANIFICADO",cba,sla,D.plusHours(4),D.plusHours(6));
  when(flights.openOfCommander(20L)).thenReturn(List.of(b));when(crews.findByUserIdAndFechaBajaIsNull(20L)).thenReturn(List.of(copilotRow(a,maria)));
  assertEquals(salta,service.positionAt(maria,D.plusHours(8),99L).province());
  assertEquals(cordoba,service.positionAt(maria,D.plusHours(8),2L).province(),"al evaluar el propio vuelo B se ignora");
 }
 @Test void terminalFlightsDoNotProject(){
  Flight a=flight(1,"CANCELADO",tuc,cba,D.plusHours(1),D.plusHours(3));when(crews.findByUserIdAndFechaBajaIsNull(20L)).thenReturn(List.of(copilotRow(a,maria)));
  assertEquals(tucuman,service.positionAt(maria,D.plusHours(8),99L).province());
 }
 @Test void bulkProjectionsCoverCommandersAndCopilots(){
  Flight a=flight(1,"PLANIFICADO",tuc,cba,D.plusHours(1),D.plusHours(3));a.setComandante(maria);
  User juan=new User();juan.setId(21L);Flight b=flight(2,"PLANIFICADO",tuc,sla,D.plusHours(1),D.plusHours(4));
  when(flights.openArrivingBy(any())).thenReturn(List.of(a));when(crews.openCopilotArrivingBy(any())).thenReturn(List.of(copilotRow(b,juan)));
  var map=service.projectionsAt(D.plusHours(8),99L);assertEquals(cordoba,map.get(20L).province());assertEquals(salta,map.get(21L).province());
  assertTrue(service.projectionsAt(null,99L).isEmpty());
 }

 // ---- revalidación
 @Test void anAssignmentThatNoLongerFitsTheItineraryIsFlaggedOnceAndNeverRemovedSilently(){
  // María es copiloto de A (Tucumán→Córdoba), pero C sale de Salta: la asignación a C queda incoherente.
  Flight a=flight(1,"PLANIFICADO",tuc,cba,D.plusHours(1),D.plusHours(3)),c=flight(3,"PLANIFICADO",sla,tuc,D.plusHours(6),D.plusHours(9));c.setComandante(maria);
  when(crews.findByUserIdAndFechaBajaIsNull(20L)).thenReturn(List.of(copilotRow(a,maria)));when(flights.openOfCommander(20L)).thenReturn(List.of(c));
  when(notifications.createOncePreferred(any(),eq("CREW_ITINERARY_REVIEW"),contains("estará en Córdoba"),contains("CREW_ITINERARY:3:20"),any(),any(String[].class))).thenReturn(1);
  assertEquals(1,service.revalidate(List.of(20L),maria));
  verify(audit).record(eq(c),eq(maria),eq("FLIGHT_CREW"),eq(20L),eq("ITINERARY_REVIEW_REQUIRED"),isNull(),contains("Salta"));
  assertSame(maria,c.getComandante());verify(crews,never()).delete(any(FlightCrew.class));
  when(notifications.createOncePreferred(any(),any(),any(),any(),any(),any(String[].class))).thenReturn(0);
  assertEquals(0,service.revalidate(List.of(20L),maria),"la misma situación no vuelve a avisarse");
 }
 @Test void aCoherentChainOrAnExceptionAuthorizedForThatFlightIsNotFlagged(){
  Flight a=flight(1,"PLANIFICADO",tuc,cba,D.plusHours(1),D.plusHours(3)),b=flight(2,"PLANIFICADO",cba,sla,D.plusHours(6),D.plusHours(8));b.setComandante(maria);
  when(crews.findByUserIdAndFechaBajaIsNull(20L)).thenReturn(List.of(copilotRow(a,maria)));when(flights.openOfCommander(20L)).thenReturn(List.of(b));
  assertEquals(0,service.revalidate(List.of(20L),maria));verify(notifications,never()).createOncePreferred(any(),any(),any(),any(),any(),any(String[].class));
  Flight c=flight(3,"PLANIFICADO",sla,tuc,D.plusHours(10),D.plusHours(12));c.setComandante(maria);when(flights.openOfCommander(20L)).thenReturn(List.of(c));
  when(crews.findByUserIdAndFechaBajaIsNull(20L)).thenReturn(List.of());
  CommanderGeographicException e=new CommanderGeographicException();e.setCommander(maria);e.setFunction(CommanderGeographicException.FUNCTION_COMMANDER);e.setDepartureProvince(salta);
  when(exceptions.findCurrentByFlightId(3L)).thenReturn(List.of(e));
  assertEquals(0,service.revalidate(List.of(20L),maria),"hay una excepción geográfica vigente para esa salida");
 }
 @Test void cancellingThePreviousFlightMakesTheLaterFlightIncoherentAgainstTheRegisteredLocation(){
  Flight b=flight(2,"PLANIFICADO",cba,sla,D.plusHours(6),D.plusHours(8));b.setComandante(maria);
  when(flights.openOfCommander(20L)).thenReturn(List.of(b));when(crews.findByUserIdAndFechaBajaIsNull(20L)).thenReturn(List.of());
  when(notifications.createOncePreferred(any(),any(),any(),any(),any(),any(String[].class))).thenReturn(1);
  assertEquals(1,service.revalidate(List.of(20L),null),"el vuelo anterior (A) ya no existe: María sigue en Tucumán y B sale de Córdoba");
 }
}
