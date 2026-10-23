package com.vuelossanitarios.backend.domain.audit;

import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.hibernate.annotations.Immutable;

/**
 * Hecho auditado. Es un registro de sólo inserción: Hibernate ignora cualquier modificación, la base lo impide
 * (V46) y no existe ningún endpoint de edición o borrado. {@code fecha_ocurrencia} es DATETIME2 en UTC.
 */
@Entity @Immutable
@Table(name = "eventos_auditoria")
public class AuditEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name="id_eventos_auditoria") private Long id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_vuelos", updatable = false) private Flight flight;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_usuario_actor", updatable = false) private User actor;
    @Column(name = "tipo_entidad", nullable = false, length = 80, updatable = false) private String entityType;
    @Column(name = "entidad_id", updatable = false) private Long entityId;
    @Column(name = "operacion", nullable = false, length = 40, updatable = false) private String operation;
    @Column(name = "valores_anteriores", columnDefinition = "NVARCHAR(MAX)", updatable = false) private String oldValues;
    @Column(name = "valores_nuevos", columnDefinition = "NVARCHAR(MAX)", updatable = false) private String newValues;
    @Column(name = "fecha_ocurrencia", nullable = false, updatable = false) private LocalDateTime occurredAt = LocalDateTime.now(ZoneOffset.UTC);
    public void setFlight(Flight v) { flight = v; } public void setActor(User v) { actor = v; }
    public void setEntityType(String v) { entityType = v; } public void setEntityId(Long v) { entityId = v; }
    public void setOperation(String v) { operation = v; } public void setOldValues(String v) { oldValues = v; }
    public void setNewValues(String v) { newValues = v; } public void setOccurredAt(LocalDateTime v) { occurredAt = v; }
    public Long getId(){return id;} public Flight getFlight(){return flight;} public User getActor(){return actor;}
    public String getEntityType(){return entityType;} public Long getEntityId(){return entityId;} public String getOperation(){return operation;}
    public LocalDateTime getOccurredAt(){return occurredAt;}
    public String getOldValues(){return oldValues;} public String getNewValues(){return newValues;}
}
