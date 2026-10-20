package com.vuelossanitarios.backend.api;

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
 @GetMapping("/{userId}") public List<QualificationView> list(@PathVariable Long userId){return service.qualifications(userId);}
 @PutMapping("/{userId}/{code}") @ResponseStatus(HttpStatus.NO_CONTENT) public void classify(@PathVariable Long userId,@PathVariable String code,@AuthenticationPrincipal CurrentUser user){service.classify(userId,code,user.id());}
 @DeleteMapping("/{userId}/{code}") @ResponseStatus(HttpStatus.NO_CONTENT) public void unclassify(@PathVariable Long userId,@PathVariable String code,@AuthenticationPrincipal CurrentUser user){service.unclassify(userId,code,user.id());}
}
