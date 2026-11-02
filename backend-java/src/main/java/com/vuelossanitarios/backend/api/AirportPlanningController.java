package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.api.dto.AirportPlanningDtos.AirportCandidates;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.AirportCandidateService;
import com.vuelossanitarios.backend.service.FlightService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Aeropuertos de salida y llegada de un vuelo sanitario (ejecución aeronáutica, distinta de las localidades del paciente): candidatos y propuesta de Centro de Operaciones. */
@RestController @RequestMapping("/api/flights/{id}") public class AirportPlanningController {
 private final AirportCandidateService candidates; private final FlightService flights;
 public AirportPlanningController(AirportCandidateService c,FlightService f){candidates=c;flights=f;}
 @GetMapping("/airport-candidates") @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')")
 public AirportCandidates airportCandidates(@PathVariable Long id,@RequestParam String tipo,@RequestParam(defaultValue="") String q,@AuthenticationPrincipal CurrentUser u){return candidates.candidates(id,u.id(),tipo,q);}
 @PutMapping("/airports") @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES')")
 public FlightView setAirports(@PathVariable Long id,@Valid @RequestBody SetAirports r,@AuthenticationPrincipal CurrentUser u){return flights.setAirports(id,r,u.id());}
}
