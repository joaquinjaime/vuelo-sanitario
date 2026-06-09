package com.vuelos.sanitarios.controller;

import com.vuelos.sanitarios.dto.response.NotificacionResponse;
import com.vuelos.sanitarios.model.Usuario;
import com.vuelos.sanitarios.service.NotificacionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/notificaciones")
public class NotificacionController {

    private final NotificacionService notificacionService;

    public NotificacionController(NotificacionService notificacionService) {
        this.notificacionService = notificacionService;
    }

    @GetMapping
    public ResponseEntity<List<NotificacionResponse>> listar(@AuthenticationPrincipal Usuario usuario) {
        return ResponseEntity.ok(notificacionService.getNotificaciones(usuario.getIdUsuario()));
    }

    @GetMapping("/no-leidas/count")
    public ResponseEntity<Map<String, Long>> contarNoLeidas(@AuthenticationPrincipal Usuario usuario) {
        long count = notificacionService.contarNoLeidas(usuario.getIdUsuario());
        return ResponseEntity.ok(Map.of("count", count));
    }

    @PatchMapping("/{id}/leer")
    public ResponseEntity<Void> marcarLeida(
            @PathVariable Integer id,
            @AuthenticationPrincipal Usuario usuario) {
        notificacionService.marcarLeida(id, usuario.getIdUsuario());
        return ResponseEntity.ok().build();
    }
}
