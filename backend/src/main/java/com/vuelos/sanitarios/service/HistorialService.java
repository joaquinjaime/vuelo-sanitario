package com.vuelos.sanitarios.service;

import com.vuelos.sanitarios.dto.response.HistorialResponse;
import com.vuelos.sanitarios.model.HistorialVuelo;
import com.vuelos.sanitarios.model.Usuario;
import com.vuelos.sanitarios.model.Vuelo;
import com.vuelos.sanitarios.repository.HistorialVueloRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class HistorialService {

    private final HistorialVueloRepository historialRepo;

    public HistorialService(HistorialVueloRepository historialRepo) {
        this.historialRepo = historialRepo;
    }

    @Transactional
    public void registrar(Vuelo vuelo, Usuario usuario, String accion,
                          String datosAnteriores, String datosNuevos, String comentarios) {
        HistorialVuelo h = HistorialVuelo.builder()
                .vuelo(vuelo)
                .usuarioCambio(usuario)
                .accion(accion)
                .datosAnteriores(datosAnteriores)
                .datosNuevos(datosNuevos)
                .comentarios(comentarios)
                .build();
        historialRepo.save(h);
    }

    @Transactional(readOnly = true)
    public List<HistorialResponse> getHistorial(Integer idVuelo) {
        return historialRepo
                .findByVueloIdVueloOrderByFechaHoraModificacionDesc(idVuelo)
                .stream().map(this::toResponse).toList();
    }

    private HistorialResponse toResponse(HistorialVuelo h) {
        return HistorialResponse.builder()
                .idHistorial(h.getIdHistorial())
                .accion(h.getAccion())
                .datosAnteriores(h.getDatosAnteriores())
                .datosNuevos(h.getDatosNuevos())
                .fechaHoraModificacion(h.getFechaHoraModificacion())
                .comentarios(h.getComentarios())
                .usuarioNombre(h.getUsuarioCambio().getPersona().getNombre()
                        + " " + h.getUsuarioCambio().getPersona().getApellido())
                .usuarioRol(h.getUsuarioCambio().getRol().getNombreRol().name())
                .build();
    }
}
