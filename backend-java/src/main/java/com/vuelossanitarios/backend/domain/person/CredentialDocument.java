package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity @Table(name="documentos_habilitacion")
@AttributeOverride(name="id",column=@Column(name="id_documentos_habilitacion"))
public class CredentialDocument extends BaseEntity {
 public static final String QUARANTINE="EN_CUARENTENA",CLEAN="LIMPIO",REJECTED="RECHAZADO",SCAN_ERROR="ERROR_ANALISIS",LEGACY="LEGADO_SIN_ANALISIS";
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_habilitaciones_profesionales",nullable=false) public ProfessionalCredential credential;
 @Column(name="clave_archivo",nullable=false,length=120) public String key;
 @Column(name="nombre_archivo",nullable=false,length=255) public String name;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuario_cargador",nullable=false) public User uploader;
 @Column(name="fecha_carga",nullable=false,updatable=false) public LocalDateTime uploadedAt=LocalDateTime.now();
 @Column(name="proposito",nullable=false,length=25) public String purpose="EVIDENCIA";
 @Column(name="hash_sha256",length=64,columnDefinition="CHAR(64)") public String sha256;
 @Column(name="tamano_bytes") public Long sizeBytes;
 @Column(name="numero_version",nullable=false) public Integer version=1;
 /** Documento al que reemplaza esta versión; sólo el identificador (ver ProfessionalCredential.renewsId). */
 @Column(name="id_documento_reemplazado") public Long replacesId;
 @Column(name="estado_analisis",nullable=false,length=25) public String scanStatus=QUARANTINE;
 @Column(name="fecha_analisis") public LocalDateTime scannedAt;
 @Column(name="motor_analisis",length=100) public String scanEngine;
 @Column(name="detalle_analisis",length=500) public String scanDetail;
 @Column(name="fecha_baja") public LocalDateTime retiredAt;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_baja") public User retiredBy;
 @Column(name="motivo_baja",length=500) public String retireReason;
 @Column(name="bloqueo_conservacion",nullable=false) public Boolean retentionHold=false;
 @Column(name="motivo_bloqueo",length=500) public String holdReason;
 /** ANTERIOR_V59: cargado antes del análisis obligatorio; la condición se conserva aunque luego se analice. */
 public static final String BEFORE_V59="ANTERIOR_V59",AFTER_V59="POSTERIOR_V59",HASH_AT_UPLOAD="CARGA",HASH_AT_REGULARIZATION="REGULARIZACION";
 @Column(name="origen_registro",nullable=false,length=15) public String origin=AFTER_V59;
 /** CARGA: la huella prueba que el archivo no cambió desde que se recibió. REGULARIZACION: se calculó después y sólo prueba que no cambió desde entonces. */
 @Column(name="hash_momento",length=15) public String hashMoment;
 @Column(name="fecha_regularizacion") public LocalDateTime regularizedAt;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_regularizacion") public User regularizedBy;
 public boolean isActive(){return retiredAt==null;}
 public boolean isLegacy(){return BEFORE_V59.equals(origin);}
}
