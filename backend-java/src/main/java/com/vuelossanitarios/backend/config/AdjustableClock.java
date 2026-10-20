package com.vuelossanitarios.backend.config;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Reloj del servidor con un desplazamiento controlable. Sólo se instancia cuando se habilita
 * explícitamente {@code app.e2e-controls.enabled} (entornos de prueba aislados); en producción el reloj es el del sistema.
 */
public class AdjustableClock extends Clock {
    private final Clock base;
    private final AtomicReference<Duration> offset;

    public AdjustableClock(Clock base) { this(base, new AtomicReference<>(Duration.ZERO)); }
    private AdjustableClock(Clock base, AtomicReference<Duration> offset) { this.base = base; this.offset = offset; }

    @Override public ZoneId getZone() { return base.getZone(); }
    @Override public Clock withZone(ZoneId zone) { return new AdjustableClock(base.withZone(zone), offset); }
    @Override public Instant instant() { return base.instant().plus(offset.get()); }

    public Duration getOffset() { return offset.get(); }
    public void setOffset(Duration value) { offset.set(value); }
    /** Fija el desplazamiento para que el reloj marque {@code target} en este momento. */
    public void setNow(Instant target) { offset.set(Duration.between(base.instant(), target)); }
}
