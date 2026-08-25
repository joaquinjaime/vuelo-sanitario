package com.vuelos.sanitarios.service;

import com.vuelos.sanitarios.dto.request.CancelarVueloRequest;
import com.vuelos.sanitarios.dto.request.InfoVueloRequest;
import com.vuelos.sanitarios.dto.response.VueloResponse;
import com.vuelos.sanitarios.enums.EstadoPeticion;
import com.vuelos.sanitarios.enums.EstadoVuelo;
import com.vuelos.sanitarios.enums.TipoInfoVuelo;
import com.vuelos.sanitarios.exception.ResourceNotFoundException;
import com.vuelos.sanitarios.exception.UnauthorizedActionException;
import com.vuelos.sanitarios.model.*;
import com.vuelos.sanitarios.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

@Service
public class VueloService {

    private final VueloRepository vueloRepository;
    private final PeticionRepository peticionRepository;
    private final UsuarioRepository usuarioRepository;
    private final InfoVueloRepository infoVueloRepository;
    private final HistorialService historialService;
    private final NotificacionService notificacionService;

    public VueloService(VueloRepository vueloRepository, PeticionRepository peticionRepository, UsuarioRepository usuarioRepository, InfoVueloRepository infoVueloRepository, HistorialService historialService, NotificacionService notificacionService) {
        this.vueloRepository = vueloRepository;
        this.peticionRepository = peticionRepository;
        this.usuarioRepository = usuarioRepository;
        this.infoVueloRepository = infoVueloRepository;
        this.historialService = historialService;
        this.notificacionService = notificacionService;
    }

    @Transactional(readOnly = true)
    public List<VueloResponse> listar(EstadoVuelo estado) {
        return vueloRepository.findAllFiltered(estado).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public VueloResponse getById(Integer id) {
        return toResponse(getVueloOrThrow(id));
    }

    @Transactional
    public VueloResponse cancelar(Integer idVuelo, CancelarVueloRequest req, Integer idUsuario) {
        Vuelo vuelo = getVueloOrThrow(idVuelo);
        Usuario usuario = usuarioRepository.findById(idUsuario).orElseThrow();

        if (vuelo.getEstado() == EstadoVuelo.FINALIZADO || vuelo.getEstado() == EstadoVuelo.CANCELADO) {
            throw new UnauthorizedActionException("No se puede cancelar un vuelo " + vuelo.getEstado());
        }

        String estadoAnterior = vuelo.getEstado().name();
        vuelo.setEstado(EstadoVuelo.CANCELADO);
        vuelo.setMotivoCancelacion(req.getMotivoCancelacion());
        vuelo.setHoraCancelacion(LocalTime.now());
        vueloRepository.save(vuelo);

        // Cancelar el vuelo también cierra la petición asociada
        var peticion = vuelo.getPeticion();
        if (peticion.getEstado() != EstadoPeticion.RECHAZADA
                && peticion.getEstado() != EstadoPeticion.CANCELADA) {
            String estadoAnteriorPeticion = peticion.getEstado().name();
            peticion.setEstado(EstadoPeticion.CANCELADA);
            peticionRepository.save(peticion);

            historialService.registrar(vuelo, usuario, "PETICION_CANCELADA",
                    estadoAnteriorPeticion, "CANCELADA", "Vuelo cancelado. " + req.getMotivoCancelacion());
        }

        historialService.registrar(vuelo, usuario, "VUELO_CANCELADO",
                estadoAnterior, "CANCELADO", req.getMotivoCancelacion());

        notificacionService.notificarTodasEntidades(vuelo,
                "VUELO_CANCELADO",
                "Vuelo #" + idVuelo + " cancelado",
                usuario.getPersona().getNombre() + " canceló el vuelo. Motivo: " + req.getMotivoCancelacion());

        return toResponse(vuelo);
    }

    @Transactional
    public VueloResponse marcarAprobado(Integer idVuelo, Integer idUsuario) {
        Vuelo vuelo = getVueloOrThrow(idVuelo);
        Usuario ops = usuarioRepository.findById(idUsuario).orElseThrow();

        if (vuelo.getEstado() != EstadoVuelo.PLANEAMIENTO) {
            throw new UnauthorizedActionException("Solo se puede aprobar un vuelo en PLANEAMIENTO");
        }

        vuelo.setAprobacionCargada(true);
        vuelo.setEstado(EstadoVuelo.VIGENTE);
        vueloRepository.save(vuelo);

        historialService.registrar(vuelo, ops, "VUELO_APROBADO",
                "PLANEAMIENTO", "VIGENTE", "Operaciones aprobó el formulario completo");

        notificacionService.notificarTodasEntidades(vuelo,
                "VUELO_VIGENTE",
                "Vuelo #" + idVuelo + " listo para ejecutar",
                "Operaciones aprobó toda la información. El vuelo está VIGENTE.");

        return toResponse(vuelo);
    }

    /**
     * Pone en EN_EJECUCION todos los vuelos VIGENTES cuya fecha y hora programada ya se alcanzaron.
     * Lo invoca el scheduler; la entrada en ejecución no es manual.
     */
    @Transactional
    public int iniciarEjecucionesVencidas() {
        Usuario sistema = usuarioRepository.findByUsername("system").orElse(null);
        if (sistema == null) return 0;

        LocalDateTime ahora = LocalDateTime.now();
        int iniciados = 0;

        for (Vuelo vuelo : vueloRepository.findByEstado(EstadoVuelo.VIGENTE)) {
            if (vuelo.getFechaVuelo() == null || vuelo.getHoraDespegue() == null) continue;

            LocalDateTime programado = LocalDateTime.of(vuelo.getFechaVuelo(), vuelo.getHoraDespegue());
            if (programado.isAfter(ahora)) continue;

            vuelo.setEstado(EstadoVuelo.EN_EJECUCION);
            vuelo.setHoraDespegue(LocalTime.now());
            vuelo.setFechaInicioEjecucion(LocalDateTime.now());
            vueloRepository.save(vuelo);

            historialService.registrar(vuelo, sistema, "INICIO_EJECUCION_AUTOMATICO",
                    "VIGENTE", "EN_EJECUCION",
                    "Inicio automático al alcanzar la fecha y hora programada del vuelo");

            notificacionService.notificarTodasEntidades(vuelo,
                    "CAMBIO_ESTADO",
                    "Vuelo #" + vuelo.getIdVuelo() + " → EN_EJECUCION",
                    "El vuelo entró en ejecución automáticamente al alcanzarse su horario programado.");
            iniciados++;
        }
        return iniciados;
    }

    @Transactional
    public VueloResponse cambiarEstado(Integer idVuelo, EstadoVuelo nuevoEstado, Integer idUsuario) {
        Vuelo vuelo = getVueloOrThrow(idVuelo);
        Usuario usuario = usuarioRepository.findById(idUsuario).orElseThrow();

        if (nuevoEstado == EstadoVuelo.EN_EJECUCION) {
            throw new UnauthorizedActionException(
                "La entrada en ejecución es automática: ocurre al alcanzar el vuelo su fecha y hora programada");
        }

        if (!vuelo.getEstado().puedeTransicionarA(nuevoEstado)) {
            throw new UnauthorizedActionException(
                "Transición inválida: " + vuelo.getEstado() + " → " + nuevoEstado);
        }

        String estadoAnterior = vuelo.getEstado().name();
        vuelo.setEstado(nuevoEstado);

        if (nuevoEstado == EstadoVuelo.EN_EJECUCION) {
            vuelo.setHoraDespegue(LocalTime.now());
            vuelo.setFechaInicioEjecucion(LocalDateTime.now());
        } else if (nuevoEstado == EstadoVuelo.FINALIZADO) {
            vuelo.setHoraAterrizaje(LocalTime.now());
        }

        vueloRepository.save(vuelo);

        historialService.registrar(vuelo, usuario, "CAMBIO_ESTADO",
                estadoAnterior, nuevoEstado.name(), null);

        notificacionService.notificarTodasEntidades(vuelo,
                "CAMBIO_ESTADO",
                "Vuelo #" + idVuelo + " → " + nuevoEstado,
                "El estado del vuelo cambió de " + estadoAnterior + " a " + nuevoEstado + ".");

        return toResponse(vuelo);
    }

    @Transactional
    public void guardarInfoVuelo(Integer idVuelo, InfoVueloRequest req, byte[] pdf, Integer idUsuario) {
        Vuelo vuelo = getVueloOrThrow(idVuelo);
        Usuario usuario = usuarioRepository.findById(idUsuario).orElseThrow();

        InfoVuelo info = infoVueloRepository
                .findByVueloIdVueloAndTipo(idVuelo, req.getTipo())
                .orElse(InfoVuelo.builder().vuelo(vuelo).tipo(req.getTipo()).build());

        String accionHistorial = info.getIdFormulario() == null ? "INFO_CARGADA" : "INFO_ACTUALIZADA";
        String anterior = info.getContenido();

        info.setContenido(req.getContenido());
        info.setUsuario(usuario);
        if (pdf != null) info.setPdf(pdf);
        infoVueloRepository.save(info);

        historialService.registrar(vuelo, usuario, accionHistorial + "_" + req.getTipo(),
                anterior, req.getContenido(), null);

        notificacionService.notificarTodasEntidades(vuelo,
                "INFO_ACTUALIZADA",
                "Información actualizada: " + req.getTipo(),
                usuario.getPersona().getNombre() + " actualizó " + req.getTipo() + " del vuelo #" + idVuelo);
    }

    @Transactional(readOnly = true)
    public List<com.vuelos.sanitarios.dto.response.InfoVueloResponse> getInfoVuelo(Integer idVuelo) {
        return infoVueloRepository.findByVueloIdVuelo(idVuelo).stream()
                .map(com.vuelos.sanitarios.dto.response.InfoVueloResponse::from)
                .toList();
    }

    // ── helpers ──────────────────────────────────────────────────
    private Vuelo getVueloOrThrow(Integer id) {
        return vueloRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Vuelo no encontrado: " + id));
    }

    private VueloResponse toResponse(Vuelo v) {
        var peticion = v.getPeticion();
        var solicitante = peticion.getUsuario();
        return VueloResponse.builder()
                .idVuelo(v.getIdVuelo())
                .idPeticion(peticion.getIdPeticion())
                .fechaVuelo(v.getFechaVuelo())
                .horaDespegue(v.getHoraDespegue())
                .horaAterrizaje(v.getHoraAterrizaje())
                .estado(v.getEstado())
                .estadoPeticion(peticion.getEstado())
                .aprobacionCargada(v.getAprobacionCargada())
                .fechaLimiteInforme(v.getFechaInicioEjecucion() != null
                        ? v.getFechaInicioEjecucion().plusHours(48)
                        : null)
                .motivoCancelacion(v.getMotivoCancelacion())
                .createdAt(v.getCreatedAt())
                .updatedAt(v.getUpdatedAt())
                .solicitanteNombre(solicitante.getPersona().getNombre()
                        + " " + solicitante.getPersona().getApellido())
                .solicitanteRol(solicitante.getRol().getNombreRol().name())
                .observaciones(peticion.getObservaciones())
                .build();
    }
}
