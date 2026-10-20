package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.Crew;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CrewManagementServiceTest {
 private final FlightRepository flights=mock(FlightRepository.class);
 private final FlightCrewRepository crews=mock(FlightCrewRepository.class);
 private final UserRepository users=mock(UserRepository.class);
 private final CrewRoleRepository roles=mock(CrewRoleRepository.class);
 private final CrewQualificationRepository qualifications=mock(CrewQualificationRepository.class);
 private final AuditService audit=mock(AuditService.class);
 private final ProfessionalCredentialService credentials=mock(ProfessionalCredentialService.class);
 private final CrewManagementService service=new CrewManagementService(flights,crews,users,roles,qualifications,audit,credentials);
 private Flight flight; private User member;

 @BeforeEach void setup(){
  flight=new Flight();flight.setId(1L);FlightStatus status=new FlightStatus();status.setCodigo("PLANIFICADO");flight.setEstadoVuelo(status);
  flight.setFechaPlanificadaSalida(LocalDateTime.of(2030,1,1,23,0));flight.setFechaPlanificadaLlegada(LocalDateTime.of(2030,1,2,1,0));
  member=new User();member.setId(2L);member.setActivo(true);member.setEstadoCuenta("ACTIVO");
  CrewRole role=new CrewRole();role.setCodigo("MEDICO");
  when(flights.lockById(1L)).thenReturn(Optional.of(flight));when(users.lockById(2L)).thenReturn(Optional.of(member));
  when(credentials.sufficient(any(),eq("MEDICO"),any())).thenReturn(true);
  when(roles.findByCodigo("MEDICO")).thenReturn(Optional.of(role));when(qualifications.existsByUserIdAndRoleCodigo(2L,"MEDICO")).thenReturn(true);
 }
 @Test void missingOrInvalidTimeCannotAssign(){
  flight.setFechaPlanificadaLlegada(null);assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));
  flight.setFechaPlanificadaLlegada(flight.getFechaPlanificadaSalida());assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));
  verify(crews,never()).saveAndFlush(any());
 }
 @Test void unknownTimeInAnotherCommitmentBlocksAssignment(){
  Flight other=new Flight();other.setId(4L);other.setFechaPlanificadaSalida(flight.getFechaPlanificadaSalida());
  FlightCrew otherAssignment=new FlightCrew();otherAssignment.setFlight(other);when(crews.findByUserId(2L)).thenReturn(List.of(otherAssignment));
  assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));verify(crews,never()).saveAndFlush(any());
 }
 @Test void overlappingAcrossMidnightBlocksAssignment(){
  Flight other=new Flight();other.setId(4L);other.setFechaPlanificadaSalida(LocalDateTime.of(2030,1,2,0,30));other.setFechaPlanificadaLlegada(LocalDateTime.of(2030,1,2,2,0));
  FlightCrew otherAssignment=new FlightCrew();otherAssignment.setFlight(other);when(crews.findByUserId(2L)).thenReturn(List.of(otherAssignment));
  assertThrows(ApiException.class,()->service.assign(1L,new Crew(2L,"MEDICO"),3L));verify(crews,never()).saveAndFlush(any());
 }
}
