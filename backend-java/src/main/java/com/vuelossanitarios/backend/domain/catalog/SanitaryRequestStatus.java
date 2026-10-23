package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;

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
