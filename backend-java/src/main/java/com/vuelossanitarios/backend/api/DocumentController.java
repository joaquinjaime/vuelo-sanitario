package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.api.dto.DocumentDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.DocumentService;
import jakarta.validation.Valid;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.*;
@RestController @RequestMapping("/api") public class DocumentController {
 private final DocumentService service; public DocumentController(DocumentService s){service=s;}
 @PostMapping(value="/flights/{flightId}/documents/pdf",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @PreAuthorize("hasAnyRole('COMANDANTE','OPERACIONES')") public DocumentView createPdf(@PathVariable UUID flightId,@RequestParam String documentTypeCode,@RequestParam String titulo,@RequestPart MultipartFile file,@AuthenticationPrincipal CurrentUser u){return service.createPdf(flightId,documentTypeCode,titulo,file,u.id());}
 @PostMapping(value="/documents/{itemId}/versions/pdf",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @PreAuthorize("hasAnyRole('COMANDANTE','OPERACIONES')") public DocumentView replacePdf(@PathVariable UUID itemId,@RequestPart MultipartFile file,@AuthenticationPrincipal CurrentUser u){return service.replacePdf(itemId,file,u.id());}
 @PostMapping("/flights/{flightId}/texts") @PreAuthorize("hasAnyRole('COMANDANTE','OPERACIONES')") public DocumentView createText(@PathVariable UUID flightId,@Valid @RequestBody CreateText r,@AuthenticationPrincipal CurrentUser u){return service.createText(flightId,r,u.id());}
 @PostMapping("/documents/{itemId}/versions/text") @PreAuthorize("hasAnyRole('COMANDANTE','OPERACIONES')") public DocumentView replaceText(@PathVariable UUID itemId,@Valid @RequestBody ReplaceText r,@AuthenticationPrincipal CurrentUser u){return service.replaceText(itemId,r,u.id());}
 @GetMapping("/documents/{itemId}/versions") public List<DocumentView> history(@PathVariable UUID itemId,@AuthenticationPrincipal CurrentUser u){return service.history(itemId,u.id());}
 @GetMapping("/document-versions/{versionId}/download") public ResponseEntity<ByteArrayResource> download(@PathVariable UUID versionId,@AuthenticationPrincipal CurrentUser u){var d=service.download(versionId,u.id());return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\""+d.filename()+"\"").body(new ByteArrayResource(d.data()));}
}
