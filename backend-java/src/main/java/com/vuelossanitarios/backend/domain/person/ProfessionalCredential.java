package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.catalog.Province;
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
 @Column(name="estado_verificacion",nullable=false,length=25) public String status="PENDIENTE";
 @Column(name="fecha_verificacion") public LocalDateTime verifiedAt;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_verificador") public User verifier;
 @Column(name="observaciones",columnDefinition="NVARCHAR(MAX)") public String notes;
 @Column(name="fecha_creacion",nullable=false,updatable=false) public LocalDateTime createdAt=LocalDateTime.now();
 /** Alcance declarado por la habilitación (V59): categoría de aeronave a la que aplica y jurisdicción de la matrícula; NULL = no restringida / no informada. */
 @Column(name="categoria_aeronave",length=50) public String aircraftCategory;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_provincias_jurisdiccion") public Province jurisdiction;
 @Column(name="restricciones",length=1000) public String restrictions;
 /** Habilitación a la que renueva esta (la anterior se conserva intacta). Sólo el identificador: una asociación perezosa a la misma entidad devolvería proxies en las consultas, y estas entidades se leen por campo. */
 @Column(name="id_habilitacion_renovada") public Long renewsId;
}
