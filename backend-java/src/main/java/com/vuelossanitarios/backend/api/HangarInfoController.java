package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.HangarInfoService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/flights/{id}/hangar")
public class HangarInfoController {
    private final HangarInfoService service;
    public HangarInfoController(HangarInfoService service) { this.service = service; }
    @GetMapping
    @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES','COMANDANTE','ADMINISTRADOR')")
    public HangarInfoService.View get(@PathVariable Long id, @AuthenticationPrincipal CurrentUser user) {
        return service.get(id, user.id());
    }
    @PutMapping
    @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')")
    public HangarInfoService.View save(@PathVariable Long id, @AuthenticationPrincipal CurrentUser user, @Valid @RequestBody HangarInfoService.OperationsInput input) {
        return service.save(id, user.id(), input);
    }
    @PutMapping("/commander-observation")
    @PreAuthorize("hasRole('COMANDANTE')")
    public HangarInfoService.View observe(@PathVariable Long id, @AuthenticationPrincipal CurrentUser user, @Valid @RequestBody HangarInfoService.CommanderInput input) {
        return service.observe(id, user.id(), input);
    }
}
