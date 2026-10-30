package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.FlightRouteService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
/** Ruta del vuelo: el comandante asignado la planifica y presenta; Operaciones la aprueba o la devuelve. El servicio revalida roles y vínculo con el vuelo. */
@RestController @RequestMapping("/api/flights/{id}/route")
public class FlightRouteController {
 private final FlightRouteService service;
 public FlightRouteController(FlightRouteService service){this.service=service;}
 @GetMapping @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE','ADMINISTRADOR')")
 public FlightRouteService.View get(@PathVariable Long id,@AuthenticationPrincipal CurrentUser u){return service.get(id,u.id());}
 @PutMapping @PreAuthorize("hasRole('COMANDANTE')")
 public FlightRouteService.View save(@PathVariable Long id,@Valid @RequestBody FlightRouteService.Input input,@AuthenticationPrincipal CurrentUser u){return service.save(id,u.id(),input);}
 @PostMapping("/submit") @PreAuthorize("hasRole('COMANDANTE')")
 public FlightRouteService.View submit(@PathVariable Long id,@Valid @RequestBody FlightRouteService.Submit input,@AuthenticationPrincipal CurrentUser u){return service.submit(id,u.id(),input);}
 @PostMapping("/approve") @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')")
 public FlightRouteService.View approve(@PathVariable Long id,@Valid @RequestBody FlightRouteService.Approve input,@AuthenticationPrincipal CurrentUser u){return service.approve(id,u.id(),input);}
 @PostMapping("/return") @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')")
 public FlightRouteService.View sendBack(@PathVariable Long id,@Valid @RequestBody FlightRouteService.Return input,@AuthenticationPrincipal CurrentUser u){return service.sendBack(id,u.id(),input);}
}
