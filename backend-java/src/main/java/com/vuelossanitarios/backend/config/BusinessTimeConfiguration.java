package com.vuelossanitarios.backend.config;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BusinessTimeConfiguration {
    @Bean
    Clock businessClock(@Value("${app.business-time-zone:America/Argentina/Tucuman}") String zone) {
        return Clock.system(ZoneId.of(zone));
    }
}
