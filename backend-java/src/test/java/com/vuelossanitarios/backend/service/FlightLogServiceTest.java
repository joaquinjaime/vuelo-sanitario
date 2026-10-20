package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.data.domain.SliceImpl;
import org.springframework.test.util.ReflectionTestUtils;

class FlightLogServiceTest {
 private final FlightRepository flights=mock(FlightRepository.class);
 private final FlightAuditLogRepository entries=mock(FlightAuditLogRepository.class);
 private final UserRepository users=mock(UserRepository.class);
 private final AuditService audit=mock(AuditService.class);
 private final Clock clock=Clock.fixed(Instant.parse("2026-01-02T00:00:00Z"),ZoneOffset.UTC);
 private final FlightLogService service=new FlightLogService(flights,entries,users,audit,new ObjectMapper().findAndRegisterModules(),clock);
 private Flight flight; private User commander,operations,other,admin;
 private User user(long id,String name,String role){User u=new User();u.setId(id);u.setUsername(name);Role r=new Role();r.setCodigo(role);UserRole link=new UserRole();link.setRole(r);u.setUserRoles(Set.of(link));when(users.findById(id)).thenReturn(Optional.of(u));when(users.findWithRolesByUsername(name)).thenReturn(Optional.of(u));return u;}
 @BeforeEach void setup(){commander=user(1,"cmd","COMANDANTE");operations=user(2,"ops","CENTRO_OPERACIONES");other=user(3,"other","COMANDANTE");admin=user(4,"admin","ADMINISTRADOR");flight=new Flight();flight.setId(42L);flight.setComandante(commander);FlightStatus s=new FlightStatus();s.setCodigo("PLANIFICADO");flight.setEstadoVuelo(s);when(flights.findById(42L)).thenReturn(Optional.of(flight));when(flights.lockById(42L)).thenReturn(Optional.of(flight));when(entries.saveAndFlush(any())).thenAnswer(inv->{FlightAuditLog e=inv.getArgument(0);ReflectionTestUtils.setField(e,"id",100L);return e;});}
 private FlightLogService.Input input(Long target,String reason){return new FlightLogService.Input("DEMORA","  Viento  ",OffsetDateTime.parse("2026-01-01T15:00:00-03:00"),"IMPORTANTE",target,reason);}
 @Test void manualEntryIsNormalizedPersistedAndAudited(){var result=service.create(42L,1L,input(null,null));assertEquals("Viento",result.descripcion());assertEquals(OffsetDateTime.parse("2026-01-01T18:00:00Z"),result.ocurrido());assertEquals("MANUAL",result.origen());verify(audit).record(eq(flight),eq(commander),eq("FLIGHT_LOG"),eq(100L),eq("CREATE"),isNull(),contains("Viento"));}
 @Test void correctionPreservesAndReferencesOriginal(){FlightAuditLog original=new FlightAuditLog();ReflectionTestUtils.setField(original,"id",9L);original.setFlight(flight);original.setOrigen("MANUAL");original.setUsuario(commander);when(entries.findById(9L)).thenReturn(Optional.of(original));var result=service.create(42L,2L,input(9L," dato corregido "));assertEquals(9L,result.correccionDe());assertEquals("dato corregido",result.motivoCorreccion());verify(audit).record(eq(flight),eq(operations),eq("FLIGHT_LOG"),eq(100L),eq("CORRECT"),notNull(),notNull());verify(entries,never()).delete(any());}
 @Test void permissionsAndMissingFlightAreChecked(){when(entries.history(eq(42L),any())).thenReturn(new SliceImpl<>(List.of()));assertFalse(service.history(42L,4L,0).puedeRegistrar());assertTrue(service.history(42L,2L,0).puedeRegistrar());assertThrows(ApiException.class,()->service.history(42L,3L,0));assertThrows(ApiException.class,()->service.create(42L,4L,input(null,null)));assertThrows(ApiException.class,()->service.create(999L,1L,input(null,null)));}
 @Test void automaticTransitionIsIdempotent(){when(entries.existsByFlightIdAndOrigenAndTipo(42L,"AUTOMATICO","INICIO")).thenReturn(false,true);service.automatic(flight,operations,"INICIO","Vuelo iniciado");service.automatic(flight,operations,"INICIO","Vuelo iniciado");verify(entries,times(1)).saveAndFlush(any());verify(audit,times(1)).record(eq(flight),eq(operations),eq("FLIGHT_LOG"),eq(100L),eq("CREATE_AUTO"),isNull(),anyString());}
}
