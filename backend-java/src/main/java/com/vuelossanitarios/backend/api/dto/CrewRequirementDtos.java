package com.vuelossanitarios.backend.api.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Requisitos para cumplir una función de tripulación, uno por uno. Es la misma evaluación que decide la asignación ({@code CrewManagementService.evaluateOn}), pero sin detenerse
 * en el primer faltante: indica qué se cumple, qué falta, quién puede resolverlo y por qué procedimiento.
 */
public final class CrewRequirementDtos {
 private CrewRequirementDtos(){}
 /**
  * @param codigo        CUENTA_ACTIVA, ROL_ACCESO, LICENCIA, CLASIFICACION, HABILITACION, INFORME_FINAL o DISPONIBILIDAD
  * @param estado        CUMPLIDO o la causa precisa (p. ej. NO_REGISTRADA, RETIRADA, OTRA_FUNCION, HABILITACION_AUSENTE, HABILITACION_NO_VERIFICADA, HABILITACION_VENCIDA)
  * @param resuelve      quién puede resolverlo (ADMINISTRADOR u OPERACIONES), o null si está cumplido
  * @param procedimiento pasos legítimos para resolverlo, o null si está cumplido
  */
 public record RequirementView(String codigo,String titulo,boolean cumplido,String estado,String mensaje,String resuelve,String procedimiento){}
 /** Requisitos de una persona para una función, con su ubicación operativa informativa (la ubicación se evalúa contra el aeropuerto de cada vuelo, no es un requisito permanente). */
 public record UserRequirementsView(Long userId,String username,String nombre,String apellido,String crewRoleCode,String crewRoleName,boolean elegible,int faltantes,String provinciaOperativa,LocalDateTime ubicacionActualizadaEn,List<RequirementView> requisitos){}
}
