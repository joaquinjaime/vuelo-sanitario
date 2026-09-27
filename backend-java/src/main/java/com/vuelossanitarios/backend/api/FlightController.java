package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.FlightService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequestMapping("/api/flights") public class FlightController {
 private final FlightService service; public FlightController(FlightService s){service=s;}
 @PostMapping @PreAuthorize("hasRole('DTS') and !hasRole('ADMINISTRADOR')") public FlightView create(@Valid @RequestBody CreateFlight r,@AuthenticationPrincipal CurrentUser u){return service.create(r,u.id());}
 @GetMapping @PreAuthorize("!hasRole('ADMINISTRADOR')") public List<FlightView> list(@AuthenticationPrincipal CurrentUser u){return service.list(u.id());}
 @GetMapping("/{id}") @PreAuthorize("!hasRole('ADMINISTRADOR')") public FlightView get(@PathVariable UUID id,@AuthenticationPrincipal CurrentUser u){return service.get(id,u.id());}
 @PostMapping("/{id}/evaluation") @PreAuthorize("hasRole('OPERACIONES') and !hasRole('ADMINISTRADOR')") public FlightView evaluate(@PathVariable UUID id,@Valid @RequestBody Evaluation r,@AuthenticationPrincipal CurrentUser u){return service.evaluate(id,r,u.id());}
 @PostMapping("/{id}/resources") @PreAuthorize("hasRole('OPERACIONES') and !hasRole('ADMINISTRADOR')") public FlightView assign(@PathVariable UUID id,@Valid @RequestBody AssignResources r,@AuthenticationPrincipal CurrentUser u){return service.assign(id,r,u.id());}
 @PostMapping("/{id}/plan") @PreAuthorize("hasRole('COMANDANTE') and !hasRole('ADMINISTRADOR')") public FlightView plan(@PathVariable UUID id,@Valid @RequestBody Plan r,@AuthenticationPrincipal CurrentUser u){return service.plan(id,r,u.id());}
 @PostMapping("/{id}/start") @PreAuthorize("hasRole('OPERACIONES') and !hasRole('ADMINISTRADOR')") public FlightView start(@PathVariable UUID id,@AuthenticationPrincipal CurrentUser u){return service.start(id,u.id());}
 @PostMapping("/{id}/finish") @PreAuthorize("hasRole('OPERACIONES') and !hasRole('ADMINISTRADOR')") public FlightView finish(@PathVariable UUID id,@AuthenticationPrincipal CurrentUser u){return service.finish(id,u.id());}
 @PostMapping("/{id}/cancel") @PreAuthorize("hasAnyRole('DTS','OPERACIONES','COMANDANTE') and !hasRole('ADMINISTRADOR')") public FlightView cancel(@PathVariable UUID id,@Valid @RequestBody Cancel r,@AuthenticationPrincipal CurrentUser u){return service.cancel(id,r,u.id());}
 @PostMapping("/{id}/crew") @PreAuthorize("hasRole('COMANDANTE') and !hasRole('ADMINISTRADOR')") public void crew(@PathVariable UUID id,@Valid @RequestBody Crew r,@AuthenticationPrincipal CurrentUser u){service.addCrew(id,r,u.id());}
}
