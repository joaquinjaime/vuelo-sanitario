package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.catalog.FlightType;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/** Una combinación aceptada de función, tipo de operación, categoría de aeronave y tipo de habilitación. NULL en tipo de vuelo o categoría = cualquiera. */
@Entity @Table(name="politicas_habilitacion")
@AttributeOverride(name="id",column=@Column(name="id_politicas_habilitacion"))
public class CredentialPolicy extends BaseEntity {
 public static final String INTERNAL="CONFIGURACION_INTERNA",OFFICIAL="FUENTE_OFICIAL_CITADA";
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_roles_tripulacion",nullable=false) public CrewRole role;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_tipos_vuelo") public FlightType flightType;
 @Column(name="categoria_aeronave",length=50) public String aircraftCategory;
 @Column(name="tipo_habilitacion",nullable=false,length=100) public String credentialType;
 @Column(name="requiere_jurisdiccion",nullable=false) public Boolean requiresJurisdiction=false;
 @Column(name="requiere_consulta_externa",nullable=false) public Boolean requiresExternalCheck=false;
 @Column(name="origen",nullable=false,length=30) public String origin=INTERNAL;
 @Column(name="fuente_referencia",length=500) public String sourceReference;
 @Column(name="observaciones",length=1000) public String notes;
 @Column(name="activa",nullable=false) public Boolean active=true;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuario_alta",nullable=false) public User createdBy;
 @Column(name="fecha_alta",nullable=false,updatable=false) public LocalDateTime createdAt=LocalDateTime.now();
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_baja") public User retiredBy;
 @Column(name="fecha_baja") public LocalDateTime retiredAt;
 @Column(name="motivo_baja",length=500) public String retireReason;
}
