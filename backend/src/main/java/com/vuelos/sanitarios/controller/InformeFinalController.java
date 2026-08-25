package com.vuelos.sanitarios.controller;

import com.vuelos.sanitarios.enums.EstadoVuelo;
import com.vuelos.sanitarios.exception.ResourceNotFoundException;
import com.vuelos.sanitarios.exception.UnauthorizedActionException;
import com.vuelos.sanitarios.model.InformeFinal;
import com.vuelos.sanitarios.model.Usuario;
import com.vuelos.sanitarios.model.Vuelo;
import com.vuelos.sanitarios.repository.InformeFinalRepository;
import com.vuelos.sanitarios.repository.UsuarioRepository;
import com.vuelos.sanitarios.repository.VueloRepository;
import com.vuelos.sanitarios.service.HistorialService;
import com.vuelos.sanitarios.service.NotificacionService;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

@RestController
@RequestMapping("/vuelos/{idVuelo}/informe-final")
public class InformeFinalController {

    private final InformeFinalRepository informeFinalRepo;
    private final VueloRepository vueloRepo;
    private final UsuarioRepository usuarioRepo;
    private final HistorialService historialService;
    private final NotificacionService notificacionService;

    public InformeFinalController(InformeFinalRepository informeFinalRepo, VueloRepository vueloRepo, UsuarioRepository usuarioRepo, HistorialService historialService, NotificacionService notificacionService) {
        this.informeFinalRepo = informeFinalRepo;
        this.vueloRepo = vueloRepo;
        this.usuarioRepo = usuarioRepo;
        this.historialService = historialService;
        this.notificacionService = notificacionService;
    }

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    /** Plazo de 48 horas desde el inicio de ejecución para cargar el informe final. */
    private static void validarPlazoInforme(Vuelo vuelo) {
        if (vuelo.getFechaInicioEjecucion() == null) return; // vuelos previos al plazo: sin límite
        LocalDateTime limite = vuelo.getFechaInicioEjecucion().plusHours(48);
        if (LocalDateTime.now().isAfter(limite)) {
            throw new UnauthorizedActionException(
                "El plazo de 48 horas venció el " + limite.format(FMT)
                + ". No se puede cargar ni editar el informe final.");
        }
    }

    @GetMapping
    public ResponseEntity<InformeFinal> get(@PathVariable Integer idVuelo) {
        return ResponseEntity.ok(
            informeFinalRepo.findByVueloIdVuelo(idVuelo)
                .orElseThrow(() -> new ResourceNotFoundException("Informe final no encontrado"))
        );
    }

    @PostMapping
    @PreAuthorize("hasRole('COMANDANTE') or hasRole('OPERACIONES')")
    public ResponseEntity<InformeFinal> crear(
            @PathVariable Integer idVuelo,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal Usuario usuario) {

        Vuelo vuelo = vueloRepo.findById(idVuelo)
                .orElseThrow(() -> new ResourceNotFoundException("Vuelo no encontrado"));

        if (vuelo.getEstado() != EstadoVuelo.FINALIZADO) {
            throw new UnauthorizedActionException("Solo se puede cargar informe final en vuelos FINALIZADOS");
        }
        validarPlazoInforme(vuelo);
        if (informeFinalRepo.existsByVueloIdVuelo(idVuelo)) {
            throw new UnauthorizedActionException("Ya existe un informe final para este vuelo");
        }

        InformeFinal informe = InformeFinal.builder()
                .vuelo(vuelo)
                .usuarioCreador(usuario)
                .cambiosOcurridos(body.get("cambiosOcurridos"))
                .ajustesRealizados(body.get("ajustesRealizados"))
                .observacionesGenerales(body.get("observacionesGenerales"))
                .archivosAdjuntos(body.get("archivosAdjuntos"))
                .build();

        InformeFinal saved = informeFinalRepo.save(informe);
        historialService.registrar(vuelo, usuario, "INFORME_FINAL_CREADO", null, "Informe final cargado", null);
        notificacionService.notificarTodasEntidades(vuelo,
                "INFORME_FINAL",
                "Informe final del vuelo #" + idVuelo,
                usuario.getPersona().getNombre() + " cargó el informe final.");

        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PutMapping
    @PreAuthorize("hasRole('COMANDANTE') or hasRole('OPERACIONES')")
    public ResponseEntity<InformeFinal> actualizar(
            @PathVariable Integer idVuelo,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal Usuario usuario) {

        InformeFinal informe = informeFinalRepo.findByVueloIdVuelo(idVuelo)
                .orElseThrow(() -> new ResourceNotFoundException("Informe final no encontrado"));

        validarPlazoInforme(informe.getVuelo());

        informe.setCambiosOcurridos(body.getOrDefault("cambiosOcurridos", informe.getCambiosOcurridos()));
        informe.setAjustesRealizados(body.getOrDefault("ajustesRealizados", informe.getAjustesRealizados()));
        informe.setObservacionesGenerales(body.getOrDefault("observacionesGenerales", informe.getObservacionesGenerales()));

        InformeFinal saved = informeFinalRepo.save(informe);
        historialService.registrar(informe.getVuelo(), usuario, "INFORME_FINAL_EDITADO", null, "Informe actualizado", null);

        return ResponseEntity.ok(saved);
    }
}
