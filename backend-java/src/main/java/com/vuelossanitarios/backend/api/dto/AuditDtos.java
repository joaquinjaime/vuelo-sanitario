package com.vuelossanitarios.backend.api.dto;
import java.time.LocalDateTime;import java.util.*;
public final class AuditDtos {private AuditDtos(){}public record AuditView(long id,UUID flightId,String entityType,UUID entityId,String operation,String actor,LocalDateTime occurredAt){}public record AuditPage(List<AuditView> items,long total){}}
