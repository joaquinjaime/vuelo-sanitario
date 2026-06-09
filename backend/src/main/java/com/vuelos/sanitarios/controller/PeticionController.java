package com.vuelos.sanitarios.controller;

import com.vuelos.sanitarios.dto.request.PeticionRequest;
import com.vuelos.sanitarios.dto.response.PeticionResponse;
import com.vuelos.sanitarios.model.Usuario;
import com.vuelos.sanitarios.service.PeticionService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/peticiones")
public class PeticionController {

    private final PeticionService peticionService;

    public PeticionController(PeticionService peticionService) {
        this.peticionService = peticionService;
    }

    @GetMapping
    public ResponseEntity<List<PeticionResponse>> listar() {
        return ResponseEntity.ok(peticionService.listar());
    }

    @GetMapping("/{id}")
    public ResponseEntity<PeticionResponse> getById(@PathVariable Integer id) {
        return ResponseEntity.ok(peticionService.getById(id));
    }

    @PostMapping
    @PreAuthorize("hasRole('DTS')")
    public ResponseEntity<PeticionResponse> crear(
            @Valid @RequestBody PeticionRequest request,
            @AuthenticationPrincipal Usuario usuario) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(peticionService.crear(request, usuario.getIdUsuario()));
    }

    @PatchMapping("/{id}/aprobar")
    @PreAuthorize("hasRole('OPERACIONES')")
    public ResponseEntity<PeticionResponse> aprobar(
            @PathVariable Integer id,
            @AuthenticationPrincipal Usuario usuario) {
        return ResponseEntity.ok(peticionService.aprobarPorOperaciones(id, usuario.getIdUsuario()));
    }

    @PatchMapping("/{id}/confirmar-factibilidad")
    @PreAuthorize("hasRole('COMANDANTE')")
    public ResponseEntity<PeticionResponse> confirmarFactibilidad(
            @PathVariable Integer id,
            @AuthenticationPrincipal Usuario usuario) {
        return ResponseEntity.ok(peticionService.confirmarFactibilidadComandante(id, usuario.getIdUsuario()));
    }

    @PatchMapping("/{id}/confirmar-dts")
    @PreAuthorize("hasRole('DTS')")
    public ResponseEntity<PeticionResponse> confirmarDts(
            @PathVariable Integer id,
            @AuthenticationPrincipal Usuario usuario) {
        return ResponseEntity.ok(peticionService.confirmarDts(id, usuario.getIdUsuario()));
    }

    @PatchMapping("/{id}/rechazar")
    @PreAuthorize("hasRole('OPERACIONES') or hasRole('COMANDANTE')")
    public ResponseEntity<PeticionResponse> rechazar(
            @PathVariable Integer id,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal Usuario usuario) {
        return ResponseEntity.ok(peticionService.rechazar(id, body.get("motivo"), usuario.getIdUsuario()));
    }
}
