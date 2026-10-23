package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.Aa2000CoordinationService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController @RequestMapping("/api/flights/{id}/airport-coordinations")
public class Aa2000CoordinationController {
    private final Aa2000CoordinationService service;
    public Aa2000CoordinationController(Aa2000CoordinationService service){this.service=service;}
    @GetMapping @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES','COMANDANTE','ADMINISTRADOR')")
    public Aa2000CoordinationService.View get(@PathVariable Long id,@AuthenticationPrincipal CurrentUser user){return service.get(id,user.id());}
    @PostMapping @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')")
    public Aa2000CoordinationService.Version create(@PathVariable Long id,@AuthenticationPrincipal CurrentUser user,@Valid @RequestBody Aa2000CoordinationService.Input input){return service.create(id,user.id(),input);}
    @PutMapping("/{group}") @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')")
    public Aa2000CoordinationService.Version update(@PathVariable Long id,@PathVariable UUID group,@AuthenticationPrincipal CurrentUser user,@Valid @RequestBody Aa2000CoordinationService.Input input){return service.update(id,group,user.id(),input);}
}
