package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import org.junit.jupiter.api.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class HangarInfoServiceTest {
    FlightRepository flights=mock(FlightRepository.class);
    HangarInfoRepository records=mock(HangarInfoRepository.class);
    AircraftRepository aircraft=mock(AircraftRepository.class);
    UserRepository users=mock(UserRepository.class);
    AuditService audit=mock(AuditService.class);
    HangarInfoService service=new HangarInfoService(flights,records,aircraft,users,audit,new ObjectMapper().findAndRegisterModules());
    Flight flight; User ops, commander, stranger; Aircraft plane; Airport origin;

    User actor(long id,String name,String code){User u=new User();u.setId(id);u.setUsername(name);Role role=new Role();role.setCodigo(code);u.setUserRoles(Set.of(new UserRole(u,role)));when(users.findById(id)).thenReturn(Optional.of(u));when(users.findWithRolesByUsername(name)).thenReturn(Optional.of(u));return u;}
    @BeforeEach void setup(){
        ops=actor(1,"ops","CENTRO_OPERACIONES"); commander=actor(2,"cmd","COMANDANTE"); stranger=actor(3,"other","COMANDANTE");
        flight=new Flight();flight.setId(10L);flight.setComandante(commander);FlightStatus status=new FlightStatus();status.setCodigo("PLANIFICADO");flight.setEstadoVuelo(status);
        origin=new Airport();origin.setId(20L);plane=new Aircraft();plane.setId(30L);plane.setAeropuertoActual(origin);flight.setAircraft(plane);flight.setOrigen(origin);
        when(flights.lockById(10L)).thenReturn(Optional.of(flight));when(flights.findById(10L)).thenReturn(Optional.of(flight));when(aircraft.lockById(30L)).thenReturn(Optional.of(plane));
    }
    @Test void registrationAuditsAndUsesConfirmedLocation(){
        service.save(10L,1L,new HangarInfoService.OperationsInput(0,true,true,"Preparado"));
        verify(aircraft).lockById(30L);
        verify(records).saveAndFlush(argThat(r->r.getFlight()==flight&&r.getVersion()==1&&Boolean.TRUE.equals(r.getPreparacionCompleta())));
        verify(audit).record(eq(flight),eq(ops),eq("HANGAR_INFO"),nullable(Long.class),eq("CREATE"),isNull(),contains("Preparado"));
    }
    @Test void rejectsOtherCommanderAndStaleWrites(){
        assertEquals(403,assertThrows(ApiException.class,()->service.get(10L,3L)).status().value());
        HangarInfo old=new HangarInfo();old.setVersion(2);when(records.findByFlightIdAndEsVersionActualTrue(10L)).thenReturn(Optional.of(old));
        assertEquals(409,assertThrows(ApiException.class,()->service.save(10L,1L,new HangarInfoService.OperationsInput(1,false,false,null))).status().value());
        verify(records,never()).saveAndFlush(any());
    }
    @Test void rejectsPreparationAtWrongAirportAndAfterCancellation(){
        Airport elsewhere=new Airport();elsewhere.setId(21L);plane.setAeropuertoActual(elsewhere);
        assertEquals(409,assertThrows(ApiException.class,()->service.save(10L,1L,new HangarInfoService.OperationsInput(0,true,true,null))).status().value());
        flight.getEstadoVuelo().setCodigo("CANCELADO");
        assertEquals(400,assertThrows(ApiException.class,()->service.save(10L,1L,new HangarInfoService.OperationsInput(0,false,false,null))).status().value());
        verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
    }
}
