package com.vuelossanitarios.backend.domain.catalog;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;
@Entity @jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_prioridades_vuelo"))
@Table(name="prioridades_vuelo") public class FlightPriority extends BaseEntity {
 @Column(name="codigo_prioridad_vuelo",nullable=false,unique=true,length=30) private String codigo;
 @Column(name="nombre_prioridad_vuelo",nullable=false,length=100) private String nombre;
 @Column(name="esta_activa",nullable=false) private Boolean activo=true;
 @Column(name="orden",nullable=false) private Short orden;
 public String getCodigo(){return codigo;} public void setCodigo(String v){codigo=v;} public String getNombre(){return nombre;} public void setNombre(String v){nombre=v;} public Boolean getActivo(){return activo;} public void setActivo(Boolean v){activo=v;} public Short getOrden(){return orden;} public void setOrden(Short v){orden=v;}
}
