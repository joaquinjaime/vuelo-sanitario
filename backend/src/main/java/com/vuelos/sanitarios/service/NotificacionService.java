package com.vuelos.sanitarios.service;

import com.vuelos.sanitarios.dto.response.NotificacionResponse;
import com.vuelos.sanitarios.enums.NombreRol;
import com.vuelos.sanitarios.model.Notificacion;
import com.vuelos.sanitarios.model.Usuario;
import com.vuelos.sanitarios.model.Vuelo;
import com.vuelos.sanitarios.repository.NotificacionRepository;
import com.vuelos.sanitarios.repository.UsuarioRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class NotificacionService {

    private static final Logger log = LoggerFactory.getLogger(NotificacionService.class);

    private final NotificacionRepository notificacionRepository;
    private final UsuarioRepository usuarioRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public NotificacionService(NotificacionRepository notificacionRepository, UsuarioRepository usuarioRepository, SimpMessagingTemplate messagingTemplate) {
        this.notificacionRepository = notificacionRepository;
        this.usuarioRepository = usuarioRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional
    public void notificarTodasEntidades(Vuelo vuelo, String tipo, String titulo, String mensaje) {
        List<Usuario> todos = usuarioRepository.findAll();
        for (Usuario usuario : todos) {
            crearYEnviar(usuario, vuelo, tipo, titulo, mensaje);
        }
    }

    @Transactional
    public void notificarRol(Vuelo vuelo, NombreRol rol, String tipo, String titulo, String mensaje) {
        List<Usuario> usuarios = usuarioRepository.findByRolNombre(rol);
        for (Usuario usuario : usuarios) {
            crearYEnviar(usuario, vuelo, tipo, titulo, mensaje);
        }
    }

    private void crearYEnviar(Usuario usuario, Vuelo vuelo, String tipo, String titulo, String mensaje) {
        Notificacion notif = Notificacion.builder()
                .usuario(usuario)
                .vuelo(vuelo)
                .tipo(tipo)
                .titulo(titulo)
                .mensaje(mensaje)
                .leida(false)
                .build();
        notificacionRepository.save(notif);

        // WebSocket push
        NotificacionResponse dto = toResponse(notif);
        messagingTemplate.convertAndSendToUser(
                usuario.getUsername(),
                "/queue/notificaciones",
                dto
        );
        log.debug("Notificación enviada a {}: {}", usuario.getUsername(), titulo);
    }

    @Transactional(readOnly = true)
    public List<NotificacionResponse> getNotificaciones(Integer idUsuario) {
        return notificacionRepository
                .findByUsuarioIdUsuarioOrderByCreatedAtDesc(idUsuario)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public void marcarLeida(Integer idNotificacion, Integer idUsuario) {
        Notificacion notif = notificacionRepository.findById(idNotificacion)
                .orElseThrow(() -> new RuntimeException("Notificación no encontrada"));
        if (!notif.getUsuario().getIdUsuario().equals(idUsuario)) {
            throw new RuntimeException("No autorizado");
        }
        notif.setLeida(true);
        notificacionRepository.save(notif);
    }

    public long contarNoLeidas(Integer idUsuario) {
        return notificacionRepository.countByUsuarioIdUsuarioAndLeidaFalse(idUsuario);
    }

    private NotificacionResponse toResponse(Notificacion n) {
        return NotificacionResponse.builder()
                .idNotificacion(n.getIdNotificacion())
                .idVuelo(n.getVuelo() != null ? n.getVuelo().getIdVuelo() : null)
                .tipo(n.getTipo())
                .titulo(n.getTitulo())
                .mensaje(n.getMensaje())
                .leida(n.getLeida())
                .createdAt(n.getCreatedAt())
                .build();
    }
}
