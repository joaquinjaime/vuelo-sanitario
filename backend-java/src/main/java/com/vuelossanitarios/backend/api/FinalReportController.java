package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.api.dto.FinalReportDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.FinalReportWorkflowService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.multipart.MultipartFile;
import java.util.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@Validated @RestController @RequestMapping("/api/final-reports") public class FinalReportController{
 private final FinalReportWorkflowService service; public FinalReportController(FinalReportWorkflowService s){service=s;}
 @GetMapping("/mine") @PreAuthorize("hasRole('COMANDANTE')") public List<ObligationView> mine(@AuthenticationPrincipal CurrentUser u){return service.mine(u.id());}
 @GetMapping("/pending-review") @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')") public List<ObligationView> pending(){return service.pendingReview();}
 @GetMapping("/awaiting-commander") @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')") public List<ObligationView> awaitingCommander(){return service.awaitingCommander();}
 @GetMapping("/{id}") @PreAuthorize("hasAnyRole('COMANDANTE','OPERACIONES','CENTRO_OPERACIONES','ADMINISTRADOR')") public ObligationDetail detail(@PathVariable Long id,@AuthenticationPrincipal CurrentUser u){return service.detail(id,u.id());}
 @GetMapping("/flight/{flightId}") @PreAuthorize("hasAnyRole('COMANDANTE','OPERACIONES','CENTRO_OPERACIONES','ADMINISTRADOR')") public ObligationDetail byFlight(@PathVariable Long flightId,@AuthenticationPrincipal CurrentUser u){return service.byFlight(flightId,u.id());}
 @PostMapping(value="/{id}/submit",consumes=MediaType.APPLICATION_JSON_VALUE) @PreAuthorize("hasRole('COMANDANTE')") public ObligationView submit(@PathVariable Long id,@Valid @RequestBody Submit r,@AuthenticationPrincipal CurrentUser u){return service.submit(id,r,null,u.id());}
 @PostMapping(value="/{id}/submit",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @PreAuthorize("hasRole('COMANDANTE')") public ObligationView submitWithFile(@PathVariable Long id,@RequestParam(required=false) String texto,@RequestParam(required=false) @DecimalMin("0.0") @DecimalMax("999.99") BigDecimal horasVuelo,@RequestParam(required=false) @DecimalMin("0.0") @DecimalMax("99999999.99") BigDecimal combustibleConsumidoLitros,@RequestParam(required=false) String incidentes,@RequestPart(required=false) MultipartFile file,@AuthenticationPrincipal CurrentUser u){if(texto!=null&&texto.length()>10000||incidentes!=null&&incidentes.length()>10000)throw new ApiException(HttpStatus.BAD_REQUEST,"El texto supera el máximo permitido");return service.submit(id,new Submit(texto,horasVuelo,combustibleConsumidoLitros,incidentes),file,u.id());}
 @GetMapping("/{id}/versions/{version}/file") @PreAuthorize("hasAnyRole('COMANDANTE','OPERACIONES','CENTRO_OPERACIONES','ADMINISTRADOR')") public ResponseEntity<ByteArrayResource> file(@PathVariable Long id,@PathVariable int version,@AuthenticationPrincipal CurrentUser u){var d=service.download(id,version,u.id());return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(d.filename()).build().toString()).header("X-Content-Type-Options","nosniff").header(HttpHeaders.CACHE_CONTROL,"private, no-store").contentLength(d.data().length).body(new ByteArrayResource(d.data()));}
 @PostMapping("/{id}/extension") @PreAuthorize("hasRole('COMANDANTE')") public ObligationView extension(@PathVariable Long id,@AuthenticationPrincipal CurrentUser u){return service.extend(id,u.id());}
 @PostMapping("/{id}/review") @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')") public ObligationView review(@PathVariable Long id,@Valid @RequestBody Review r,@AuthenticationPrincipal CurrentUser u){return service.review(id,r,u.id());}
}
