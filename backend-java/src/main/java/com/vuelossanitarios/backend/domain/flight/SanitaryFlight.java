package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/** Optional sanitary extension of one operational flight. */
@Entity
@Table(name="vuelos_sanitarios")
public class SanitaryFlight {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) @Column(name="id_vuelos_sanitarios") private Long id;
 @OneToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="id_vuelos", unique=true) private Flight flight;
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="id_pacientes") private Patient patient;
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="id_usuario_solicitante") private User solicitadoPor;
 @Column(name="fecha_solicitada", nullable=false) private LocalDateTime fechaSolicitada;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_prioridades_vuelo") private FlightPriority prioridad;
 @Column(name="extrema_urgencia", nullable=false) private Boolean extremaUrgencia=false;
 @Column(name="justificacion_extrema_urgencia", columnDefinition="NVARCHAR(MAX)") private String justificacionExtremaUrgencia;
 @Column(name="fecha_limite_traslado") private LocalDateTime fechaLimiteTraslado;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_localidad_origen") private Locality localidadOrigenSolicitada;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_localidad_destino") private Locality localidadDestinoSolicitada;
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="id_estados_solicitud_sanitaria") private SanitaryRequestStatus estadoSolicitud;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_evaluador") private User evaluadoPor;
 @Column(name="fecha_evaluacion") private LocalDateTime fechaEvaluacion;
 @Column(name="motivo_rechazo", columnDefinition="NVARCHAR(MAX)") private String motivoRechazo;
 public Long getId(){return id;} public Flight getFlight(){return flight;} public void setFlight(Flight v){flight=v;}
 public Patient getPatient(){return patient;} public void setPatient(Patient v){patient=v;}
 public User getSolicitadoPor(){return solicitadoPor;} public void setSolicitadoPor(User v){solicitadoPor=v;}
 public LocalDateTime getFechaSolicitada(){return fechaSolicitada;} public void setFechaSolicitada(LocalDateTime v){fechaSolicitada=v;}
 public FlightPriority getPrioridad(){return prioridad;} public void setPrioridad(FlightPriority v){prioridad=v;}
 public Boolean getExtremaUrgencia(){return extremaUrgencia;} public void setExtremaUrgencia(Boolean v){extremaUrgencia=v;}
 public String getJustificacionExtremaUrgencia(){return justificacionExtremaUrgencia;} public void setJustificacionExtremaUrgencia(String v){justificacionExtremaUrgencia=v;}
 public LocalDateTime getFechaLimiteTraslado(){return fechaLimiteTraslado;} public void setFechaLimiteTraslado(LocalDateTime v){fechaLimiteTraslado=v;}
 public Locality getLocalidadOrigenSolicitada(){return localidadOrigenSolicitada;} public void setLocalidadOrigenSolicitada(Locality v){localidadOrigenSolicitada=v;}
 public Locality getLocalidadDestinoSolicitada(){return localidadDestinoSolicitada;} public void setLocalidadDestinoSolicitada(Locality v){localidadDestinoSolicitada=v;}
 public SanitaryRequestStatus getEstadoSolicitud(){return estadoSolicitud;} public void setEstadoSolicitud(SanitaryRequestStatus v){estadoSolicitud=v;}
 public User getEvaluadoPor(){return evaluadoPor;} public void setEvaluadoPor(User v){evaluadoPor=v;}
 public LocalDateTime getFechaEvaluacion(){return fechaEvaluacion;} public void setFechaEvaluacion(LocalDateTime v){fechaEvaluacion=v;}
 public String getMotivoRechazo(){return motivoRechazo;} public void setMotivoRechazo(String v){motivoRechazo=v;}
}
