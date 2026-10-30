package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/** Consulta manual a una fuente oficial. Es lo que el administrador declara haber visto; no es una validación emitida por el organismo. */
@Entity @Table(name="consultas_externas_habilitacion")
@AttributeOverride(name="id",column=@Column(name="id_consultas_externas_habilitacion"))
public class ExternalCredentialCheck extends BaseEntity {
 public static final String MATCH="COINCIDE";
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_habilitaciones_profesionales",nullable=false) public ProfessionalCredential credential;
 @Column(name="organismo",nullable=false,length=20) public String authority;
 @Column(name="fecha_consulta",nullable=false) public LocalDateTime consultedAt;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuario_responsable",nullable=false) public User responsible;
 @Column(name="numero_consultado",nullable=false,length=100) public String numberChecked;
 @Column(name="datos_contrastados",nullable=false,length=1000) public String comparedData;
 @Column(name="resultado",nullable=false,length=20) public String result;
 @Column(name="observaciones",length=2000) public String notes;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_documentos_habilitacion") public CredentialDocument evidence;
 @Column(name="fecha_registro",nullable=false,updatable=false) public LocalDateTime recordedAt=LocalDateTime.now();
}
