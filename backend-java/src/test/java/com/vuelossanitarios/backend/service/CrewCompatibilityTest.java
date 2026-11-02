package com.vuelossanitarios.backend.service;

import static com.vuelossanitarios.backend.service.CrewManagementService.Compat.*;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.vuelossanitarios.backend.domain.flight.Flight;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

/** Compatibilidad horaria de dos vuelos de una misma persona (comandante o copiloto): conflicto, compatible o indeterminado, sin confirmar por omisión lo que no se sabe. */
class CrewCompatibilityTest {
 private static LocalDateTime t(int h,int m){return LocalDateTime.of(2030,3,1,h,m);}
 private static Flight flight(LocalDateTime from,LocalDateTime to){Flight f=new Flight();f.setFechaPlanificadaSalida(from);f.setFechaPlanificadaLlegada(to);return f;}

 @Test void arrivalAfterTheNextDepartureIsAConflict(){
  // Vuelo A llega a las 18:00 y el B sale a las 17:30.
  assertEquals(CONFLICTO,CrewManagementService.compat(flight(t(17,30),t(20,0)),flight(t(14,0),t(18,0))));
  assertEquals(CONFLICTO,CrewManagementService.compat(flight(t(14,0),t(18,0)),flight(t(17,30),t(20,0))));
 }
 @Test void aFlightThatDepartsRightAfterTheArrivalIsCompatible(){
  assertEquals(COMPATIBLE,CrewManagementService.compat(flight(t(18,0),t(20,0)),flight(t(14,0),t(18,0))));
  assertEquals(COMPATIBLE,CrewManagementService.compat(flight(t(10,0),t(13,0)),flight(t(13,0),t(15,0))));
 }
 @Test void aSimultaneousFlightIsAConflict(){assertEquals(CONFLICTO,CrewManagementService.compat(flight(t(10,0),t(13,0)),flight(t(11,0),t(12,0))));}
 @Test void anOpenEndedFlightOccupiesTimeFromItsDeparture(){
  // El otro vuelo no tiene llegada: ocupa desde su salida.
  assertEquals(COMPATIBLE,CrewManagementService.compat(flight(t(8,0),t(10,0)),flight(t(10,30),null)),"termina antes de que el otro despegue");
  assertEquals(CONFLICTO,CrewManagementService.compat(flight(t(8,0),t(12,0)),flight(t(10,30),null)),"el otro despega mientras éste está en curso");
  assertEquals(INDETERMINADO,CrewManagementService.compat(flight(t(12,0),t(14,0)),flight(t(10,30),null)),"el otro pudo seguir en curso: no se confirma");
  // Este vuelo no tiene llegada.
  assertEquals(COMPATIBLE,CrewManagementService.compat(flight(t(18,0),null),flight(t(14,0),t(18,0))));
  assertEquals(CONFLICTO,CrewManagementService.compat(flight(t(16,0),null),flight(t(14,0),t(18,0))));
  assertEquals(INDETERMINADO,CrewManagementService.compat(flight(t(10,0),null),flight(t(14,0),t(18,0))),"no se sabe cuándo termina éste");
 }
 @Test void bothWithoutArrivalOrAnyWithoutDepartureIsIndeterminate(){
  assertEquals(INDETERMINADO,CrewManagementService.compat(flight(t(10,0),null),flight(t(14,0),null)));
  assertEquals(CONFLICTO,CrewManagementService.compat(flight(t(10,0),null),flight(t(10,0),null)));
  assertEquals(INDETERMINADO,CrewManagementService.compat(flight(null,null),flight(t(14,0),t(18,0))));
  assertEquals(INDETERMINADO,CrewManagementService.compat(flight(t(10,0),t(12,0)),flight(null,null)));
 }
 @Test void aDegenerateIntervalCountsAsWithoutArrival(){
  assertEquals(INDETERMINADO,CrewManagementService.compat(flight(t(10,0),t(12,0)),flight(t(8,0),t(8,0))));
 }
}
