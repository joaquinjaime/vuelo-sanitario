package com.vuelossanitarios.backend.api.dto;


/**
 * Requisitos para cumplir una función de tripulación, uno por uno. Es la misma evaluación que decide la asignación ({@code CrewManagementService.evaluate}), pero sin detenerse
 * en el primer faltante: indica qué se cumple, qué falta, quién puede resolverlo y por qué procedimiento.
 */
public final class CrewRequirementDtos {
 private CrewRequirementDtos(){}
 /**
  * @param codigo        CUENTA_ACTIVA, ROL_ACCESO, LICENCIA, INFORME_FINAL o DISPONIBILIDAD
  * @param estado        CUMPLIDO o la causa precisa (p. ej. CUENTA_INACTIVA, ROL_AUSENTE, LICENCIA_AUSENTE, INFORME_FINAL_VENCIDO, CONFLICTO_ASIGNACION)
  * @param resuelve      quién puede resolverlo (ADMINISTRADOR u OPERACIONES), o null si está cumplido
  * @param procedimiento pasos legítimos para resolverlo, o null si está cumplido
  */
 public record RequirementView(String codigo,String titulo,boolean cumplido,String estado,String mensaje,String resuelve,String procedimiento){}
}
