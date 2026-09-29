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
import java.util.UUID;

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

    private User enabledUser() {
        Person person = new Person(); person.setNombre("Ana"); person.setApellido("Pérez");
        User user = new User(); user.setId(UUID.randomUUID()); user.setPerson(person); user.setUsername("ana"); user.setActivo(true); user.setEstadoCuenta("ACTIVO");
        return user;
    }
}
