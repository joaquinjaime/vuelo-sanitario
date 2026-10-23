package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

/** Common operational flight. Sanitary data is the optional SanitaryFlight extension. */
@Entity @jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_vuelos"))
@Table(name="vuelos")
public class Flight extends BaseEntity {
 @Column(name="codigo_vuelo", nullable=false, unique=true, length=30) private String codigo;
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="id_tipos_vuelo",nullable=false) private FlightType tipoVuelo;
 @Column(name="motivo_vuelo", nullable=false, columnDefinition="NVARCHAR(MAX)") private String motivoVuelo;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_estados_vuelo") private FlightStatus estadoVuelo;
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="id_usuario_creador",nullable=false) private User creadoPor;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_aeronaves") private Aircraft aircraft;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_comandante") private User comandante;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_aeropuerto_origen") private Airport origen;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_aeropuerto_destino") private Airport destino;
 @Column(name="fecha_planificada_salida") private LocalDateTime fechaPlanificadaSalida;
 @Column(name="fecha_planificada_llegada") private LocalDateTime fechaPlanificadaLlegada;
 @Column(name="fecha_salida_real") private LocalDateTime fechaSalidaReal;
 @Column(name="fecha_llegada_real") private LocalDateTime fechaLlegadaReal;
 @Column(name="fecha_cancelacion") private LocalDateTime fechaCancelacion;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_cancelador") private User canceladoPor;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_motivos_cancelacion") private CancellationReason motivoCancelacion;
 @Column(name="motivo_cancelacion_personalizado",columnDefinition="NVARCHAR(MAX)") private String motivoCancelacionPersonalizado;
 @OneToOne(mappedBy="flight",fetch=FetchType.LAZY,cascade=CascadeType.ALL) private SanitaryFlight sanitario;
 @CreationTimestamp @Column(name="fecha_creacion",nullable=false,updatable=false) private LocalDateTime createdAt;
 @UpdateTimestamp @Column(name="fecha_actualizacion",nullable=false) private LocalDateTime updatedAt;
 public String getCodigo(){return codigo;} public void setCodigo(String v){codigo=v;}
 public FlightType getTipoVuelo(){return tipoVuelo;} public void setTipoVuelo(FlightType v){tipoVuelo=v;}
 public String getMotivoVuelo(){return motivoVuelo;} public void setMotivoVuelo(String v){motivoVuelo=v;}
 public FlightStatus getEstadoVuelo(){return estadoVuelo;} public void setEstadoVuelo(FlightStatus v){estadoVuelo=v;}
 public User getCreadoPor(){return creadoPor;} public void setCreadoPor(User v){creadoPor=v;}
 public Aircraft getAircraft(){return aircraft;} public void setAircraft(Aircraft v){aircraft=v;}
 public User getComandante(){return comandante;} public void setComandante(User v){comandante=v;}
 public Airport getOrigen(){return origen;} public void setOrigen(Airport v){origen=v;}
 public Airport getDestino(){return destino;} public void setDestino(Airport v){destino=v;}
 public LocalDateTime getFechaPlanificadaSalida(){return fechaPlanificadaSalida;} public void setFechaPlanificadaSalida(LocalDateTime v){fechaPlanificadaSalida=v;}
 public LocalDateTime getFechaPlanificadaLlegada(){return fechaPlanificadaLlegada;} public void setFechaPlanificadaLlegada(LocalDateTime v){fechaPlanificadaLlegada=v;}
 public LocalDateTime getFechaSalidaReal(){return fechaSalidaReal;} public void setFechaSalidaReal(LocalDateTime v){fechaSalidaReal=v;}
 public LocalDateTime getFechaLlegadaReal(){return fechaLlegadaReal;} public void setFechaLlegadaReal(LocalDateTime v){fechaLlegadaReal=v;}
 public LocalDateTime getFechaCancelacion(){return fechaCancelacion;} public void setFechaCancelacion(LocalDateTime v){fechaCancelacion=v;}
 public User getCanceladoPor(){return canceladoPor;} public void setCanceladoPor(User v){canceladoPor=v;}
 public CancellationReason getMotivoCancelacion(){return motivoCancelacion;} public void setMotivoCancelacion(CancellationReason v){motivoCancelacion=v;}
 public String getMotivoCancelacionPersonalizado(){return motivoCancelacionPersonalizado;} public void setMotivoCancelacionPersonalizado(String v){motivoCancelacionPersonalizado=v;}
 public SanitaryFlight getSanitario(){return sanitario;} public void setSanitario(SanitaryFlight v){sanitario=v;if(v!=null&&v.getFlight()!=this)v.setFlight(this);}
 public LocalDateTime getCreatedAt(){return createdAt;} public LocalDateTime getUpdatedAt(){return updatedAt;}
}
