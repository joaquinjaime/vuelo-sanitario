package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name="clasificaciones_tripulacion")
@AttributeOverride(name="id",column=@Column(name="id_clasificaciones_tripulacion"))
public class CrewQualification extends BaseEntity {
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuarios") private User user;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_roles_tripulacion") private CrewRole role;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuario_clasificador") private User classifier;
 @Column(name="fecha_clasificacion",nullable=false) private LocalDateTime classifiedAt=LocalDateTime.now();
 public User getUser(){return user;} public void setUser(User value){user=value;}
 public CrewRole getRole(){return role;} public void setRole(CrewRole value){role=value;}
 public User getClassifier(){return classifier;} public void setClassifier(User value){classifier=value;}
}
