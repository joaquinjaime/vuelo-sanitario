package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.config.AdjustableClock;
import com.vuelossanitarios.backend.service.FinalReportDeadlineService;
import jakarta.annotation.PostConstruct;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * Controles SÓLO para entornos de prueba aislados: exigen el perfil Spring "e2e" Y app.e2e-controls.enabled=true (desactivado
 * por defecto); con el flag sin el perfil la aplicación se niega a arrancar (ver BusinessTimeConfiguration):
 * adelantar el reloj del servidor y ejecutar el barrido de avisos a demanda, para verificar los plazos de 48 horas
 * sin esperas reales y sin modificar columnas SQL. No existe cuando la propiedad no está activa.
 */
@RestController @RequestMapping("/api/e2e") @Profile("e2e") @ConditionalOnProperty(name = "app.e2e-controls.enabled", havingValue = "true")
public class E2eControlController {
    private static final Logger log = LoggerFactory.getLogger(E2eControlController.class);
    private final AdjustableClock clock; private final FinalReportDeadlineService deadlines;
    public E2eControlController(Clock clock, FinalReportDeadlineService deadlines) { this.clock = (AdjustableClock) clock; this.deadlines = deadlines; }
    @PostConstruct void warn() { log.warn("CONTROLES E2E ACTIVOS: el reloj del servidor es ajustable. No usar fuera de entornos de prueba aislados."); }

    @GetMapping("/clock") @PreAuthorize("hasRole('ADMINISTRADOR')") public Map<String, Object> get() { return view(); }
    /** Cuerpo: {"instant":"2026-10-22T02:30:00Z"} fija la hora; {"advanceSeconds":N} adelanta; {"reset":true} restablece. */
    @PutMapping("/clock") @PreAuthorize("hasRole('ADMINISTRADOR')") public Map<String, Object> set(@RequestBody Map<String, Object> body) {
        if (Boolean.TRUE.equals(body.get("reset"))) clock.setOffset(Duration.ZERO);
        else if (body.get("instant") != null) clock.setNow(Instant.parse(body.get("instant").toString()));
        else if (body.get("advanceSeconds") != null) clock.setOffset(clock.getOffset().plusSeconds(((Number) body.get("advanceSeconds")).longValue()));
        else if (body.get("offsetSeconds") != null) clock.setOffset(Duration.ofSeconds(((Number) body.get("offsetSeconds")).longValue()));
        return view();
    }
    @PostMapping("/sweep") @PreAuthorize("hasRole('ADMINISTRADOR')") public Map<String, Object> sweep() { Map<String, Object> m = new LinkedHashMap<>(); m.put("notificacionesNuevas", deadlines.sweep()); return m; }
    private Map<String, Object> view() { Map<String, Object> m = new LinkedHashMap<>(); m.put("now", clock.instant().toString()); m.put("offsetSeconds", clock.getOffset().getSeconds()); m.put("zone", clock.getZone().getId()); return m; }
}
