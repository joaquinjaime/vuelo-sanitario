package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.*;

@Entity @Table(name="habilitaciones_profesionales")
@AttributeOverride(name="id",column=@Column(name="id_habilitaciones_profesionales"))
public class ProfessionalCredential extends BaseEntity {
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_personas",nullable=false) public Person person;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_roles_tripulacion",nullable=false) public CrewRole role;
 @Column(name="tipo_habilitacion",nullable=false,length=100) public String type;
 @Column(name="numero_habilitacion",nullable=false,length=100) public String number;
 @Column(name="organismo_emisor",nullable=false,length=200) public String issuer;
 @Column(name="fecha_emision") public LocalDate issued;
 @Column(name="fecha_vencimiento") public LocalDate expires;
 @Column(name="vencimiento_no_aplica",nullable=false) public Boolean noExpiry=false;
 @Column(name="estado_verificacion",nullable=false,length=20) public String status="PENDIENTE";
 @Column(name="fecha_verificacion") public LocalDateTime verifiedAt;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_verificador") public User verifier;
 @Column(name="observaciones",columnDefinition="NVARCHAR(MAX)") public String notes;
 @Column(name="fecha_creacion",nullable=false,updatable=false) public LocalDateTime createdAt=LocalDateTime.now();
}
