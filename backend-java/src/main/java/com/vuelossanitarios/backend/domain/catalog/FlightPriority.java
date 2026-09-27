package com.vuelossanitarios.backend.domain.catalog;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;
@Entity @Table(name="prioridades_vuelo") public class FlightPriority extends BaseEntity {
 @Column(name="codigo",nullable=false,unique=true,length=30) private String codigo;
 @Column(name="nombre",nullable=false,length=100) private String nombre;
 @Column(name="activo",nullable=false) private Boolean activo=true;
 @Column(name="orden",nullable=false) private Short orden;
 public String getCodigo(){return codigo;} public void setCodigo(String v){codigo=v;} public String getNombre(){return nombre;} public void setNombre(String v){nombre=v;} public Boolean getActivo(){return activo;} public void setActivo(Boolean v){activo=v;} public Short getOrden(){return orden;} public void setOrden(Short v){orden=v;}
}
