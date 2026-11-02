package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.service.ReadinessService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/** Lista de comprobación previa a operar (sólo lectura, sin secretos). */
@RestController @RequestMapping("/api/admin") @PreAuthorize("hasRole('ADMINISTRADOR')")
public class ReadinessController {
 private final ReadinessService readiness;
 public ReadinessController(ReadinessService readiness){this.readiness=readiness;}
 @GetMapping("/readiness") public ReadinessService.Readiness readiness(){return readiness.check();}
}
