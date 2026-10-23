package com.vuelossanitarios.backend.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Contratos de consulta de auditoría. Nunca se devuelve la entidad JPA: cada campo pasó por la política de visibilidad del rol. */
public final class AuditDtos {
 private AuditDtos(){}
 /** Responsable del hecho. {@code active=false} indica que el usuario fue desactivado después; el evento igualmente lo identifica. */
 public record AuditActor(Long id, String username, String name, boolean active, String label){}
 public record AuditEventView(long id, Instant occurredAt, AuditActor actor, Long flightId, String flightCode, String entityType, String entityTypeLabel,
                              Long entityId, String operation, String operationLabel, String summary, boolean hasDetail){}
 public record AuditPage(List<AuditEventView> items, long total, int page, int size, int totalPages, String order, String timeZone){}
 /** Cambio de un campo; los valores ya están formateados como texto y los ocultos se informan con {@code masked}. */
 public record AuditChange(String field, String label, String before, String after, boolean changed, boolean masked){}
 public record AuditEventDetail(AuditEventView event, List<AuditChange> changes, boolean hasPreviousValues, boolean hasNewValues, List<String> notes,
                                Map<String,Object> previousValues, Map<String,Object> newValues, String timeZone){}
 public record AuditOption(String code, String label){}
 public record AuditActorOption(long id, String username, String name, boolean active){}
 public record AuditActorPage(List<AuditActorOption> items,int page,int size,boolean hasNext){}
 public record AuditFilterOptions(List<AuditOption> entityTypes, List<AuditOption> operations, List<AuditActorOption> actors, String timeZone, int maxPageSize){}
}
