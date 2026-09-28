package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.api.dto.PatientDtos.*;
import com.vuelossanitarios.backend.service.PatientService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/patients") public class PatientController {
 private final PatientService service; private final com.vuelossanitarios.backend.repository.PatientRepository patients;
 public PatientController(PatientService s,com.vuelossanitarios.backend.repository.PatientRepository p){service=s;patients=p;}
 @GetMapping @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')") @org.springframework.transaction.annotation.Transactional(readOnly=true) public java.util.List<PatientView> list(){return patients.findAll().stream().map(p->new PatientView(p.getId(),p.getPerson().getId(),p.getPerson().getNombre(),p.getPerson().getApellido())).toList();}
 @PostMapping @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES')") public PatientView create(@Valid @RequestBody CreatePatient r){return service.create(r);}
}
