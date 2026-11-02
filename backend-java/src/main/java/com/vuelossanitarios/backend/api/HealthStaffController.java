package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.api.dto.HealthStaffDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.HealthStaffService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Personal sanitario (médicos y enfermeros). Es un catálogo administrativo de cada DTS: los profesionales no son usuarios y no tienen ningún acceso a la aplicación. */
@RestController @RequestMapping("/api")
public class HealthStaffController {
 private final HealthStaffService service;
 public HealthStaffController(HealthStaffService service){this.service=service;}

 @GetMapping("/health-staff") @PreAuthorize("hasRole('DTS')")
 public List<StaffView> list(@RequestParam(defaultValue="false") boolean inactivos,@AuthenticationPrincipal CurrentUser u){return service.list(u.id(),inactivos);}
 @PostMapping("/health-staff") @PreAuthorize("hasRole('DTS')") @ResponseStatus(HttpStatus.CREATED)
 public StaffView create(@Valid @RequestBody StaffInput r,@AuthenticationPrincipal CurrentUser u){return service.create(r,u.id());}
 @PutMapping("/health-staff/{id}") @PreAuthorize("hasRole('DTS')")
 public StaffView update(@PathVariable Long id,@Valid @RequestBody StaffUpdate r,@AuthenticationPrincipal CurrentUser u){return service.update(id,r,u.id());}
 @PostMapping("/health-staff/{id}/active") @PreAuthorize("hasRole('DTS')")
 public StaffView setActive(@PathVariable Long id,@Valid @RequestBody ActiveRequest r,@AuthenticationPrincipal CurrentUser u){return service.setActive(id,r,u.id());}

 /** Tripulación sanitaria del vuelo: la ven el DTS solicitante, Operaciones, Administración y el comandante principal. */
 @GetMapping("/flights/{id}/health-staff") @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE','ADMINISTRADOR')")
 public List<FlightStaffView> forFlight(@PathVariable Long id,@RequestParam(defaultValue="false") boolean history,@AuthenticationPrincipal CurrentUser u){return service.forFlight(id,u.id(),history);}
 @GetMapping("/flights/{id}/health-staff/candidates") @PreAuthorize("hasRole('DTS')")
 public List<StaffCandidateView> candidates(@PathVariable Long id,@AuthenticationPrincipal CurrentUser u){return service.candidates(id,u.id());}
 @PostMapping("/flights/{id}/health-staff") @PreAuthorize("hasRole('DTS')") @ResponseStatus(HttpStatus.CREATED)
 public FlightStaffView assign(@PathVariable Long id,@Valid @RequestBody AssignStaff r,@AuthenticationPrincipal CurrentUser u){return service.assign(id,r,u.id());}
 @PutMapping("/flights/{id}/health-staff/{assignmentId}") @PreAuthorize("hasRole('DTS')")
 public FlightStaffView replace(@PathVariable Long id,@PathVariable Long assignmentId,@Valid @RequestBody AssignStaff r,@AuthenticationPrincipal CurrentUser u){return service.replace(id,assignmentId,r,u.id());}
 @DeleteMapping("/flights/{id}/health-staff/{assignmentId}") @PreAuthorize("hasRole('DTS')") @ResponseStatus(HttpStatus.NO_CONTENT)
 public void remove(@PathVariable Long id,@PathVariable Long assignmentId,@AuthenticationPrincipal CurrentUser u){service.remove(id,assignmentId,u.id());}
}
