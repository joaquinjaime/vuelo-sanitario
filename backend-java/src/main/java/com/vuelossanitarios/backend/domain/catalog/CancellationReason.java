/*
 * ACCESO A BASE DE DATOS
 * Entidad JPA de la tabla motivos_cancelacion: cada instancia es una fila.
 * Trae datos: la leen 2 clase(s) de servicio mediante sus repositorios (p. ej.
 *   CatalogController, FlightService).
 * Carga o modifica datos: no la escribe ningún servicio directamente (catálogo o dato que sólo
 *   se persiste junto a su entidad padre).
 */
package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Tabla {@code motivos_cancelacion}. Catálogo de motivos con los que se puede cancelar un vuelo. Sólo se lee al cancelar.
 */
@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_motivos_cancelacion"))
@Table(name = "motivos_cancelacion")
public class CancellationReason extends BaseEntity {
    @Column(name = "codigo_motivo_cancelacion", nullable = false, unique = true, length = 80) private String codigo;
    @Column(name = "nombre_motivo_cancelacion", nullable = false, length = 200) private String nombre;
    @Column(name = "descripcion_motivo_cancelacion", columnDefinition = "NVARCHAR(MAX)") private String descripcion;
    @Column(name = "categoria", nullable = false, length = 40) private String categoria;
    @Column(name = "esta_activo", nullable = false) private Boolean activo = true;
    @Column(name = "orden", nullable = false) private Short orden;
    public String getCodigo(){ return codigo; } public void setCodigo(String value){ codigo=value; }
    public String getNombre(){ return nombre; } public void setNombre(String value){ nombre=value; }
    public String getDescripcion(){ return descripcion; } public void setDescripcion(String value){ descripcion=value; }
    public String getCategoria(){ return categoria; } public void setCategoria(String value){ categoria=value; }
    public Boolean getActivo(){ return activo; } public void setActivo(Boolean value){ activo=value; }
    public Short getOrden(){ return orden; } public void setOrden(Short value){ orden=value; }
}
