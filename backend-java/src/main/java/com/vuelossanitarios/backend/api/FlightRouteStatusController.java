package com.vuelossanitarios.backend.api;
import com.vuelossanitarios.backend.service.FlightRouteService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;
@RestController
public class FlightRouteStatusController {
 private final FlightRouteService service;
 public FlightRouteStatusController(FlightRouteService service){this.service=service;}
 @GetMapping("/api/flights/route-statuses") @PreAuthorize("hasAnyRole('OPERACIONES','CENTRO_OPERACIONES','ADMINISTRADOR')")
 public List<FlightRouteService.Status> statuses(){return service.statuses();}
}
