package com.vuelossanitarios.backend.security;

import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.UserRepository;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class JwtAuthenticationFilterTest {
    @AfterEach void clear(){ SecurityContextHolder.clearContext(); }

    @Test void aTokenFromBeforeCredentialInvalidationCannotAuthenticateAgain() throws Exception {
        JwtService jwt = new JwtService("01234567890123456789012345678901", 60_000);
        User user = enabledUser(); user.setVersionCredenciales(2L);
        UserRepository repository = mock(UserRepository.class);
        when(repository.findWithRolesByUsername("ana")).thenReturn(Optional.of(user));
        String oldToken = jwt.create(new CurrentUser(user.getId(), "ana", false), List.of("DTS"), 1L);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/auth/me");
        request.addHeader("Authorization", "Bearer " + oldToken);
        FilterChain chain = mock(FilterChain.class);
        new JwtAuthenticationFilter(jwt, repository).doFilter(request, new MockHttpServletResponse(), chain);
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verify(chain).doFilter(any(), any());
    }

    @Test void aTokenWithTheCurrentCredentialVersionAuthenticates() throws Exception {
        JwtService jwt = new JwtService("01234567890123456789012345678901", 60_000);
        User user = enabledUser(); user.setVersionCredenciales(3L);
        UserRepository repository = mock(UserRepository.class);
        when(repository.findWithRolesByUsername("ana")).thenReturn(Optional.of(user));
        String token = jwt.create(new CurrentUser(user.getId(), "ana", false), List.of("DTS"), 3L);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/auth/me");
        request.addHeader("Authorization", "Bearer " + token);
        new JwtAuthenticationFilter(jwt, repository).doFilter(request, new MockHttpServletResponse(), mock(FilterChain.class));
        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
    }

    /** El 403 por contraseña temporal no puede pasar por sendError: el reenvío a /error sale sin autenticación y el punto de entrada lo convertiría en 401. */
    @Test void aTemporaryPasswordTokenIsAuthenticatedButOnlyReachesTheMinimumEndpointsAndTheRejectionIsAFinal403() throws Exception {
        JwtService jwt = new JwtService("01234567890123456789012345678901", 60_000);
        User user = enabledUser(); user.setVersionCredenciales(3L); user.setDebeCambiarContrasena(true);
        UserRepository repository = mock(UserRepository.class);
        when(repository.findWithRolesByUsername("ana")).thenReturn(Optional.of(user));
        String token = jwt.create(new CurrentUser(user.getId(), "ana", true), List.of("DTS"), 3L);
        for (String[] allowed : new String[][] {{"GET", "/api/auth/me"}, {"POST", "/api/auth/me/password"}}) {
            MockHttpServletRequest request = new MockHttpServletRequest(allowed[0], allowed[1]); request.addHeader("Authorization", "Bearer " + token);
            FilterChain chain = mock(FilterChain.class); MockHttpServletResponse response = new MockHttpServletResponse();
            new JwtAuthenticationFilter(jwt, repository).doFilter(request, response, chain);
            verify(chain).doFilter(any(), any()); assertNotNull(SecurityContextHolder.getContext().getAuthentication(), "el contexto se establece antes de decidir"); SecurityContextHolder.clearContext();
        }
        for (String[] denied : new String[][] {{"GET", "/api/flights"}, {"POST", "/api/auth/me"}, {"GET", "/api/auth/users"}}) {
            MockHttpServletRequest request = new MockHttpServletRequest(denied[0], denied[1]); request.addHeader("Authorization", "Bearer " + token);
            FilterChain chain = mock(FilterChain.class); MockHttpServletResponse response = new MockHttpServletResponse();
            new JwtAuthenticationFilter(jwt, repository).doFilter(request, response, chain);
            assertEquals(403, response.getStatus()); assertNull(response.getErrorMessage(), "no se usa sendError (reenvío a /error)"); assertTrue(response.getContentAsString().contains("PASSWORD_CHANGE_REQUIRED"));
            verify(chain, never()).doFilter(any(), any()); SecurityContextHolder.clearContext();
        }
    }

    private User enabledUser() {
        Person person = new Person(); person.setNombre("Ana"); person.setApellido("Pérez");
        User user = new User(); user.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)); user.setPerson(person); user.setUsername("ana"); user.setActivo(true); user.setEstadoCuenta("ACTIVO");
        return user;
    }
}
