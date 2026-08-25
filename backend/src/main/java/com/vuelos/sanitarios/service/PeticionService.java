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
import java.time.LocalTime;
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

        validarAntelacionMaxima(req.getFechaVuelo());

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

    /**
     * OPS marca la fecha propuesta por DTS como no factible y propone una nueva.
     * La petición queda en REVISADA_OPS hasta que DTS responda.
     */
    @Transactional
    public PeticionResponse proponerNuevaFecha(Integer idPeticion, LocalDate nuevaFecha, String motivo, Integer idUsuario) {
        Peticion peticion = getPeticionOrThrow(idPeticion);
        Vuelo vuelo = peticion.getVuelo();
        Usuario ops = usuarioRepository.findById(idUsuario).orElseThrow();

        validarEstado(peticion, EstadoPeticion.PENDIENTE, "proponer nueva fecha");

        if (nuevaFecha == null) {
            throw new UnauthorizedActionException("La nueva fecha es obligatoria");
        }
        validarAntelacionMaxima(nuevaFecha);

        String fechaAnterior = vuelo.getFechaVuelo() != null ? vuelo.getFechaVuelo().toString() : null;
        vuelo.setFechaVuelo(nuevaFecha);
        vueloRepository.save(vuelo);

        peticion.setEstado(EstadoPeticion.REVISADA_OPS);
        peticionRepository.save(peticion);

        historialService.registrar(vuelo, ops, "FECHA_NO_FACTIBLE",
                fechaAnterior, nuevaFecha.toString(),
                "OPS consideró no factible la fecha y propuso: " + nuevaFecha + ". Motivo: " + motivo);

        notificacionService.notificarTodasEntidades(vuelo,
                "FECHA_PROPUESTA",
                "Propuesta de nueva fecha de vuelo",
                "Operaciones no considera factible el " + fechaAnterior
                        + " y propone el " + nuevaFecha + ". El DTS debe aceptar o rechazar.");

        return toResponse(peticion);
    }

    /**
     * DTS acepta la fecha propuesta por OPS. La petición vuelve a PENDIENTE,
     * habilitando a OPS para elevar al Comandante.
     */
    @Transactional
    public PeticionResponse aceptarFechaPropuesta(Integer idPeticion, Integer idUsuario) {
        Peticion peticion = getPeticionOrThrow(idPeticion);
        Vuelo vuelo = peticion.getVuelo();
        Usuario dts = usuarioRepository.findById(idUsuario).orElseThrow();

        validarEstado(peticion, EstadoPeticion.REVISADA_OPS, "aceptar la fecha propuesta");

        peticion.setEstado(EstadoPeticion.PENDIENTE);
        peticionRepository.save(peticion);

        historialService.registrar(vuelo, dts, "FECHA_ACEPTADA_DTS",
                "REVISADA_OPS", "PENDIENTE",
                "DTS aceptó la nueva fecha: " + vuelo.getFechaVuelo());

        notificacionService.notificarTodasEntidades(vuelo,
                "FECHA_ACEPTADA",
                "Nueva fecha aceptada por DTS",
                "El DTS aceptó la fecha " + vuelo.getFechaVuelo()
                        + ". Operaciones puede elevar la petición al Comandante.");

        return toResponse(peticion);
    }

    @Transactional
    public PeticionResponse rechazar(Integer idPeticion, String motivo, Integer idUsuario) {
        Peticion peticion = getPeticionOrThrow(idPeticion);
        Vuelo vuelo = peticion.getVuelo();
        Usuario usuario = usuarioRepository.findById(idUsuario).orElseThrow();

        EstadoPeticion estadoAnterior = peticion.getEstado();
        if (estadoAnterior == EstadoPeticion.RECHAZADA || estadoAnterior == EstadoPeticion.CANCELADA) {
            throw new UnauthorizedActionException("No se puede rechazar una petición " + estadoAnterior);
        }

        peticion.setEstado(EstadoPeticion.RECHAZADA);
        peticion.setObservaciones(motivo);
        peticionRepository.save(peticion);

        // Rechazar la petición mata el vuelo asociado
        String estadoAnteriorVuelo = vuelo.getEstado().name();
        if (vuelo.getEstado() != EstadoVuelo.FINALIZADO && vuelo.getEstado() != EstadoVuelo.CANCELADO) {
            vuelo.setEstado(EstadoVuelo.CANCELADO);
            vuelo.setMotivoCancelacion(motivo);
            vuelo.setHoraCancelacion(LocalTime.now());
            vueloRepository.save(vuelo);

            historialService.registrar(vuelo, usuario, "VUELO_CANCELADO",
                    estadoAnteriorVuelo, "CANCELADO", "Petición rechazada. " + motivo);
        }

        historialService.registrar(vuelo, usuario, "PETICION_RECHAZADA",
                estadoAnterior.name(), "RECHAZADA", motivo);

        notificacionService.notificarTodasEntidades(vuelo,
                "PETICION_RECHAZADA",
                "Petición rechazada",
                "La petición #" + idPeticion + " fue rechazada y el vuelo #" + vuelo.getIdVuelo()
                        + " cancelado. Motivo: " + motivo);

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
    private static final int MAX_MESES_ANTELACION = 1;

    private void validarAntelacionMaxima(LocalDate fechaVuelo) {
        LocalDate limite = LocalDate.now().plusMonths(MAX_MESES_ANTELACION);
        if (fechaVuelo.isAfter(limite)) {
            throw new UnauthorizedActionException(
                "El vuelo no puede solicitarse con más de " + MAX_MESES_ANTELACION
                + " mes de antelación (máximo: " + limite + ")");
        }
    }

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
