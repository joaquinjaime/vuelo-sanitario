package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.api.dto.GeographicCatalogDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.GeographicCatalogService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Administración explícita del maestro geográfico. Sólo ADMINISTRADOR puede alterar los catálogos. */
@RestController @RequestMapping("/api/admin/geography") @PreAuthorize("hasRole('ADMINISTRADOR')")
public class GeographicCatalogAdminController {
 private final GeographicCatalogService service;
 public GeographicCatalogAdminController(GeographicCatalogService s){service=s;}
 @GetMapping("/provinces") public List<ProvinceAdminView> provinces(){return service.provinces();}
 @PostMapping("/provinces") public ProvinceAdminView createProvince(@Valid @RequestBody ProvinceRequest r,@AuthenticationPrincipal CurrentUser u){return service.createProvince(r,u.id());}
 @PutMapping("/provinces/{id}") public ProvinceAdminView updateProvince(@PathVariable Long id,@Valid @RequestBody ProvinceRequest r,@AuthenticationPrincipal CurrentUser u){return service.updateProvince(id,r,u.id());}
 @PostMapping("/provinces/{id}/active") public ProvinceAdminView stateProvince(@PathVariable Long id,@Valid @RequestBody ActiveRequest r,@AuthenticationPrincipal CurrentUser u){return service.setProvinceActive(id,r,u.id());}
 @GetMapping("/localities") public List<LocalityAdminView> localities(){return service.localities();}
 @PostMapping("/localities") public LocalityAdminView createLocality(@Valid @RequestBody LocalityRequest r,@AuthenticationPrincipal CurrentUser u){return service.createLocality(r,u.id());}
 @PutMapping("/localities/{id}") public LocalityAdminView updateLocality(@PathVariable Long id,@Valid @RequestBody LocalityRequest r,@AuthenticationPrincipal CurrentUser u){return service.updateLocality(id,r,u.id());}
 @PostMapping("/localities/{id}/active") public LocalityAdminView stateLocality(@PathVariable Long id,@Valid @RequestBody ActiveRequest r,@AuthenticationPrincipal CurrentUser u){return service.setLocalityActive(id,r,u.id());}
 @GetMapping("/airports") public List<AirportAdminView> airports(){return service.airports();}
 @PostMapping("/airports") public AirportAdminView createAirport(@Valid @RequestBody AirportRequest r,@AuthenticationPrincipal CurrentUser u){return service.createAirport(r,u.id());}
 @PutMapping("/airports/{id}") public AirportAdminView updateAirport(@PathVariable Long id,@Valid @RequestBody AirportRequest r,@AuthenticationPrincipal CurrentUser u){return service.updateAirport(id,r,u.id());}
 @PostMapping("/airports/{id}/active") public AirportAdminView stateAirport(@PathVariable Long id,@Valid @RequestBody ActiveRequest r,@AuthenticationPrincipal CurrentUser u){return service.setAirportActive(id,r,u.id());}
}
