package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.api.dto.PatientDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.PatientDirectoryService;
import com.vuelossanitarios.backend.service.PatientService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/patients")
public class PatientController {
 private final PatientService registration;
 private final PatientDirectoryService directory;
 public PatientController(PatientService registration,PatientDirectoryService directory){this.registration=registration;this.directory=directory;}

 /** An unfiltered patient directory is deliberately unavailable. */
 @GetMapping("/search") @PreAuthorize("hasAnyRole('DTS','ADMINISTRADOR')")
 public PatientSearchPage search(@RequestParam(required=false) String dni,@RequestParam(required=false) String nombre,@RequestParam(required=false) String apellido,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="10") int size){
  return directory.search(dni,nombre,apellido,page,size);
 }

 @PostMapping @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES')")
 public PatientView create(@Valid @RequestBody CreatePatient request){return registration.create(request);}

 @GetMapping("/{id}") @PreAuthorize("hasRole('ADMINISTRADOR')")
 public PatientIdentityDetail detail(@PathVariable Long id){return directory.detail(id);}

 @PutMapping("/{id}/identity") @PreAuthorize("hasRole('ADMINISTRADOR')")
 public PatientIdentityDetail correct(@PathVariable Long id,@Valid @RequestBody CorrectIdentity request,@AuthenticationPrincipal CurrentUser actor){return directory.correct(id,request,actor.id());}

 /** Rectificación del DNI: sólo ADMINISTRADOR, con motivo, cotejo documental declarado y versión de la identidad. */
 @PutMapping("/{id}/dni") @PreAuthorize("hasRole('ADMINISTRADOR')")
 public PatientIdentityDetail rectifyDni(@PathVariable Long id,@Valid @RequestBody RectifyDni request,@AuthenticationPrincipal CurrentUser actor){return directory.rectifyDni(id,request,actor.id());}

 @GetMapping("/{id}/corrections") @PreAuthorize("hasRole('ADMINISTRADOR')")
 public PatientCorrectionHistory history(@PathVariable Long id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="10") int size){return directory.history(id,page,size);}
}
