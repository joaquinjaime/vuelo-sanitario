package com.vuelos.sanitarios.service;

import com.vuelos.sanitarios.dto.request.PeticionRequest;
import com.vuelos.sanitarios.dto.response.PeticionResponse;
import com.vuelos.sanitarios.enums.EstadoPeticion;
import com.vuelos.sanitarios.enums.EstadoVuelo;
import com.vuelos.sanitarios.exception.ResourceNotFoundException;
import com.vuelos.sanitarios.exception.UnauthorizedActionException;
import com.vuelos.sanitarios.model.Peticion;
import com.vuelos.sanitarios.model.Usuario;
import com.vuelos.sanitarios.model.Vuelo;
import com.vuelos.sanitarios.repository.PeticionRepository;
import com.vuelos.sanitarios.repository.UsuarioRepository;
import com.vuelos.sanitarios.repository.VueloRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
public class PeticionService {

    private final PeticionRepository peticionRepository;
    private final VueloRepository vueloRepository;
    private final UsuarioRepository usuarioRepository;
    private final HistorialService historialService;
    private final NotificacionService notificacionService;

    public PeticionService(PeticionRepository peticionRepository, VueloRepository vueloRepository, UsuarioRepository usuarioRepository, HistorialService historialService, NotificacionService notificacionService) {
        this.peticionRepository = peticionRepository;
        this.vueloRepository = vueloRepository;
        this.usuarioRepository = usuarioRepository;
        this.historialService = historialService;
        this.notificacionService = notificacionService;
    }

    @Transactional
    public PeticionResponse crear(PeticionRequest req, Integer idUsuario) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));

        Peticion peticion = Peticion.builder()
                .usuario(usuario)
                .fechaPeticion(LocalDate.now())
                .horaDespegueSolicitada(req.getHoraDespegueSolicitada())
                .estado(EstadoPeticion.PENDIENTE)
                .prioridad(req.getPrioridad() != null ? req.getPrioridad() : "NORMAL")
                .observaciones(req.getObservaciones())
                .build();

        peticion = peticionRepository.save(peticion);

        // Crear vuelo asociado en estado PLANEAMIENTO
        Vuelo vuelo = Vuelo.builder()
                .peticion(peticion)
                .fechaVuelo(req.getFechaVuelo())
                .horaDespegue(req.getHoraDespegueSolicitada())
                .estado(EstadoVuelo.PLANEAMIENTO)
                .aprobacionCargada(false)
                .build();
        vuelo = vueloRepository.save(vuelo);

        historialService.registrar(vuelo, usuario, "PETICION_CREADA", null,
                "Petición creada por DTS", null);

        notificacionService.notificarTodasEntidades(vuelo,
                "NUEVA_PETICION",
                "Nueva petición de vuelo",
                "El DTS " + usuario.getPersona().getNombre() + " creó una nueva petición de vuelo para el " + req.getFechaVuelo());

        return toResponse(peticion);
    }

    @Transactional
    public PeticionResponse aprobarPorOperaciones(Integer idPeticion, Integer idUsuario) {
        Peticion peticion = getPeticionOrThrow(idPeticion);
        Vuelo vuelo = peticion.getVuelo();
        Usuario ops = usuarioRepository.findById(idUsuario).orElseThrow();

        validarEstado(peticion, EstadoPeticion.PENDIENTE, "aprobar");

        peticion.setEstado(EstadoPeticion.ELEVADA_COMANDANTE);
        peticionRepository.save(peticion);

        historialService.registrar(vuelo, ops, "PETICION_APROBADA_OPS",
                "PENDIENTE", "ELEVADA_COMANDANTE", "Aprobada por Operaciones y elevada al Comandante");

        notificacionService.notificarTodasEntidades(vuelo,
                "PETICION_ELEVADA",
                "Petición elevada al Comandante",
                "Operaciones aprobó la petición #" + idPeticion + " y fue enviada al Comandante para su evaluación.");

        return toResponse(peticion);
    }

    @Transactional
    public PeticionResponse confirmarFactibilidadComandante(Integer idPeticion, Integer idUsuario) {
        Peticion peticion = getPeticionOrThrow(idPeticion);
        Vuelo vuelo = peticion.getVuelo();
        Usuario cmd = usuarioRepository.findById(idUsuario).orElseThrow();

        validarEstado(peticion, EstadoPeticion.ELEVADA_COMANDANTE, "confirmar factibilidad");

        peticion.setEstado(EstadoPeticion.FACTIBLE);
        peticionRepository.save(peticion);

        historialService.registrar(vuelo, cmd, "FACTIBILIDAD_CONFIRMADA",
                "ELEVADA_COMANDANTE", "FACTIBLE", "Comandante confirmó factibilidad");

        notificacionService.notificarTodasEntidades(vuelo,
                "VUELO_FACTIBLE",
                "Vuelo declarado factible",
                "El Comandante confirmó la factibilidad del vuelo #" + vuelo.getIdVuelo() + ".");

        return toResponse(peticion);
    }

    @Transactional
    public PeticionResponse confirmarDts(Integer idPeticion, Integer idUsuario) {
        Peticion peticion = getPeticionOrThrow(idPeticion);
        Vuelo vuelo = peticion.getVuelo();
        Usuario dts = usuarioRepository.findById(idUsuario).orElseThrow();

        validarEstado(peticion, EstadoPeticion.FACTIBLE, "confirmar");

        peticion.setEstado(EstadoPeticion.CONFIRMADA_DTS);
        peticionRepository.save(peticion);

        historialService.registrar(vuelo, dts, "CONFIRMADA_POR_DTS",
                "FACTIBLE", "CONFIRMADA_DTS", "DTS aceptó la oferta de vuelo");

        notificacionService.notificarTodasEntidades(vuelo,
                "PETICION_CONFIRMADA",
                "Vuelo confirmado por DTS",
                "El DTS confirmó la petición de vuelo #" + idPeticion + ". Se puede iniciar el planeamiento completo.");

        return toResponse(peticion);
    }

    @Transactional
    public PeticionResponse rechazar(Integer idPeticion, String motivo, Integer idUsuario) {
        Peticion peticion = getPeticionOrThrow(idPeticion);
        Vuelo vuelo = peticion.getVuelo();
        Usuario usuario = usuarioRepository.findById(idUsuario).orElseThrow();

        peticion.setEstado(EstadoPeticion.RECHAZADA);
        peticion.setObservaciones(motivo);
        peticionRepository.save(peticion);

        historialService.registrar(vuelo, usuario, "PETICION_RECHAZADA",
                peticion.getEstado().name(), "RECHAZADA", motivo);

        notificacionService.notificarTodasEntidades(vuelo,
                "PETICION_RECHAZADA",
                "Petición rechazada",
                "La petición #" + idPeticion + " fue rechazada. Motivo: " + motivo);

        return toResponse(peticion);
    }

    @Transactional(readOnly = true)
    public List<PeticionResponse> listar() {
        return peticionRepository.findAllWithUsuario().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public PeticionResponse getById(Integer id) {
        return toResponse(getPeticionOrThrow(id));
    }

    // ── helpers ──────────────────────────────────────────────────
    private Peticion getPeticionOrThrow(Integer id) {
        return peticionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Petición no encontrada: " + id));
    }

    private void validarEstado(Peticion p, EstadoPeticion esperado, String accion) {
        if (p.getEstado() != esperado) {
            throw new UnauthorizedActionException(
                "No se puede " + accion + " una petición en estado " + p.getEstado());
        }
    }

    private PeticionResponse toResponse(Peticion p) {
        return PeticionResponse.builder()
                .idPeticion(p.getIdPeticion())
                .fechaPeticion(p.getFechaPeticion())
                .horaDespegueSolicitada(p.getHoraDespegueSolicitada())
                .estado(p.getEstado())
                .prioridad(p.getPrioridad())
                .observaciones(p.getObservaciones())
                .solicitanteNombre(p.getUsuario().getPersona().getNombre()
                        + " " + p.getUsuario().getPersona().getApellido())
                .idVuelo(p.getVuelo() != null ? p.getVuelo().getIdVuelo() : null)
                .build();
    }
}
