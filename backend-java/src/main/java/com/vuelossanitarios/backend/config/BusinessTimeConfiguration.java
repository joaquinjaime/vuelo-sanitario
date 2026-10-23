package com.vuelossanitarios.backend.config;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

@Configuration
public class BusinessTimeConfiguration {
    @Bean
    Clock businessClock(@Value("${app.business-time-zone:America/Argentina/Tucuman}") String zone,
                        @Value("${app.e2e-controls.enabled:false}") boolean adjustable,
                        Environment environment) {
        Clock system = Clock.system(ZoneId.of(zone));
        if (!adjustable) return system;
        // Doble candado: el reloj ajustable exige además el perfil "e2e"; un flag suelto no debe poder activarlo.
        if (!environment.acceptsProfiles(Profiles.of("e2e")))
            throw new IllegalStateException("app.e2e-controls.enabled sólo es válido con el perfil Spring 'e2e'; el reloj ajustable no se activa en otros entornos");
        return new AdjustableClock(system);
    }
}
