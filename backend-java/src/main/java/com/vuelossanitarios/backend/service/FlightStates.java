package com.vuelossanitarios.backend.service;

import java.util.List;
import java.util.Set;

/** Estados de vuelo que definen cuándo un recurso (aeronave, tripulante) está comprometido. Fuente única para las reglas de disponibilidad. */
public final class FlightStates {
 private FlightStates(){}
 /** El vuelo retiene sus recursos: confirmación pendiente, propuesta pendiente, planificado o en curso. */
 public static final List<String> COMMITTED = List.of("PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PLANIFICADO","EN_CURSO");
 /** Antes de iniciarse el vuelo: la tripulación y la aeronave todavía pueden modificarse. */
 public static final Set<String> MUTABLE_BEFORE_START = Set.of("PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PLANIFICADO","PENDIENTE_REPLANIFICACION");
 /** Estados que liberan los recursos: no cuentan en las validaciones de disponibilidad. */
 public static final Set<String> TERMINAL = Set.of("FINALIZADO","COMPLETADO","CANCELADO","RECHAZADO");
}
