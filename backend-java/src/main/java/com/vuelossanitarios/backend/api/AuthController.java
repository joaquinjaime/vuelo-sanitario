package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.api.dto.AuthDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.AuthService;
import com.vuelossanitarios.backend.service.EmailVerificationService;
import com.vuelossanitarios.backend.service.PersonContactService;
import com.vuelossanitarios.backend.service.PersonIdentityService;
import com.vuelossanitarios.backend.api.dto.PatientDtos.RectifyDni;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequestMapping("/api/auth") public class AuthController {
 private final AuthService service; private final PersonContactService contacts; private final PersonIdentityService identity; private final EmailVerificationService verification; public AuthController(AuthService s,PersonContactService c,PersonIdentityService i,EmailVerificationService v){service=s;contacts=c;identity=i;verification=v;}
 @PostMapping("/login") public TokenResponse login(@Valid @RequestBody LoginRequest request){return service.login(request);}
 @PostMapping("/activar-cuenta") @ResponseStatus(HttpStatus.NO_CONTENT) public void activate(@Valid @RequestBody ActivateAccountRequest r){service.activate(r);}
 @GetMapping("/me") public UserView me(@AuthenticationPrincipal CurrentUser u){return service.myAccount(u.id());}
 @PostMapping("/me/password") public void password(@AuthenticationPrincipal CurrentUser u,@Valid @RequestBody ChangePasswordRequest r){service.changePassword(u.id(),r);}
 // Contactos de la propia persona del usuario autenticado; no existe ninguna ruta que reciba el identificador de otra persona.
 /** Registra el correo (sin verificar) y envía el código a esa dirección; si el envío no es posible el correo queda registrado y la respuesta lo informa en {@code envio}. */
 @PostMapping("/me/correos") public ContactView email(@AuthenticationPrincipal CurrentUser u,@Valid @RequestBody ContactRequest r){
  ContactView created=contacts.addEmail(u.id(),r);
  EmailVerificationService.Issued issued=verification.issue(u.id(),created.id(),false);
  ContactView current=contacts.emailContact(u.id(),created.id());
  return new ContactView(current.id(),current.valor(),current.tipo(),current.principal(),current.version(),null,current.verificacion(),issued.status());
 }
 /** Solicita o reenvía el código de verificación de un correo propio. */
 @PostMapping("/me/correos/{id}/verificacion") public ContactView requestVerification(@AuthenticationPrincipal CurrentUser u,@PathVariable Long id){
  EmailVerificationService.Issued issued=verification.issue(u.id(),id,true);
  switch(issued.status()){
   case EmailVerificationService.NOT_CONFIGURED->throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"MAIL_NOT_CONFIGURED","El servicio de correo no está configurado: no se puede enviar el código. Contacte al administrador",Map.of());
   case EmailVerificationService.RATE_LIMITED->throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"VERIFICATION_RATE_LIMIT","Ya se envió un código recientemente o se alcanzó el límite diario. Espere "+issued.retryAfterSeconds()+" segundos e intente de nuevo",Map.of("reintentoEnSegundos",issued.retryAfterSeconds()));
   case EmailVerificationService.FAILED->throw new ApiException(HttpStatus.BAD_GATEWAY,"MAIL_SEND_FAILED","El servidor de correo no aceptó el mensaje. Intente de nuevo más tarde",Map.of());
   default->{}
  }
  ContactView current=contacts.emailContact(u.id(),id);
  return new ContactView(current.id(),current.valor(),current.tipo(),current.principal(),current.version(),null,current.verificacion(),issued.status());
 }
 /** Confirma el código recibido en el correo; sólo el titular del contacto puede hacerlo. */
 @PostMapping("/me/correos/{id}/verificacion/confirmar") public ContactView confirmVerification(@AuthenticationPrincipal CurrentUser u,@PathVariable Long id,@Valid @RequestBody ConfirmEmailRequest r){
  verification.confirm(u.id(),id,r.codigo());
  return contacts.emailContact(u.id(),id);
 }
 @PutMapping("/me/correos/{id}") public ContactView updateEmail(@AuthenticationPrincipal CurrentUser u,@PathVariable Long id,@Valid @RequestBody ContactUpdateRequest r){return contacts.updateEmail(u.id(),id,r);}
 @DeleteMapping("/me/correos/{id}") public void deleteEmail(@AuthenticationPrincipal CurrentUser u,@PathVariable Long id){contacts.removeEmail(u.id(),id);}
 @PostMapping("/me/correos/{id}/principal") public void mainEmail(@AuthenticationPrincipal CurrentUser u,@PathVariable Long id){contacts.makePrimaryEmail(u.id(),id);}
 @PostMapping("/me/telefonos") public ContactView phone(@AuthenticationPrincipal CurrentUser u,@Valid @RequestBody PhoneRequest r){return contacts.addPhone(u.id(),r);}
 @PutMapping("/me/telefonos/{id}") public ContactView updatePhone(@AuthenticationPrincipal CurrentUser u,@PathVariable Long id,@Valid @RequestBody PhoneUpdateRequest r){return contacts.updatePhone(u.id(),id,r);}
 @DeleteMapping("/me/telefonos/{id}") public void deletePhone(@AuthenticationPrincipal CurrentUser u,@PathVariable Long id){contacts.removePhone(u.id(),id);}
 @PostMapping("/me/telefonos/{id}/principal") public void mainPhone(@AuthenticationPrincipal CurrentUser u,@PathVariable Long id){contacts.makePrimaryPhone(u.id(),id);}
 @GetMapping("/users") @PreAuthorize("hasRole('ADMINISTRADOR')") public List<UserView> users(){return service.listUsers();}
 @GetMapping("/users/commanders") @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES','ADMINISTRADOR')") public List<CommanderView> commanders(){return service.listActiveCommanders();}
 @GetMapping("/users/search") @PreAuthorize("hasRole('ADMINISTRADOR')") public UserPage search(@RequestParam(required=false) String q,@RequestParam(required=false) String role,@RequestParam(required=false) String status,@RequestParam(required=false) Integer page,@RequestParam(required=false) Integer size){return service.search(q,role,status,page,size);}
 @GetMapping("/users/summary") @PreAuthorize("hasRole('ADMINISTRADOR')") public UserCounts summary(){return service.counts();}
 @GetMapping("/users/{id}") @PreAuthorize("hasRole('ADMINISTRADOR')") public UserDetail detail(@AuthenticationPrincipal CurrentUser actor,@PathVariable Long id){return service.detail(id,actor.id());}
 /** Misma rectificación que la de la ficha de paciente: la persona se resuelve desde la cuenta (nunca se recibe un identificador de persona). */
 @PutMapping("/users/{id}/dni") @PreAuthorize("hasRole('ADMINISTRADOR')") public UserDetail rectifyDni(@AuthenticationPrincipal CurrentUser actor,@PathVariable Long id,@Valid @RequestBody RectifyDni r){identity.rectifyUserDni(id,r,actor.id());return service.detail(id,actor.id());}
 @GetMapping("/roles") @PreAuthorize("hasRole('ADMINISTRADOR')") public List<RoleOption> roleOptions(){return service.roleOptions();}
 @PostMapping("/users/{id}/credential-reset") @PreAuthorize("hasRole('ADMINISTRADOR')") public CredentialResetResponse resetCredentials(@AuthenticationPrincipal CurrentUser actor,@PathVariable Long id){return service.resetCredentials(id,actor.id());}
 @PostMapping("/users") @PreAuthorize("hasRole('ADMINISTRADOR')") public ActivationCodeResponse create(@AuthenticationPrincipal CurrentUser u,@Valid @RequestBody CreatePendingUserRequest r){return service.createPending(r,u.id());}
 @PutMapping("/users/{id}") @PreAuthorize("hasRole('ADMINISTRADOR')") public UserView update(@AuthenticationPrincipal CurrentUser actor,@PathVariable Long id,@Valid @RequestBody UpdateUserRequest r){return service.updateUser(id,r,actor.id());}
 @PatchMapping("/users/{id}/deactivate") @PreAuthorize("hasRole('ADMINISTRADOR')") public UserView deactivate(@AuthenticationPrincipal CurrentUser actor,@PathVariable Long id,@Valid @RequestBody DeactivateUserRequest r){return service.deactivateUser(id,actor.id(),r.motivo());}
 @PatchMapping("/users/{id}/reactivate") @PreAuthorize("hasRole('ADMINISTRADOR')") public ReactivationResponse reactivate(@AuthenticationPrincipal CurrentUser actor,@PathVariable Long id,@Valid @RequestBody ReactivateUserRequest r){return service.reactivateUser(id,r,actor.id());}
 @PostMapping("/users/{id}/activation-code") @PreAuthorize("hasRole('ADMINISTRADOR')") public ActivationCodeResponse regenerate(@AuthenticationPrincipal CurrentUser u,@PathVariable Long id){return service.regenerate(id,u.id());}
 @PostMapping("/users/{id}/temporary-password") @PreAuthorize("hasRole('ADMINISTRADOR')") public void temporary(@AuthenticationPrincipal CurrentUser actor,@PathVariable Long id,@Valid @RequestBody TemporaryPasswordRequest r){service.setTemporaryPassword(id,r,actor.id());}
}
