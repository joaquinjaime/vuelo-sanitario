package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.AuditEventRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registro de eventos de auditoría. Debe invocarse dentro de la transacción de la operación auditada (MANDATORY): el
 * evento se confirma o se revierte junto con ella y nunca queda un cambio sin su evento ni un evento de un cambio revertido.
 * La fecha se toma del reloj de negocio (ajustable en E2E) y se guarda en UTC.
 */
@Service public class AuditService {
 private final AuditEventRepository events; private final Clock clock;
 public AuditService(AuditEventRepository e,Clock clock){events=e;this.clock=clock;}
    /** Los eventos se guardan en UTC; las respuestas históricas existentes se expresan en hora civil de la zona de negocio. */
 public static LocalDateTime toLocal(LocalDateTime utc,ZoneId zone){return utc==null?null:LocalDateTime.ofInstant(utc.toInstant(ZoneOffset.UTC),zone);}
 @Transactional(propagation=Propagation.MANDATORY)
 public AuditEvent record(Flight f, User actor,String type,Long id,String op,String before,String after){
  AuditEvent e=new AuditEvent();e.setFlight(f);e.setActor(actor);e.setEntityType(type);e.setEntityId(id);e.setOperation(op);e.setOldValues(before);e.setNewValues(after);
  e.setOccurredAt(LocalDateTime.ofInstant(clock.instant(),ZoneOffset.UTC));return events.save(e);
 }
}
