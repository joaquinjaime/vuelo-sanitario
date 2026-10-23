package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.ProfessionalCredentialService;
import com.vuelossanitarios.backend.service.ProfessionalCredentialService.*;
import jakarta.validation.Valid;
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
 private final ProfessionalCredentialService service;
 public ProfessionalCredentialController(ProfessionalCredentialService service){this.service=service;}
 @GetMapping("/users/{userId}/professional-credentials") public List<View> list(@PathVariable Long userId){return service.list(userId);}
 @PostMapping("/users/{userId}/professional-credentials") public View create(@PathVariable Long userId,@Valid @RequestBody Input input,@AuthenticationPrincipal CurrentUser actor){return service.create(userId,input,actor.id());}
 @PutMapping("/professional-credentials/{id}") public View update(@PathVariable Long id,@Valid @RequestBody Input input,@AuthenticationPrincipal CurrentUser actor){return service.update(id,input,actor.id());}
 @PostMapping(value="/professional-credentials/{id}/documents",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) public View upload(@PathVariable Long id,@RequestPart MultipartFile file,@AuthenticationPrincipal CurrentUser actor){return service.upload(id,file,actor.id());}
 @PostMapping("/professional-credentials/{id}/decision/{action}") public View decision(@PathVariable Long id,@PathVariable String action,@Valid @RequestBody Decision input,@AuthenticationPrincipal CurrentUser actor){return service.decide(id,action,input,actor.id());}
 @GetMapping("/professional-credentials/{id}/history") public List<History> history(@PathVariable Long id){return service.history(id);}
 @GetMapping("/professional-credential-documents/{id}") public ResponseEntity<ByteArrayResource> download(@PathVariable Long id){Download d=service.download(id);return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.APPLICATION_PDF).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(d.name(),StandardCharsets.UTF_8).build().toString()).body(new ByteArrayResource(d.data()));}
}
