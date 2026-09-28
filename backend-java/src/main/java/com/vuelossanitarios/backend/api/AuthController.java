package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.api.dto.AuthDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequestMapping("/api/auth") public class AuthController {
 private final AuthService service; public AuthController(AuthService s){service=s;}
 @PostMapping("/login") public TokenResponse login(@Valid @RequestBody LoginRequest request){return service.login(request);}
 @PostMapping("/activar-cuenta") @ResponseStatus(HttpStatus.NO_CONTENT) public void activate(@Valid @RequestBody ActivateAccountRequest r){service.activate(r);}
 @GetMapping("/me") public UserView me(@AuthenticationPrincipal CurrentUser u){return service.myAccount(u.id());}
 @PostMapping("/me/password") public void password(@AuthenticationPrincipal CurrentUser u,@Valid @RequestBody ChangePasswordRequest r){service.changePassword(u.id(),r);}
 @PostMapping("/me/correos") public ContactView email(@AuthenticationPrincipal CurrentUser u,@Valid @RequestBody ContactRequest r){return service.addEmail(u.id(),r);}
 @DeleteMapping("/me/correos/{id}") public void deleteEmail(@AuthenticationPrincipal CurrentUser u,@PathVariable UUID id){service.deleteEmail(u.id(),id);}
 @PostMapping("/me/correos/{id}/principal") public void mainEmail(@AuthenticationPrincipal CurrentUser u,@PathVariable UUID id){service.makePrimaryEmail(u.id(),id);}
 @PostMapping("/me/telefonos") public ContactView phone(@AuthenticationPrincipal CurrentUser u,@Valid @RequestBody PhoneRequest r){return service.addPhone(u.id(),r);}
 @DeleteMapping("/me/telefonos/{id}") public void deletePhone(@AuthenticationPrincipal CurrentUser u,@PathVariable UUID id){service.deletePhone(u.id(),id);}
 @PostMapping("/me/telefonos/{id}/principal") public void mainPhone(@AuthenticationPrincipal CurrentUser u,@PathVariable UUID id){service.makePrimaryPhone(u.id(),id);}
 @GetMapping("/users") @PreAuthorize("hasRole('ADMINISTRADOR')") public List<UserView> users(){return service.listUsers();}
 @PostMapping("/users") @PreAuthorize("hasRole('ADMINISTRADOR')") public ActivationCodeResponse create(@AuthenticationPrincipal CurrentUser u,@Valid @RequestBody CreatePendingUserRequest r){return service.createPending(r,u.id());}
 @PutMapping("/users/{id}") @PreAuthorize("hasRole('ADMINISTRADOR')") public UserView update(@PathVariable UUID id,@Valid @RequestBody UpdateUserRequest r){return service.updateUser(id,r);}
 @PostMapping("/users/{id}/activation-code") @PreAuthorize("hasRole('ADMINISTRADOR')") public ActivationCodeResponse regenerate(@AuthenticationPrincipal CurrentUser u,@PathVariable UUID id){return service.regenerate(id,u.id());}
 @PostMapping("/users/{id}/temporary-password") @PreAuthorize("hasRole('ADMINISTRADOR')") public void temporary(@PathVariable UUID id,@Valid @RequestBody TemporaryPasswordRequest r){service.setTemporaryPassword(id,r);}
}
