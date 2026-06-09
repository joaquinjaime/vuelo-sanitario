package com.vuelos.sanitarios.service;

import com.vuelos.sanitarios.dto.request.LoginRequest;
import com.vuelos.sanitarios.dto.response.AuthResponse;
import com.vuelos.sanitarios.model.Usuario;
import com.vuelos.sanitarios.repository.UsuarioRepository;
import com.vuelos.sanitarios.security.JwtUtil;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final UsuarioRepository usuarioRepository;
    private final JwtUtil jwtUtil;

    public AuthService(AuthenticationManager authenticationManager, UsuarioRepository usuarioRepository, JwtUtil jwtUtil) {
        this.authenticationManager = authenticationManager;
        this.usuarioRepository = usuarioRepository;
        this.jwtUtil = jwtUtil;
    }

    public AuthResponse login(LoginRequest request) {
        try {
            authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
            );
        } catch (AuthenticationException e) {
            throw new RuntimeException("Credenciales inválidas");
        }

        Usuario usuario = usuarioRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        String token = jwtUtil.generateToken(usuario);
        String refreshToken = jwtUtil.generateRefreshToken(usuario);

        return AuthResponse.builder()
                .token(token)
                .refreshToken(refreshToken)
                .idUsuario(usuario.getIdUsuario())
                .username(usuario.getUsername())
                .nombreCompleto(usuario.getPersona().getNombre() + " " + usuario.getPersona().getApellido())
                .rol(usuario.getRol().getNombreRol().name())
                .nombreLicencia(usuario.getNombreLicencia())
                .build();
    }

    public AuthResponse refresh(String refreshToken) {
        String username = jwtUtil.extractUsername(refreshToken);
        Usuario usuario = usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        if (!jwtUtil.isTokenValid(refreshToken, username)) {
            throw new RuntimeException("Refresh token inválido o expirado");
        }

        String newToken = jwtUtil.generateToken(usuario);
        return AuthResponse.builder()
                .token(newToken)
                .refreshToken(refreshToken)
                .idUsuario(usuario.getIdUsuario())
                .username(usuario.getUsername())
                .nombreCompleto(usuario.getPersona().getNombre() + " " + usuario.getPersona().getApellido())
                .rol(usuario.getRol().getNombreRol().name())
                .build();
    }
}
