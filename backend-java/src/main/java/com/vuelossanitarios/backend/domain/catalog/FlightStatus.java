/*
 * ACCESO A BASE DE DATOS
 * Entidad JPA de la tabla estados_vuelo: cada instancia es una fila.
 * Trae datos: la leen 2 clase(s) de servicio mediante sus repositorios (p. ej.
 *   FinalReportWorkflowService, FlightService).
 * Carga o modifica datos: no la escribe ningún servicio directamente (catálogo o dato que sólo
 *   se persiste junto a su entidad padre).
 */
package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Tabla {@code estados_vuelo}. Catálogo de estados del ciclo de vida de un vuelo (pendientes de confirmación, PLANIFICADO, EN_CURSO, FINALIZADO, COMPLETADO, CANCELADO). Sólo se lee; el vuelo guarda una referencia a su estado actual.
 */
@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_estados_vuelo"))
@Table(name = "estados_vuelo")
public class FlightStatus extends BaseEntity {

    @Column(name = "codigo_estado_vuelo", nullable = false, unique = true, length = 50)
    private String codigo;

    @Column(name = "nombre_estado_vuelo", nullable = false, length = 100)
    private String nombre;

    @Column(name = "orden", nullable = false)
    private Short orden;

    public FlightStatus() {
    }

    public String getCodigo() { return codigo; }
    public void setCodigo(String codigo) { this.codigo = codigo; }

    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }

    public Short getOrden() { return orden; }
    public void setOrden(Short orden) { this.orden = orden; }
}
