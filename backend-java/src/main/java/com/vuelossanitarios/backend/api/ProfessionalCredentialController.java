package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.CredentialDocumentService;
import com.vuelossanitarios.backend.service.CredentialPolicyService;
import com.vuelossanitarios.backend.service.ProfessionalCredentialService;
import com.vuelossanitarios.backend.service.ProfessionalCredentialService.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController @RequestMapping("/api") @PreAuthorize("hasRole('ADMINISTRADOR')")
public class ProfessionalCredentialController {
 public record Reason(@NotBlank @Size(max=500) String reason){}
 public record Hold(boolean hold,@NotBlank @Size(max=500) String reason){}
 public record DataRequest(@NotBlank @Size(max=20) String type,@NotBlank @Size(max=4000) String reason){}
 private final ProfessionalCredentialService service; private final CredentialDocumentService documents; private final CredentialPolicyService policies;
 public ProfessionalCredentialController(ProfessionalCredentialService service,CredentialDocumentService documents,CredentialPolicyService policies){this.service=service;this.documents=documents;this.policies=policies;}
 @GetMapping("/users/{userId}/professional-credentials") public List<View> list(@PathVariable Long userId){return service.list(userId);}
 @PostMapping("/users/{userId}/professional-credentials") public View create(@PathVariable Long userId,@Valid @RequestBody Input input,@AuthenticationPrincipal CurrentUser actor){return service.create(userId,input,actor.id());}
 @GetMapping("/professional-credentials/{id}") public View get(@PathVariable Long id){return service.find(id);}
 @PutMapping("/professional-credentials/{id}") public View update(@PathVariable Long id,@Valid @RequestBody Input input,@AuthenticationPrincipal CurrentUser actor){return service.update(id,input,actor.id());}
 @PostMapping("/professional-credentials/{id}/renew") public View renew(@PathVariable Long id,@Valid @RequestBody Input input,@AuthenticationPrincipal CurrentUser actor){return service.renew(id,input,actor.id());}
 @PostMapping(value="/professional-credentials/{id}/documents",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) public View upload(@PathVariable Long id,@RequestPart MultipartFile file,@RequestParam(required=false) String purpose,@RequestParam(required=false) Long replacesId,@AuthenticationPrincipal CurrentUser actor){return documents.upload(id,file,purpose,replacesId,actor.id());}
 @PostMapping("/professional-credentials/{id}/decision/{action}") public View decision(@PathVariable Long id,@PathVariable String action,@Valid @RequestBody Decision input,@AuthenticationPrincipal CurrentUser actor){return service.decide(id,action,input,actor.id());}
 @PostMapping("/professional-credentials/{id}/external-checks") public View externalCheck(@PathVariable Long id,@Valid @RequestBody ExternalCheckInput input,@AuthenticationPrincipal CurrentUser actor){return service.recordExternalCheck(id,input,actor.id());}
 @GetMapping("/professional-credentials/{id}/external-checks") public List<ExternalCheckView> externalChecks(@PathVariable Long id){return service.externalChecks(id);}
 @GetMapping("/professional-credentials/{id}/decisions") public List<DecisionView> decisions(@PathVariable Long id){return service.decisions(id);}
 @GetMapping("/professional-credentials/{id}/history") public List<History> history(@PathVariable Long id){return service.history(id);}
 @PostMapping("/professional-credentials/{id}/data-requests") public View dataRequest(@PathVariable Long id,@Valid @RequestBody DataRequest input,@AuthenticationPrincipal CurrentUser actor){return documents.requestDataAction(id,input.type(),input.reason(),actor.id());}
 @GetMapping("/professional-credential-documents/{id}") public ResponseEntity<ByteArrayResource> download(@PathVariable Long id,@AuthenticationPrincipal CurrentUser actor){
  CredentialDocumentService.Download d=documents.download(id,actor.id());
  return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").contentType(MediaType.APPLICATION_PDF).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(d.name(),StandardCharsets.UTF_8).build().toString()).body(new ByteArrayResource(d.data()));
 }
 @PostMapping("/professional-credential-documents/{id}/rescan") public View rescan(@PathVariable Long id,@AuthenticationPrincipal CurrentUser actor){return documents.rescan(id,actor.id());}
 @PostMapping("/professional-credential-documents/{id}/retire") public View retire(@PathVariable Long id,@Valid @RequestBody Reason input,@AuthenticationPrincipal CurrentUser actor){return documents.retire(id,input.reason(),actor.id());}
 @PostMapping("/professional-credential-documents/{id}/retention-hold") public View hold(@PathVariable Long id,@Valid @RequestBody Hold input,@AuthenticationPrincipal CurrentUser actor){return documents.hold(id,input.hold(),input.reason(),actor.id());}
 @GetMapping("/professional-credential-documents/antimalware-status") public CredentialDocumentService.AntimalwareStatus antimalware(){return documents.antimalwareStatus();}
 @GetMapping("/professional-credential-retention/report") public CredentialDocumentService.Retention retention(){return documents.retention();}
 @GetMapping("/credential-policies") public List<CredentialPolicyService.View> policies(){return policies.list();}
 @PostMapping("/credential-policies") public CredentialPolicyService.View createPolicy(@Valid @RequestBody CredentialPolicyService.Input input,@AuthenticationPrincipal CurrentUser actor){return policies.create(input,actor.id());}
 @PostMapping("/credential-policies/{id}/deactivate") public CredentialPolicyService.View deactivatePolicy(@PathVariable Long id,@Valid @RequestBody Reason input,@AuthenticationPrincipal CurrentUser actor){return policies.deactivate(id,input.reason(),actor.id());}
}
