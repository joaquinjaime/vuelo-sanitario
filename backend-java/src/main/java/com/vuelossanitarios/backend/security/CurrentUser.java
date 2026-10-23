package com.vuelossanitarios.backend.security;
public record CurrentUser(Long id, String username, boolean passwordChangeRequired) { public CurrentUser(Long id,String username){this(id,username,false);} }
