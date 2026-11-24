/*
 * ACCESO A BASE DE DATOS
 * Entidad JPA de la tabla estados_solicitud_sanitaria: cada instancia es una fila.
 * Trae datos: la leen 1 clase(s) de servicio mediante sus repositorios (p. ej. FlightService).
 * Carga o modifica datos: no la escribe ningún servicio directamente (catálogo o dato que sólo
 *   se persiste junto a su entidad padre).
 */
package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;

/**
 * Tabla {@code estados_solicitud_sanitaria}. Catálogo de estados de una solicitud sanitaria (solicitado, pendiente de respuesta DTS, aprobado, rechazado). Sólo se lee; la solicitud guarda una referencia a su estado.
 */
@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_estados_solicitud_sanitaria"))
@Table(name = "estados_solicitud_sanitaria")
public class SanitaryRequestStatus extends BaseEntity {
 @Column(name="codigo_estado_solicitud", nullable=false, unique=true, length=40) private String codigo;
 @Column(name="nombre_estado_solicitud", nullable=false, length=100) private String nombre;
 @Column(name="orden", nullable=false) private Short orden;
 public String getCodigo(){return codigo;} public void setCodigo(String v){codigo=v;}
 public String getNombre(){return nombre;} public void setNombre(String v){nombre=v;}
 public Short getOrden(){return orden;} public void setOrden(Short v){orden=v;}
}
