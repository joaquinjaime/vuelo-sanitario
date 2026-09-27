package com.vuelossanitarios.backend.security;
import java.util.UUID;
public record CurrentUser(UUID id, String username) {}
