package com.vuelossanitarios.backend.security;
import java.util.UUID;
public record CurrentUser(UUID id, String username, boolean passwordChangeRequired) { public CurrentUser(UUID id,String username){this(id,username,false);} }
