package com.vuelossanitarios.backend.security;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
@Service public class JwtService {
 private final SecretKey key; private final long expiration;
 public JwtService(@Value("${app.jwt.secret}") String secret, @Value("${app.jwt.expiration-ms:3600000}") long expiration) {
  if (secret == null || secret.length() < 32) throw new IllegalStateException("JWT_SECRET debe tener al menos 32 caracteres");
  key=Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)); this.expiration=expiration;
 }
 public String create(CurrentUser user, Collection<String> roles, long credentialVersion) { return Jwts.builder().subject(user.id().toString()).claim("username",user.username()).claim("roles",roles).claim("passwordChangeRequired",user.passwordChangeRequired()).claim("credentialVersion",credentialVersion).issuedAt(Date.from(Instant.now())).expiration(Date.from(Instant.now().plusMillis(expiration))).signWith(key).compact(); }
 /** Compatibility helper for callers that do not have a persisted user. */
 public String create(CurrentUser user, Collection<String> roles) { return create(user, roles, 1L); }
 public Claims parse(String token) { return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload(); }
}
