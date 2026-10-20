package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity @Table(name="documentos_habilitacion")
@AttributeOverride(name="id",column=@Column(name="id_documentos_habilitacion"))
public class CredentialDocument extends BaseEntity {
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_habilitaciones_profesionales",nullable=false) public ProfessionalCredential credential;
 @Column(name="clave_archivo",nullable=false,length=120) public String key;
 @Column(name="nombre_archivo",nullable=false,length=255) public String name;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuario_cargador",nullable=false) public User uploader;
 @Column(name="fecha_carga",nullable=false,updatable=false) public LocalDateTime uploadedAt=LocalDateTime.now();
}
