/*
 * ACCESO A BASE DE DATOS
 * Entidad JPA de la tabla roles_tripulacion: cada instancia es una fila.
 * Trae datos: la leen 4 clase(s) de servicio mediante sus repositorios (p. ej.
 *   CatalogController, CrewContactService, CrewManagementService).
 * Carga o modifica datos: no la escribe ningún servicio directamente (catálogo o dato que sólo
 *   se persiste junto a su entidad padre).
 */
package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Tabla {@code roles_tripulacion}. Catálogo de funciones a bordo (comandante, copiloto, médico, enfermero/a) que se asignan a un tripulante dentro de un vuelo. Se lee desde la gestión de tripulación.
 */
@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_roles_tripulacion"))
@Table(name = "roles_tripulacion")
public class CrewRole extends BaseEntity {

    @Column(name = "codigo_rol_tripulacion", nullable = false, unique = true, length = 30)
    private String codigo;

    @Column(name = "nombre_rol_tripulacion", nullable = false, length = 100)
    private String nombre;

    public CrewRole() {
    }

    public String getCodigo() { return codigo; }
    public void setCodigo(String codigo) { this.codigo = codigo; }

    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }
}
