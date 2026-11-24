/*
 * ACCESO A BASE DE DATOS
 * Entidad JPA de la tabla provincias: cada instancia es una fila.
 * Trae datos: la leen 4 clase(s) de servicio mediante sus repositorios (p. ej. AuthService,
 *   CatalogController, CommanderLocationService).
 * Carga o modifica datos: GeographicCatalogService.
 */
package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Tabla {@code provincias}. Provincia del catálogo geográfico (incluye CABA). Determina la jurisdicción de aeropuertos y la ubicación de los comandantes; se da de baja de forma lógica.
 */
@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_provincias"))
@Table(name = "provincias")
public class Province extends BaseEntity {
    @Column(name = "codigo_oficial", nullable = false, unique = true, length = 10)
    private String codigoOficial;
    @Column(name = "nombre_provincia", nullable = false, unique = true, length = 100)
    private String nombre;
    @Column(name = "esta_activa", nullable = false)
    private Boolean activo = true;
    public String getCodigoOficial() { return codigoOficial; }
    public void setCodigoOficial(String value) { codigoOficial = value; }
    public String getNombre() { return nombre; }
    public void setNombre(String value) { nombre = value; }
    public Boolean getActivo() { return activo; }
    public void setActivo(Boolean value) { activo = value; }
}
