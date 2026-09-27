package com.vuelossanitarios.backend.domain.audit;

import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "eventos_auditoria")
public class AuditEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
@ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "vuelo_id") private Flight flight;
@ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "actor_usuario_id") private User actor;
@Column(name = "tipo_entidad", nullable = false, length = 80) private String entityType;
@Column(name = "entidad_id") private UUID entityId;
@Column(name = "operacion", nullable = false, length = 40) private String operation;
@Column(name = "valores_anteriores", columnDefinition = "NVARCHAR(MAX)") private String oldValues;
@Column(name = "valores_nuevos", columnDefinition = "NVARCHAR(MAX)") private String newValues;
@Column(name = "fecha_ocurrencia", nullable = false) private LocalDateTime occurredAt = LocalDateTime.now();
    public void setFlight(Flight v) { flight = v; } public void setActor(User v) { actor = v; }
    public void setEntityType(String v) { entityType = v; } public void setEntityId(UUID v) { entityId = v; }
    public void setOperation(String v) { operation = v; } public void setOldValues(String v) { oldValues = v; }
    public void setNewValues(String v) { newValues = v; }
    public Long getId(){return id;} public Flight getFlight(){return flight;} public User getActor(){return actor;}
    public String getEntityType(){return entityType;} public UUID getEntityId(){return entityId;} public String getOperation(){return operation;}
    public LocalDateTime getOccurredAt(){return occurredAt;}
}
