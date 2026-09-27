package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.vuelossanitarios.backend.api.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class FlightUrgencyPolicyTest {
    private static final ZoneId TUCUMAN = ZoneId.of("America/Argentina/Tucuman");
    private FlightUrgencyPolicy policyAt(String instant) {
        return new FlightUrgencyPolicy(Clock.fixed(Instant.parse(instant), TUCUMAN), TUCUMAN);
    }

    @Test void normal_is_allowed_on_the_second_calendar_day() {
        assertDoesNotThrow(() -> policyAt("2026-09-21T11:00:00Z")
            .validate(LocalDateTime.of(2026, 9, 23, 8, 0), false, null, null));
    }

    @Test void normal_is_rejected_for_today_and_tomorrow() {
        FlightUrgencyPolicy policy = policyAt("2026-09-21T11:00:00Z");
        assertThrows(ApiException.class, () -> policy.validate(LocalDateTime.of(2026, 9, 21, 9, 0), false, null, null));
        assertThrows(ApiException.class, () -> policy.validate(LocalDateTime.of(2026, 9, 22, 23, 0), false, null, null));
    }

    @Test void urgent_request_requires_complete_consistent_data() {
        FlightUrgencyPolicy policy = policyAt("2026-09-21T11:00:00Z");
        LocalDateTime requested = LocalDateTime.of(2026, 9, 21, 10, 0);
        assertDoesNotThrow(() -> policy.validate(requested, true, "Derivación crítica", LocalDateTime.of(2026, 9, 21, 11, 0)));
        assertThrows(ApiException.class, () -> policy.validate(requested, true, "   ", LocalDateTime.of(2026, 9, 21, 11, 0)));
        assertThrows(ApiException.class, () -> policy.validate(requested, true, "Motivo", LocalDateTime.of(2026, 9, 21, 9, 0)));
    }

    @Test void calendar_rule_is_stable_near_midnight_in_tucuman() {
        FlightUrgencyPolicy policy = policyAt("2026-09-22T02:59:00Z"); // 23:59 del 21 en Tucumán
        assertThrows(ApiException.class, () -> policy.validate(LocalDateTime.of(2026, 9, 22, 23, 30), false, null, null));
        assertDoesNotThrow(() -> policy.validate(LocalDateTime.of(2026, 9, 23, 0, 1), false, null, null));
    }
}
