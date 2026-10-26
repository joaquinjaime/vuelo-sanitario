package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.person.PhoneNumbers;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Medio de contacto para coordinar UN traslado sanitario. Pertenece a la solicitud (no a una persona del sistema): puede ser el
 * propio paciente, un familiar o responsable, o un establecimiento. No reemplaza ni modifica los contactos compartidos de {@code personas}.
 */
@Entity @AttributeOverride(name="id", column=@Column(name="id_contactos_coordinacion_traslado"))
@Table(name="contactos_coordinacion_traslado")
public class TransferContact extends BaseEntity {
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="id_vuelos") private Flight flight;
 @Column(name="relacion_contacto", nullable=false, length=30) private String relacion;
 @Column(name="nombre_contacto", length=150) private String nombre;
 @Column(name="telefono_contacto", nullable=false, length=30) private String telefono;
 @Column(name="telefono_normalizado", nullable=false, length=30) private String telefonoNormalizado;
 /** País con cuyas reglas de numeración se validó el teléfono (ISO alfa-2); nulo = contacto anterior a V54, sin validar. */
 @Column(name="codigo_pais", length=2) private String codigoPais;
 @Column(name="observaciones_contacto", length=200) private String observaciones;
 @Column(name="es_principal", nullable=false) private Boolean principal=false;
 @Version @Column(name="version_contacto", nullable=false) private Long version;
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="id_usuario_alta") private User creadoPor;
 @Column(name="fecha_alta", nullable=false, updatable=false) private LocalDateTime fechaAlta;
 @Column(name="fecha_actualizacion", nullable=false) private LocalDateTime fechaActualizacion;
 @Column(name="fecha_baja") private LocalDateTime fechaBaja;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_baja") private User bajaPor;
 @Column(name="motivo_baja", length=30) private String motivoBaja;
 public Flight getFlight(){return flight;} public void setFlight(Flight v){flight=v;}
 public String getRelacion(){return relacion;} public void setRelacion(String v){relacion=v;}
 public String getNombre(){return nombre;} public void setNombre(String v){nombre=v;}
 public String getTelefono(){return telefono;}
 public String getCodigoPais(){return codigoPais;}
 /** Guarda un teléfono validado: formato internacional legible, E.164 y país. Es el único camino de escritura. */
 public void setValidated(PhoneNumbers.Parsed p){telefono=p.international();telefonoNormalizado=p.e164();codigoPais=p.region();}
 public String getTelefonoNormalizado(){return telefonoNormalizado;}
 public String getObservaciones(){return observaciones;} public void setObservaciones(String v){observaciones=v;}
 public Boolean getPrincipal(){return principal;} public void setPrincipal(Boolean v){principal=v;}
 public Long getVersion(){return version;}
 public User getCreadoPor(){return creadoPor;} public void setCreadoPor(User v){creadoPor=v;}
 public LocalDateTime getFechaAlta(){return fechaAlta;} public void setFechaAlta(LocalDateTime v){fechaAlta=v;}
 public LocalDateTime getFechaActualizacion(){return fechaActualizacion;} public void setFechaActualizacion(LocalDateTime v){fechaActualizacion=v;}
 public LocalDateTime getFechaBaja(){return fechaBaja;} public User getBajaPor(){return bajaPor;} public String getMotivoBaja(){return motivoBaja;}
 public void darDeBaja(LocalDateTime fecha,User responsable){fechaBaja=fecha;bajaPor=responsable;motivoBaja="RETIRO";principal=false;fechaActualizacion=fecha;}
}
