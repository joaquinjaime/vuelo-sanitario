package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.FlightRouteService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/flights/{id}/route")
public class FlightRouteController {
 private final FlightRouteService service;
 public FlightRouteController(FlightRouteService service){this.service=service;}
 @GetMapping @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE','ADMINISTRADOR')")
 public FlightRouteService.View get(@PathVariable Long id,@AuthenticationPrincipal CurrentUser u){return service.get(id,u.id());}
 @PutMapping @PreAuthorize("hasRole('COMANDANTE')")
 public FlightRouteService.View save(@PathVariable Long id,@Valid @RequestBody FlightRouteService.Input input,@AuthenticationPrincipal CurrentUser u){return service.save(id,u.id(),input);}
}
