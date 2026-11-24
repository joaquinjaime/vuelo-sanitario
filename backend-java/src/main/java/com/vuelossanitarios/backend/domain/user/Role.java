/*
 * ACCESO A BASE DE DATOS
 * Entidad JPA de la tabla roles: cada instancia es una fila.
 * Trae datos: la leen 1 clase(s) de servicio mediante sus repositorios (p. ej. AuthService).
 * Carga o modifica datos: no la escribe ningún servicio directamente (catálogo o dato que sólo
 *   se persiste junto a su entidad padre).
 */
package com.vuelossanitarios.backend.domain.user;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Tabla {@code roles}. Catálogo de roles de acceso (DTS, OPERACIONES, CENTRO_OPERACIONES, COMANDANTE, ADMINISTRADOR). Se asignan a los usuarios mediante usuarios_roles.
 */
@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_roles"))
@Table(name = "roles")
public class Role extends BaseEntity {

    @Column(name = "codigo_rol", nullable = false, unique = true, length = 30)
    private String codigo;

    @Column(name = "nombre_rol", nullable = false, length = 100)
    private String nombre;

    @Column(name = "descripcion_rol", columnDefinition = "NVARCHAR(MAX)")
    private String descripcion;

    @Column(name = "esta_activo", nullable = false)
    private Boolean activo = true;

    @CreationTimestamp
@Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Role() {
    }

    public String getCodigo() { return codigo; }
    public void setCodigo(String codigo) { this.codigo = codigo; }

    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }

    public String getDescripcion() { return descripcion; }
    public void setDescripcion(String descripcion) { this.descripcion = descripcion; }

    public Boolean getActivo() { return activo; }
    public void setActivo(Boolean activo) { this.activo = activo; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
