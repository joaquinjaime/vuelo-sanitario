package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.api.dto.AuthDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
@RestController @RequestMapping("/api/auth") public class AuthController {
 private final AuthService service; public AuthController(AuthService s){service=s;}
 @PostMapping("/login") public TokenResponse login(@Valid @RequestBody LoginRequest request){return service.login(request);}
 @GetMapping("/me") public Map<String,Object> me(@AuthenticationPrincipal CurrentUser user){return Map.of("id",user.id(),"username",user.username());}
 @GetMapping("/users") @PreAuthorize("hasAnyRole('ADMINISTRADOR','OPERACIONES')") public java.util.List<Map<String,Object>> users(){return service.listUsers();}
 @PostMapping("/users") @PreAuthorize("hasRole('ADMINISTRADOR')") public Map<String,Object> create(@Valid @RequestBody CreateUserRequest request){var u=service.createUser(request);return Map.of("id",u.getId(),"username",u.getUsername());}
}
