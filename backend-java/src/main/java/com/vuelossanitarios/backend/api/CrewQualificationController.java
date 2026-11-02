package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.api.dto.CrewRequirementDtos.UserRequirementsView;
import com.vuelossanitarios.backend.api.dto.FlightDtos.QualificationView;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.CrewManagementService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/crew-qualifications") @PreAuthorize("hasRole('ADMINISTRADOR')")
public class CrewQualificationController {
 private final CrewManagementService service;
 public CrewQualificationController(CrewManagementService service){this.service=service;}
 /** Requisitos de una persona para una función (por defecto COMANDANTE): qué cumple, qué falta y quién lo resuelve. Sólo consulta. */
 @GetMapping("/{userId}/requirements") public UserRequirementsView requirements(@PathVariable Long userId,@RequestParam(defaultValue="COMANDANTE") String role){return service.requirementsFor(userId,role);}
 /** Comandantes activos con sus requisitos; por defecto sólo los que tienen alguno pendiente. */
 @GetMapping("/requirements/commanders") public List<UserRequirementsView> commanderRequirements(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="true") boolean pendientes,@RequestParam(defaultValue="100") int size){return service.commanderRequirements(q,pendientes,size);}
 @GetMapping("/{userId}") public List<QualificationView> list(@PathVariable Long userId,@RequestParam(defaultValue="false") boolean history){return service.qualifications(userId,history);}
 @PutMapping("/{userId}/{code}") @ResponseStatus(HttpStatus.NO_CONTENT) public void classify(@PathVariable Long userId,@PathVariable String code,@AuthenticationPrincipal CurrentUser user){service.classify(userId,code,user.id());}
 @DeleteMapping("/{userId}/{code}") @ResponseStatus(HttpStatus.NO_CONTENT) public void unclassify(@PathVariable Long userId,@PathVariable String code,@RequestParam(required=false) String motivo,@AuthenticationPrincipal CurrentUser user){service.unclassify(userId,code,motivo,user.id());}
}
