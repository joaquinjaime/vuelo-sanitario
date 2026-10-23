package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.api.dto.AuditDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.AuditQueryService;
import com.vuelossanitarios.backend.service.AuditQueryService.Search;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * Consulta de auditoría. Sólo lectura: no existen operaciones para crear, editar ni borrar eventos desde la API.
 * Las fechas {@code from}/{@code to} son días civiles de la zona de negocio (ambos inclusive).
 */
@RestController @RequestMapping("/api/audit")
public class AuditController {
 private static final String VIEWERS="hasAnyRole('ADMINISTRADOR','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE','DTS')";
 private final AuditQueryService service;
 public AuditController(AuditQueryService s){service=s;}

 @GetMapping @PreAuthorize("hasRole('ADMINISTRADOR')")
 public AuditPage all(@RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,@RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
                      @RequestParam(required=false) Long actorId,@RequestParam(required=false) String entityType,@RequestParam(required=false) String operation,
                      @RequestParam(required=false) Long flightId,@RequestParam(required=false) Long entityId,@RequestParam(required=false) String order,
                      @RequestParam(required=false) Integer page,@RequestParam(required=false) Integer size,@AuthenticationPrincipal CurrentUser user){
  return service.global(user.id(),new Search(from,to,actorId,entityType,operation,flightId,entityId,order,page,size));
 }

 @GetMapping("/filters") @PreAuthorize("hasRole('ADMINISTRADOR')")
 public AuditFilterOptions filters(@AuthenticationPrincipal CurrentUser user){return service.filterOptions(user.id());}

 @GetMapping("/actors") @PreAuthorize("hasRole('ADMINISTRADOR')")
 public AuditActorPage actors(@RequestParam(required=false) String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="30") int size,@AuthenticationPrincipal CurrentUser user){return service.actorOptions(user.id(),q,page,size);}

 @GetMapping("/flights/{id}") @PreAuthorize(VIEWERS)
 public AuditPage flight(@PathVariable Long id,@RequestParam(required=false) String entityType,@RequestParam(required=false) String operation,@RequestParam(required=false) String order,
                         @RequestParam(required=false) Integer page,@RequestParam(required=false) Integer size,@AuthenticationPrincipal CurrentUser user){
  return service.byFlight(id,user.id(),new Search(null,null,null,entityType,operation,id,null,order,page,size));
 }

 @GetMapping("/events/{id}") @PreAuthorize(VIEWERS)
 public AuditEventDetail event(@PathVariable Long id,@AuthenticationPrincipal CurrentUser user){return service.detail(id,user.id());}
}
