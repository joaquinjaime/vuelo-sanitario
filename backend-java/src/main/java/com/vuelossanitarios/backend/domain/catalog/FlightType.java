package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;

@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_tipos_vuelo"))
@Table(name = "tipos_vuelo")
public class FlightType extends BaseEntity {
 @Column(name="codigo_tipo_vuelo", nullable=false, unique=true, length=40) private String codigo;
 @Column(name="nombre_tipo_vuelo", nullable=false, length=100) private String nombre;
 @Column(name="esta_activo", nullable=false) private Boolean activo=true;
 public String getCodigo(){return codigo;} public void setCodigo(String v){codigo=v;}
 public String getNombre(){return nombre;} public void setNombre(String v){nombre=v;}
 public Boolean getActivo(){return activo;} public void setActivo(Boolean v){activo=v;}
}
