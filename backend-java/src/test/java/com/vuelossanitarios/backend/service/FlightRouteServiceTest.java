package com.vuelossanitarios.backend.service;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDateTime;
import java.util.*;
import org.junit.jupiter.api.*;
class FlightRouteServiceTest {
 FlightRepository flights=mock(FlightRepository.class); FlightRouteRepository routes=mock(FlightRouteRepository.class); AirportRepository airports=mock(AirportRepository.class); UserRepository users=mock(UserRepository.class); FlightAuthorizationService access=mock(FlightAuthorizationService.class); AuditService audit=mock(AuditService.class);
 FlightRouteService service=new FlightRouteService(flights,routes,airports,users,access,audit,new ObjectMapper().findAndRegisterModules()); Flight f; User commander;
 FlightRouteService.Input input(int version,Long alternate){return new FlightRouteService.Input(version,"Punto A, punto B",alternate,null,null,null,"Observación");}
 @BeforeEach void setup(){f=new Flight();f.setId(1L);commander=new User();commander.setId(2L);commander.setUsername("comandante");f.setComandante(commander);FlightStatus status=new FlightStatus();status.setCodigo("PLANIFICADO");f.setEstadoVuelo(status);Airport origin=new Airport();origin.setId(10L);Airport destination=new Airport();destination.setId(11L);f.setOrigen(origin);f.setDestino(destination);f.setFechaPlanificadaSalida(LocalDateTime.of(2030,1,1,10,0));f.setFechaPlanificadaLlegada(LocalDateTime.of(2030,1,1,12,0));when(flights.lockById(1L)).thenReturn(Optional.of(f));when(users.findById(2L)).thenReturn(Optional.of(commander));}
 @Test void createsVersionAndAudit(){service.save(1L,2L,input(0,null));verify(routes).saveAndFlush(argThat(r->r.getVersion()==1&&r.getFlight()==f&&r.getRecorrido().equals("Punto A, punto B")));verify(audit).record(eq(f),eq(commander),eq("FLIGHT_ROUTE"),any(),eq("CREATE"),isNull(),contains("Punto A"));}
 @Test void rejectsOtherCommanderAndInvalidState(){assertEquals(403,assertThrows(ApiException.class,()->service.save(1L,3L,input(0,null))).status().value());f.getEstadoVuelo().setCodigo("EN_CURSO");assertEquals(400,assertThrows(ApiException.class,()->service.save(1L,2L,input(0,null))).status().value());verify(routes,never()).saveAndFlush(any());}
 @Test void rejectsInvalidAirportAndTimes(){assertThrows(ApiException.class,()->service.save(1L,2L,input(0,99L)));f.setFechaPlanificadaLlegada(f.getFechaPlanificadaSalida());assertThrows(ApiException.class,()->service.save(1L,2L,input(0,null)));verify(routes,never()).saveAndFlush(any());}
 @Test void rejectsStaleVersion(){FlightRoute old=new FlightRoute();old.setVersion(2);when(routes.findByFlightIdAndEsVersionActualTrue(1L)).thenReturn(Optional.of(old));assertEquals(409,assertThrows(ApiException.class,()->service.save(1L,2L,input(1,null))).status().value());verify(routes,never()).saveAndFlush(any());}
 @Test void updateRetiresPreviousVersionAndAuditsBothValues(){FlightRoute old=new FlightRoute();old.setVersion(1);old.setEsVersionActual(true);old.setRecorrido("Anterior");old.setCreadoPor(commander);when(routes.findByFlightIdAndEsVersionActualTrue(1L)).thenReturn(Optional.of(old));service.save(1L,2L,input(1,null));assertFalse(old.getEsVersionActual());verify(routes).saveAndFlush(argThat(r->r.getVersion()==2&&r.getFlight()==f));verify(audit).record(eq(f),eq(commander),eq("FLIGHT_ROUTE"),any(),eq("UPDATE"),contains("Anterior"),contains("Punto A"));}
 @Test void readsOnlyAfterAuthorization(){when(flights.findById(1L)).thenReturn(Optional.of(f));assertEquals("SIN_PLANIFICAR",service.get(1L,2L).estado());verify(access).mayRead(f,2L);}
}
