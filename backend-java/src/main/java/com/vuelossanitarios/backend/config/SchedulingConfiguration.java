package com.vuelossanitarios.backend.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Habilita el barrido de plazos de informes finales; se desactiva con app.final-report.sweep-enabled=false. */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "app.final-report.sweep-enabled", havingValue = "true", matchIfMissing = true)
public class SchedulingConfiguration {
}
