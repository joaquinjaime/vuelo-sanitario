package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity @Table(name="negociaciones_horario_vuelo")
public class FlightScheduleNegotiation extends BaseEntity {
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="vuelo_id",nullable=false) private Flight flight;
 @Column(name="tipo",nullable=false,length=40) private String tipo;
 @Column(name="fecha_hora_propuesta") private LocalDateTime fechaHoraPropuesta;
 @Column(name="motivo",columnDefinition="NVARCHAR(MAX)") private String motivo;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="actor_usuario_id") private User actor;
 @Column(name="fecha_ocurrencia",nullable=false) private LocalDateTime fechaOcurrencia=LocalDateTime.now();
 public Flight getFlight(){return flight;} public void setFlight(Flight v){flight=v;}
 public String getTipo(){return tipo;} public void setTipo(String v){tipo=v;}
 public LocalDateTime getFechaHoraPropuesta(){return fechaHoraPropuesta;} public void setFechaHoraPropuesta(LocalDateTime v){fechaHoraPropuesta=v;}
 public String getMotivo(){return motivo;} public void setMotivo(String v){motivo=v;}
 public User getActor(){return actor;} public void setActor(User v){actor=v;}
 public LocalDateTime getFechaOcurrencia(){return fechaOcurrencia;} public void setFechaOcurrencia(LocalDateTime v){fechaOcurrencia=v;}
}
