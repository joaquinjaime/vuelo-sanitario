package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.FlightLogService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/flights/{id}/log")
public class FlightLogController {
 private final FlightLogService service;
 public FlightLogController(FlightLogService s){service=s;}
 @GetMapping @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES','COMANDANTE','ADMINISTRADOR')") public FlightLogService.History list(@PathVariable Long id,@RequestParam(defaultValue="0") int page,@AuthenticationPrincipal CurrentUser u){return service.history(id,u.id(),page);}
 @PostMapping @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')") public FlightLogService.Entry create(@PathVariable Long id,@Valid @RequestBody FlightLogService.Input input,@AuthenticationPrincipal CurrentUser u){return service.create(id,u.id(),input);}
}
