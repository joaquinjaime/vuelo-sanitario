/*
 * ACCESO A BASE DE DATOS
 * Entidad JPA de la tabla condiciones_paciente: cada instancia es una fila.
 * Trae datos: la leen 2 clase(s) de servicio mediante sus repositorios (p. ej.
 *   CatalogController, FlightService).
 * Carga o modifica datos: no la escribe ningún servicio directamente (catálogo o dato que sólo
 *   se persiste junto a su entidad padre).
 */
package com.vuelossanitarios.backend.domain.catalog;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;
/** Reference catalog for the patient's condition selected by the DTS when requesting a sanitary flight. */
@Entity @jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_condiciones_paciente"))
@Table(name="condiciones_paciente") public class PatientCondition extends BaseEntity {
 @Column(name="codigo_condicion_paciente",nullable=false,unique=true,length=30) private String codigo;
 @Column(name="nombre_condicion_paciente",nullable=false,length=100) private String nombre;
 @Column(name="esta_activa",nullable=false) private Boolean activo=true;
 @Column(name="orden",nullable=false) private Short orden;
 public String getCodigo(){return codigo;} public void setCodigo(String v){codigo=v;} public String getNombre(){return nombre;} public void setNombre(String v){nombre=v;} public Boolean getActivo(){return activo;} public void setActivo(Boolean v){activo=v;} public Short getOrden(){return orden;} public void setOrden(Short v){orden=v;}
}
