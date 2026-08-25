package com.vuelos.sanitarios.scheduler;

import com.vuelos.sanitarios.service.VueloService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Revisa periódicamente los vuelos VIGENTES cuyo horario programado ya pasó
 * y los pone en EN_EJECUCION automáticamente.
 */
@Component
public class InicioEjecucionScheduler {

    private static final Logger log = LoggerFactory.getLogger(InicioEjecucionScheduler.class);

    private final VueloService vueloService;

    public InicioEjecucionScheduler(VueloService vueloService) {
        this.vueloService = vueloService;
    }

    @Scheduled(fixedDelay = 30_000) // cada 30 segundos
    public void iniciarEjecucionesPendientes() {
        int iniciados = vueloService.iniciarEjecucionesVencidas();
        if (iniciados > 0) {
            log.info("Inicio automático de ejecución: {} vuelo(s)", iniciados);
        }
    }
}
