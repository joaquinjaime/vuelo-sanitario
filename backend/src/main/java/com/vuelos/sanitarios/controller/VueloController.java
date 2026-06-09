package com.vuelos.sanitarios.controller;

import com.vuelos.sanitarios.dto.request.CancelarVueloRequest;
import com.vuelos.sanitarios.dto.request.InfoVueloRequest;
import com.vuelos.sanitarios.dto.response.HistorialResponse;
import com.vuelos.sanitarios.dto.response.VueloResponse;
import com.vuelos.sanitarios.enums.EstadoVuelo;
import com.vuelos.sanitarios.model.InfoVuelo;
import com.vuelos.sanitarios.model.Usuario;
import com.vuelos.sanitarios.service.HistorialService;
import com.vuelos.sanitarios.service.VueloService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/vuelos")
public class VueloController {

    private final VueloService vueloService;
    private final HistorialService historialService;

    public VueloController(VueloService vueloService, HistorialService historialService) {
        this.vueloService = vueloService;
        this.historialService = historialService;
    }

    @GetMapping
    public ResponseEntity<List<VueloResponse>> listar(
            @RequestParam(required = false) EstadoVuelo estado) {
        return ResponseEntity.ok(vueloService.listar(estado));
    }

    @GetMapping("/{id}")
    public ResponseEntity<VueloResponse> getById(@PathVariable Integer id) {
        return ResponseEntity.ok(vueloService.getById(id));
    }

    @PatchMapping("/{id}/cancelar")
    public ResponseEntity<VueloResponse> cancelar(
            @PathVariable Integer id,
            @Valid @RequestBody CancelarVueloRequest request,
            @AuthenticationPrincipal Usuario usuario) {
        return ResponseEntity.ok(vueloService.cancelar(id, request, usuario.getIdUsuario()));
    }

    @PatchMapping("/{id}/marcar-aprobado")
    @PreAuthorize("hasRole('OPERACIONES')")
    public ResponseEntity<VueloResponse> marcarAprobado(
            @PathVariable Integer id,
            @AuthenticationPrincipal Usuario usuario) {
        return ResponseEntity.ok(vueloService.marcarAprobado(id, usuario.getIdUsuario()));
    }

    @PatchMapping("/{id}/estado")
    @PreAuthorize("hasRole('OPERACIONES')")
    public ResponseEntity<VueloResponse> cambiarEstado(
            @PathVariable Integer id,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal Usuario usuario) {
        EstadoVuelo nuevoEstado = EstadoVuelo.valueOf(body.get("estado"));
        return ResponseEntity.ok(vueloService.cambiarEstado(id, nuevoEstado, usuario.getIdUsuario()));
    }

    // ── Info del vuelo ──────────────────────────────────────────
    @GetMapping("/{id}/info")
    public ResponseEntity<List<InfoVuelo>> getInfo(@PathVariable Integer id) {
        return ResponseEntity.ok(vueloService.getInfoVuelo(id));
    }

    @PutMapping("/{id}/ruta")
    @PreAuthorize("hasRole('COMANDANTE') or hasRole('OPERACIONES')")
    public ResponseEntity<Void> cargarRuta(
            @PathVariable Integer id,
            @RequestPart("datos") InfoVueloRequest request,
            @RequestPart(value = "pdf", required = false) MultipartFile pdf,
            @AuthenticationPrincipal Usuario usuario) throws IOException {
        request.setTipo(com.vuelos.sanitarios.enums.TipoInfoVuelo.RUTA);
        vueloService.guardarInfoVuelo(id, request, pdf != null ? pdf.getBytes() : null, usuario.getIdUsuario());
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{id}/hangar")
    @PreAuthorize("hasRole('COMANDANTE') or hasRole('OPERACIONES')")
    public ResponseEntity<Void> cargarHangar(
            @PathVariable Integer id,
            @RequestPart("datos") InfoVueloRequest request,
            @RequestPart(value = "pdf", required = false) MultipartFile pdf,
            @AuthenticationPrincipal Usuario usuario) throws IOException {
        request.setTipo(com.vuelos.sanitarios.enums.TipoInfoVuelo.HANGAR);
        vueloService.guardarInfoVuelo(id, request, pdf != null ? pdf.getBytes() : null, usuario.getIdUsuario());
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{id}/aa2000")
    @PreAuthorize("hasRole('COMANDANTE') or hasRole('OPERACIONES')")
    public ResponseEntity<Void> cargarAA2000(
            @PathVariable Integer id,
            @RequestPart("datos") InfoVueloRequest request,
            @RequestPart(value = "pdf", required = false) MultipartFile pdf,
            @AuthenticationPrincipal Usuario usuario) throws IOException {
        request.setTipo(com.vuelos.sanitarios.enums.TipoInfoVuelo.AA2000);
        vueloService.guardarInfoVuelo(id, request, pdf != null ? pdf.getBytes() : null, usuario.getIdUsuario());
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{id}/meteorologia")
    @PreAuthorize("hasRole('COMANDANTE') or hasRole('OPERACIONES')")
    public ResponseEntity<Void> cargarMeteo(
            @PathVariable Integer id,
            @RequestPart("datos") InfoVueloRequest request,
            @RequestPart(value = "pdf", required = false) MultipartFile pdf,
            @AuthenticationPrincipal Usuario usuario) throws IOException {
        request.setTipo(com.vuelos.sanitarios.enums.TipoInfoVuelo.METEOROLOGIA);
        vueloService.guardarInfoVuelo(id, request, pdf != null ? pdf.getBytes() : null, usuario.getIdUsuario());
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{id}/plan-de-vuelo")
    @PreAuthorize("hasRole('COMANDANTE') or hasRole('OPERACIONES')")
    public ResponseEntity<Void> cargarPlan(
            @PathVariable Integer id,
            @RequestPart("datos") InfoVueloRequest request,
            @RequestPart(value = "pdf", required = false) MultipartFile pdf,
            @AuthenticationPrincipal Usuario usuario) throws IOException {
        request.setTipo(com.vuelos.sanitarios.enums.TipoInfoVuelo.PLAN_VUELO);
        vueloService.guardarInfoVuelo(id, request, pdf != null ? pdf.getBytes() : null, usuario.getIdUsuario());
        return ResponseEntity.ok().build();
    }

    // ── Historial ───────────────────────────────────────────────
    @GetMapping("/{id}/historial")
    public ResponseEntity<List<HistorialResponse>> getHistorial(@PathVariable Integer id) {
        return ResponseEntity.ok(historialService.getHistorial(id));
    }
}
