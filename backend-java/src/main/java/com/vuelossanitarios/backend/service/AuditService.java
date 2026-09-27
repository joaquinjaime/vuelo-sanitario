package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.AuditEventRepository;
import org.springframework.stereotype.Service;
import java.util.UUID;
@Service public class AuditService { private final AuditEventRepository events; public AuditService(AuditEventRepository e){events=e;} public void record(Flight f, User actor,String type,UUID id,String op,String before,String after){AuditEvent e=new AuditEvent();e.setFlight(f);e.setActor(actor);e.setEntityType(type);e.setEntityId(id);e.setOperation(op);e.setOldValues(before);e.setNewValues(after);events.save(e);} }
