package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Validates request times expressed as local civil time in the configured business zone. */
@Service
public class FlightUrgencyPolicy {
    private final Clock clock;
    private final ZoneId zone;

    @Autowired
    public FlightUrgencyPolicy(Clock clock,
            @Value("${app.business-time-zone:America/Argentina/Tucuman}") String zone) {
        this(clock, ZoneId.of(zone));
    }

    FlightUrgencyPolicy(Clock clock, ZoneId zone) { this.clock = clock; this.zone = zone; }

    public void validate(LocalDateTime requested, boolean urgent, String justification, LocalDateTime deadline) {
        if (requested == null) fail("La fecha y hora solicitada son obligatorias");
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        if (requested.isBefore(now)) fail("La fecha y hora solicitada no puede estar en el pasado");
        if (!urgent && requested.toLocalDate().isBefore(today.plusDays(2))) {
            fail("Los vuelos normales sólo pueden solicitarse para pasado mañana o una fecha posterior. Los vuelos para hoy o mañana deben solicitarse como vuelos de extrema urgencia.");
        }
        if (!urgent) {
            if (hasText(justification) || deadline != null) fail("La justificación y el horario límite sólo corresponden a una solicitud de extrema urgencia");
            return;
        }
        if (!hasText(justification)) fail("La extrema urgencia requiere una justificación");
        if (deadline == null) fail("La extrema urgencia requiere una fecha y hora límite de traslado");
        if (deadline.isBefore(now)) fail("El horario límite no puede estar en el pasado");
        if (deadline.isBefore(requested)) fail("El horario límite debe ser igual o posterior a la fecha y hora solicitada");
    }

    private boolean hasText(String value) { return value != null && !value.trim().isEmpty(); }
    private void fail(String message) { throw new ApiException(HttpStatus.BAD_REQUEST, message); }
}
