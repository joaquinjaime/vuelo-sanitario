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
import java.nio.charset.StandardCharsets;
import java.util.*;
@RestController @RequestMapping("/api") public class DocumentController {
 private final DocumentService service; public DocumentController(DocumentService s){service=s;}
 @GetMapping("/flights/{flightId}/documents") @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')") public List<DocumentView> list(@PathVariable Long flightId,@AuthenticationPrincipal CurrentUser u){return service.list(flightId,u.id());}
 @PostMapping(value="/flights/{flightId}/documents/pdf",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @PreAuthorize("hasAnyRole('COMANDANTE','OPERACIONES','CENTRO_OPERACIONES')") public DocumentView createPdf(@PathVariable Long flightId,@RequestParam String documentTypeCode,@RequestParam String nombreDocumento,@RequestPart MultipartFile file,@AuthenticationPrincipal CurrentUser u){return service.createPdf(flightId,documentTypeCode,nombreDocumento,file,u.id());}
 @PostMapping(value="/documents/{itemId}/versions/pdf",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @PreAuthorize("hasAnyRole('COMANDANTE','OPERACIONES','CENTRO_OPERACIONES')") public DocumentView replacePdf(@PathVariable Long itemId,@RequestPart MultipartFile file,@AuthenticationPrincipal CurrentUser u){return service.replacePdf(itemId,file,u.id());}
 @GetMapping("/documents/{itemId}/lock") @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')") public DocumentLockView lock(@PathVariable Long itemId,@AuthenticationPrincipal CurrentUser u){return service.lockView(itemId,u.id());}
 @PostMapping("/documents/{itemId}/lock") @PreAuthorize("hasAnyRole('COMANDANTE','OPERACIONES','CENTRO_OPERACIONES')") public DocumentLockView acquireLock(@PathVariable Long itemId,@AuthenticationPrincipal CurrentUser u){return service.acquireLock(itemId,u.id());}
 @DeleteMapping("/documents/{itemId}/lock") @ResponseStatus(HttpStatus.NO_CONTENT) @PreAuthorize("hasAnyRole('COMANDANTE','OPERACIONES','CENTRO_OPERACIONES')") public void releaseLock(@PathVariable Long itemId,@AuthenticationPrincipal CurrentUser u){service.releaseLock(itemId,u.id());}
 @GetMapping("/documents/{itemId}/versions") @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')") public DocumentHistoryView history(@PathVariable Long itemId,@AuthenticationPrincipal CurrentUser u){return service.history(itemId,u.id());}
 @GetMapping("/document-versions/{versionId}/download") @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')") public ResponseEntity<ByteArrayResource> download(@PathVariable Long versionId,@AuthenticationPrincipal CurrentUser u){var d=service.download(versionId,u.id());return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(d.filename(),StandardCharsets.UTF_8).build().toString()).body(new ByteArrayResource(d.data()));}
}
