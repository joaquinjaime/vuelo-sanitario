package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import org.junit.jupiter.api.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class Aa2000CoordinationServiceTest {
    FlightRepository flights=mock(FlightRepository.class); Aa2000CoordinationRepository records=mock(Aa2000CoordinationRepository.class);
    AirportRepository airports=mock(AirportRepository.class); UserRepository users=mock(UserRepository.class); AuditService audit=mock(AuditService.class);
    Clock clock=Clock.fixed(Instant.parse("2026-01-10T12:00:00Z"),ZoneOffset.UTC);
    Aa2000CoordinationService service=new Aa2000CoordinationService(flights,records,airports,mock(AirportLocks.class),users,audit,new ObjectMapper().findAndRegisterModules(),clock);
    Flight f;Airport airport;User ops,cmd,other;UUID group=UUID.randomUUID();
    User actor(long id,String name,String code){User u=new User();u.setId(id);u.setUsername(name);Role role=new Role();role.setCodigo(code);u.setUserRoles(Set.of(new UserRole(u,role)));when(users.findById(id)).thenReturn(Optional.of(u));when(users.findWithRolesByUsername(name)).thenReturn(Optional.of(u));return u;}
    @BeforeEach void setup(){ops=actor(1,"ops","OPERACIONES");cmd=actor(2,"cmd","COMANDANTE");other=actor(3,"other","COMANDANTE");f=new Flight();f.setId(9L);f.setComandante(cmd);FlightStatus status=new FlightStatus();status.setCodigo("PLANIFICADO");f.setEstadoVuelo(status);airport=new Airport();airport.setId(10L);airport.setActivo(true);when(airports.findById(10L)).thenReturn(Optional.of(airport));when(flights.findById(9L)).thenReturn(Optional.of(f));when(flights.lockById(9L)).thenReturn(Optional.of(f));when(flights.readLockedById(9L)).thenReturn(Optional.of(f));}
    Aa2000CoordinationService.Input input(int version,String state,String source){return new Aa2000CoordinationService.Input(version,10L,"Gestión E2E","Prueba simulada",state,null,"Contacto","Correo",LocalDateTime.of(2026,1,9,10,0),"CONFIRMADO".equals(state)?LocalDateTime.of(2026,1,9,11,0):null,source,null,null,"Seguimiento E2E");}
    @Test void createsPendingAndAudits(){service.create(9L,1L,input(0,"PENDIENTE",null));verify(records).saveAndFlush(argThat(x->x.getFlight()==f&&x.getVersion()==1&&x.getGestionId()!=null));verify(audit).record(eq(f),eq(ops),eq("AA2000_COORDINATION"),nullable(Long.class),eq("CREATE"),isNull(),contains("Prueba simulada"));}
    @Test void deniesUnassignedCommanderAndConfirmationWithoutEvidence(){assertEquals(403,assertThrows(ApiException.class,()->service.get(9L,3L)).status().value());assertEquals(400,assertThrows(ApiException.class,()->service.create(9L,1L,input(0,"CONFIRMADO",null))).status().value());verify(records,never()).saveAndFlush(any());}
    @Test void rejectsStaleAndClosedFlight(){Aa2000Coordination old=new Aa2000Coordination();old.setFlight(f);old.setGestionId(group);old.setVersion(2);old.setAeropuerto(airport);old.setFinalidad("Gestión E2E");when(records.findByFlightIdAndGestionIdAndEsVersionActualTrue(9L,group)).thenReturn(Optional.of(old));when(records.lockCurrent(9L,group)).thenReturn(Optional.of(old));assertEquals(409,assertThrows(ApiException.class,()->service.update(9L,group,1L,input(1,"PENDIENTE",null))).status().value());f.getEstadoVuelo().setCodigo("CANCELADO");assertEquals(400,assertThrows(ApiException.class,()->service.update(9L,group,1L,input(2,"PENDIENTE",null))).status().value());}
}
