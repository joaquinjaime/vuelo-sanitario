package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Clasificación administrativa: la persona puede cumplir una función de tripulación. Es independiente del rol de acceso y de la habilitación profesional.
 * Retirarla no borra la fila (V58): registra fecha, actor y motivo y la conserva como historial; reclasificar inserta una fila nueva.
 */
@Entity
@Table(name="clasificaciones_tripulacion")
@AttributeOverride(name="id",column=@Column(name="id_clasificaciones_tripulacion"))
public class CrewQualification extends BaseEntity {
 public static final String RETIRO_ADMINISTRATIVO="RETIRO_ADMINISTRATIVO";
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuarios") private User user;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_roles_tripulacion") private CrewRole role;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuario_clasificador") private User classifier;
 @Column(name="fecha_clasificacion",nullable=false) private LocalDateTime classifiedAt=LocalDateTime.now();
 @Column(name="fecha_baja") private LocalDateTime retiredAt;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_baja") private User retiredBy;
 @Column(name="motivo_baja",length=200) private String retireReason;
 public User getUser(){return user;} public void setUser(User value){user=value;}
 public CrewRole getRole(){return role;} public void setRole(CrewRole value){role=value;}
 public User getClassifier(){return classifier;} public void setClassifier(User value){classifier=value;}
 public LocalDateTime getClassifiedAt(){return classifiedAt;} public void setClassifiedAt(LocalDateTime value){classifiedAt=value;}
 public LocalDateTime getRetiredAt(){return retiredAt;} public User getRetiredBy(){return retiredBy;} public String getRetireReason(){return retireReason;}
 public boolean isVigente(){return retiredAt==null;}
 public void retire(LocalDateTime at,User by,String reason){retiredAt=at;retiredBy=by;retireReason=reason;}
}
