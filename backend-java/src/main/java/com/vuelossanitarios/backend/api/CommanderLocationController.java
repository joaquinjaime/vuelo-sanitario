package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.api.dto.CommanderLocationDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.CommanderLocationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Ubicación operativa actual de los comandantes: la consultan y la fijan Administrador y Centro de Operaciones; el comandante sólo consulta la propia. */
@RestController public class CommanderLocationController {
 private final CommanderLocationService service; private final com.vuelossanitarios.backend.repository.UserRepository users;
 public CommanderLocationController(CommanderLocationService s,com.vuelossanitarios.backend.repository.UserRepository u){service=s;users=u;}

 @GetMapping("/api/commanders/locations") @PreAuthorize("hasAnyRole('ADMINISTRADOR','OPERACIONES','CENTRO_OPERACIONES')")
 public CommanderLocationList list(@RequestParam(required=false) String q,@RequestParam(required=false) Long provinceId,@RequestParam(required=false) String estado,@RequestParam(required=false) Integer limit){return service.list(q,provinceId,estado,limit);}

 /** Un comandante consulta su propia ubicación; Operaciones y Administrador consultan la de cualquiera. */
 @GetMapping("/api/commanders/{id}/location") @PreAuthorize("hasAnyRole('ADMINISTRADOR','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')")
 public CommanderLocationRow get(@PathVariable Long id,@AuthenticationPrincipal CurrentUser current){
  boolean staff=users.findWithRolesById(current.id()).orElseThrow().getUserRoles().stream().anyMatch(r->java.util.Set.of("ADMINISTRADOR","OPERACIONES","CENTRO_OPERACIONES").contains(r.getRole().getCodigo()));
  if(!staff&&!id.equals(current.id()))throw new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"Sólo puede consultar su propia ubicación");
  return service.get(id);
 }

 @PutMapping("/api/commanders/{id}/location") @PreAuthorize("hasAnyRole('ADMINISTRADOR','OPERACIONES','CENTRO_OPERACIONES')")
 public CommanderLocationRow update(@PathVariable Long id,@Valid @RequestBody UpdateCommanderLocation r,@AuthenticationPrincipal CurrentUser current){return service.update(id,r.provinciaId(),r.motivo(),current.id());}

 /** Contrato anterior (sólo provincia): equivale a {@code PUT /api/commanders/{id}/location}. */
 @PostMapping("/api/catalogs/commanders/{id}/location") @PreAuthorize("hasAnyRole('ADMINISTRADOR','OPERACIONES','CENTRO_OPERACIONES')")
 public ProvinceLocationView updateProvince(@PathVariable Long id,@Valid @RequestBody LocationRequest r,@AuthenticationPrincipal CurrentUser current){
  CommanderLocationRow row=service.update(id,r.locationId(),null,current.id());return new ProvinceLocationView(row.comandanteId(),row.provinciaId(),row.provincia());
 }
 public record LocationRequest(@NotNull Long locationId){} public record ProvinceLocationView(Long comandanteId,Long provinciaActualId,String provinciaActual){}
}
