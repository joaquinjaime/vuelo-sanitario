package com.vuelossanitarios.backend.api.dto;

import java.util.List;

/**
 * Contactos laborales de la tripulación vigente de un vuelo, para el Centro de Operaciones. Es una vista mínima y de sólo lectura:
 * no lleva DNI, nombre de usuario, roles, contactos personales ni identificadores de personas o contactos.
 */
public final class CrewContactDtos {
 private CrewContactDtos(){}
 /** Estado de un tripulante: tiene contactos laborales, no tiene ninguno disponible (sin distinguir si posee contactos privados) o su cuenta no está activa. */
 public static final String AVAILABLE="DISPONIBLE", NO_WORK_CONTACT="SIN_CONTACTO_LABORAL", INACTIVE_ACCOUNT="CUENTA_NO_ACTIVA";
 /** {@code principal}: el titular lo marcó como su contacto principal (la marca es única por persona, no por tipo). */
 public record ContactValue(String valor,boolean principal){}
 /**
  * Sólo se entregan correos laborales <b>verificados</b> (se confirmó la recepción de un código) y teléfonos laborales validados con las reglas de su país
  * (formato internacional; la validez de numeración no prueba que la línea exista ni sea de su titular). Si el titular tiene un correo / teléfono laboral que
  * todavía no cumple eso, el contacto no se devuelve y el indicador correspondiente lo informa.
  * {@code asignacionId} es el de la fila vigente de {@code vuelos_tripulantes}; es nulo sólo si el comandante figura únicamente en el vuelo. */
 public record MemberContacts(Long asignacionId,String nombre,String apellido,String funcionCode,String funcion,boolean comandante,String estado,List<ContactValue> telefonos,List<ContactValue> correos,boolean hayMasContactos,boolean correoLaboralSinVerificar,boolean telefonoLaboralSinValidar){}
 public record CrewContactsView(Long vueloId,String vueloCodigo,List<MemberContacts> tripulantes){}
}
