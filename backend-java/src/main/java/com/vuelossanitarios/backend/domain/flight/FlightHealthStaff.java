package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import org.hibernate.annotations.CreationTimestamp;

/**
 * Participación de un integrante del personal sanitario en un vuelo (V66). La vigente tiene {@code removedAt == null}; retirar o sustituir la da de baja (quién, cuándo
 * y por qué) y la conserva como historial. La función (médico o enfermero) es la del catálogo del DTS.
 */
@Entity
@AttributeOverride(name="id", column=@Column(name="id_vuelos_personal_sanitario"))
@Table(name="vuelos_personal_sanitario")
public class FlightHealthStaff extends BaseEntity {
 public static final String REMOVAL="RETIRO", REPLACEMENT="REEMPLAZO";
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_vuelos") private Flight flight;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_personal_sanitario") private HealthStaff staff;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuario_asignador") private User assignedBy;
 @CreationTimestamp @Column(name="fecha_creacion",nullable=false,updatable=false) private LocalDateTime createdAt;
 @Column(name="fecha_baja") private LocalDateTime removedAt;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_baja") private User removedBy;
 @Column(name="motivo_baja",length=30) private String removalReason;
 public Flight getFlight(){return flight;} public void setFlight(Flight v){flight=v;}
 public HealthStaff getStaff(){return staff;} public void setStaff(HealthStaff v){staff=v;}
 public User getAssignedBy(){return assignedBy;} public void setAssignedBy(User v){assignedBy=v;}
 public LocalDateTime getCreatedAt(){return createdAt;}
 public LocalDateTime getRemovedAt(){return removedAt;} public User getRemovedBy(){return removedBy;} public String getRemovalReason(){return removalReason;}
 public boolean isCurrent(){return removedAt==null;}
 public void remove(LocalDateTime at,User by,String reason){removedAt=at;removedBy=by;removalReason=reason;}
}
