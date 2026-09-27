package com.vuelossanitarios.backend.security;

import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {
    @Test void signsAndReadsTheAuthenticatedSubject() {
        JwtService service = new JwtService("01234567890123456789012345678901", 60_000);
        UUID id = UUID.randomUUID();
        String token = service.create(new CurrentUser(id, "dts"), List.of("DTS"));
        assertEquals(id.toString(), service.parse(token).getSubject());
        assertEquals("dts", service.parse(token).get("username", String.class));
    }

    @Test void rejectsAShortSecret() {
        assertThrows(IllegalStateException.class, () -> new JwtService("corta", 60_000));
    }
}
