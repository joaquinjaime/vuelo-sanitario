package com.vuelossanitarios.backend.repository;

/**
 * Persona de una tripulación sin cargar las entidades {@code User} / {@code Person}: sólo lo necesario para mostrarla y buscar sus
 * contactos (nunca el DNI ni la cuenta completa). Evita además la consulta adicional por persona de las asociaciones uno a uno inversas.
 * {@code assignmentId} es nulo cuando la persona sólo figura como comandante del vuelo.
 */
public record CrewPersonRow(Long assignmentId,Long userId,Boolean active,String accountState,Long personId,String nombre,String apellido,String roleCode,String roleName){
 public boolean activeAccount(){return Boolean.TRUE.equals(active)&&"ACTIVO".equals(accountState);}
}
