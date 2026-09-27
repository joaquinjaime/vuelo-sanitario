package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.api.dto.FinalReportDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.FinalReportWorkflowService;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/final-reports") public class FinalReportController{
 private final FinalReportWorkflowService service; public FinalReportController(FinalReportWorkflowService s){service=s;}
 @GetMapping("/mine") @PreAuthorize("hasRole('COMANDANTE')") public List<ObligationView> mine(@AuthenticationPrincipal CurrentUser u){return service.mine(u.id());}
 @GetMapping("/pending-review") @PreAuthorize("hasRole('OPERACIONES')") public List<ObligationView> pending(){return service.pendingReview();}
 @PostMapping("/{id}/submit") @PreAuthorize("hasRole('COMANDANTE')") public ObligationView submit(@PathVariable UUID id,@Valid @RequestBody Submit r,@AuthenticationPrincipal CurrentUser u){return service.submit(id,r,u.id());}
 @PostMapping("/{id}/extension") @PreAuthorize("hasRole('COMANDANTE')") public ObligationView extension(@PathVariable UUID id,@AuthenticationPrincipal CurrentUser u){return service.extend(id,u.id());}
 @PostMapping("/{id}/review") @PreAuthorize("hasRole('OPERACIONES')") public ObligationView review(@PathVariable UUID id,@Valid @RequestBody Review r,@AuthenticationPrincipal CurrentUser u){return service.review(id,r,u.id());}
}
