package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/** Historial inmutable de decisiones sobre una habilitación: quién, cuándo, por qué y con qué evidencia. */
@Entity @Table(name="decisiones_habilitacion")
@AttributeOverride(name="id",column=@Column(name="id_decisiones_habilitacion"))
public class CredentialDecision extends BaseEntity {
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_habilitaciones_profesionales",nullable=false) public ProfessionalCredential credential;
 @Column(name="tipo_decision",nullable=false,length=30) public String type;
 @Column(name="estado_resultante",nullable=false,length=25) public String resultingStatus;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuarios",nullable=false) public User actor;
 @Column(name="fecha_decision",nullable=false,updatable=false) public LocalDateTime at=LocalDateTime.now();
 @Column(name="motivo",length=4000) public String reason;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_documentos_habilitacion") public CredentialDocument document;
}
