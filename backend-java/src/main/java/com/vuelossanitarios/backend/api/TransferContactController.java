package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.api.dto.TransferContactDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.TransferContactService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Contactos de coordinación de UN traslado sanitario: siempre colgados del vuelo, nunca un directorio general. */
@RestController @RequestMapping("/api/flights/{flightId}/transfer-contacts")
public class TransferContactController {
 private final TransferContactService service;
 public TransferContactController(TransferContactService s){service=s;}
 @GetMapping @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES')")
 public Listing list(@PathVariable Long flightId,@AuthenticationPrincipal CurrentUser u){return service.list(flightId,u.id());}
 @PostMapping @PreAuthorize("hasRole('DTS')")
 public View add(@PathVariable Long flightId,@Valid @RequestBody Input r,@AuthenticationPrincipal CurrentUser u){return service.add(flightId,u.id(),r);}
 @PutMapping("/{contactId}") @PreAuthorize("hasRole('DTS')")
 public View update(@PathVariable Long flightId,@PathVariable Long contactId,@Valid @RequestBody Update r,@AuthenticationPrincipal CurrentUser u){return service.update(flightId,contactId,u.id(),r);}
 @DeleteMapping("/{contactId}") @PreAuthorize("hasRole('DTS')")
 public void retire(@PathVariable Long flightId,@PathVariable Long contactId,@AuthenticationPrincipal CurrentUser u){service.retire(flightId,contactId,u.id());}
 @PostMapping("/{contactId}/principal") @PreAuthorize("hasRole('DTS')")
 public void makePrimary(@PathVariable Long flightId,@PathVariable Long contactId,@AuthenticationPrincipal CurrentUser u){service.makePrimary(flightId,contactId,u.id());}
}
