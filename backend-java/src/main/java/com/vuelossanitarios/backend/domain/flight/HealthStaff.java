package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * Médico o enfermero registrado por un DTS para participar en sus vuelos sanitarios (V66). Es un registro administrativo de una persona: no es un usuario y no tiene
 * cuenta, contraseña, rol ni sesión. {@code owner} es la cuenta DTS que lo registró y la única que puede verlo o modificarlo. La matrícula es un dato declarado para
 * identificar a la persona: la aplicación no la verifica ante ningún organismo. Desactivarlo lo saca del listado de selección sin borrar su participación histórica.
 */
@Entity
@AttributeOverride(name="id", column=@Column(name="id_personal_sanitario"))
@Table(name="personal_sanitario")
public class HealthStaff extends BaseEntity {
 public static final String DOCTOR="MEDICO", NURSE="ENFERMERO";
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_personas") private Person person;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuario_dts") private User owner;
 @Column(name="tipo_profesional",nullable=false,length=20) private String type;
 @Column(name="matricula",nullable=false,length=50) private String registration;
 @Column(name="esta_activo",nullable=false) private Boolean active=true;
 @Column(name="fecha_desactivacion") private LocalDateTime deactivatedAt;
 @Version @Column(name="version_registro",nullable=false) private Long version;
 @CreationTimestamp @Column(name="fecha_creacion",nullable=false,updatable=false) private LocalDateTime createdAt;
 @UpdateTimestamp @Column(name="fecha_actualizacion",nullable=false) private LocalDateTime updatedAt;
 public Person getPerson(){return person;} public void setPerson(Person v){person=v;}
 public User getOwner(){return owner;} public void setOwner(User v){owner=v;}
 public String getType(){return type;} public void setType(String v){type=v;}
 public String getRegistration(){return registration;} public void setRegistration(String v){registration=v;}
 public boolean isActive(){return Boolean.TRUE.equals(active);}
 public Long getVersion(){return version;}
 public LocalDateTime getDeactivatedAt(){return deactivatedAt;}
 public LocalDateTime getCreatedAt(){return createdAt;}
 public void deactivate(LocalDateTime at){active=false;deactivatedAt=at;}
 public void reactivate(){active=true;deactivatedAt=null;}
}
