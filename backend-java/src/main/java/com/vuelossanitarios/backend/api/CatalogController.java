package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.repository.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/catalogs")
public class CatalogController {
 private final AircraftRepository aircraft; private final AirportRepository airports; private final FlightPriorityRepository priorities;
 public CatalogController(AircraftRepository a, AirportRepository ap, FlightPriorityRepository p){aircraft=a;airports=ap;priorities=p;}
 @GetMapping("/aircraft") public List<AircraftView> aircraft(){return aircraft.findAll().stream().filter(x->Boolean.TRUE.equals(x.getActivo())).map(x->new AircraftView(x.getId(),x.getMatricula(),x.getModelo(),x.getTipo())).toList();}
 @GetMapping("/airports") public List<AirportView> airports(){return airports.findAll().stream().filter(x->Boolean.TRUE.equals(x.getActivo())).map(x->new AirportView(x.getId(),x.getCodigoOaci(),x.getCodigoIata(),x.getNombre(),x.getCiudad())).toList();}
 @GetMapping("/priorities") public List<PriorityView> priorities(){return priorities.findAll().stream().filter(x->Boolean.TRUE.equals(x.getActivo())).sorted(Comparator.comparing(FlightPriority::getOrden)).map(x->new PriorityView(x.getCodigo(),x.getNombre())).toList();}
 @PostMapping("/aircraft") @PreAuthorize("hasRole('ADMINISTRADOR')") @Transactional public AircraftView createAircraft(@Valid @RequestBody AircraftRequest r){Aircraft x=new Aircraft();x.setMatricula(r.matricula());x.setModelo(r.modelo());x.setTipo(r.tipo());x.setCapacidadPacientes(r.capacidadPacientes());x.setCapacidadTripulacion(r.capacidadTripulacion());x.setEquipamientoMedico(r.equipamientoMedico());aircraft.save(x);return new AircraftView(x.getId(),x.getMatricula(),x.getModelo(),x.getTipo());}
 @PostMapping("/airports") @PreAuthorize("hasRole('ADMINISTRADOR')") @Transactional public AirportView createAirport(@Valid @RequestBody AirportRequest r){Airport x=new Airport();x.setCodigoOaci(blank(r.codigoOaci()));x.setCodigoIata(blank(r.codigoIata()));x.setNombre(r.nombre());x.setCiudad(blank(r.ciudad()));x.setProvincia(blank(r.provincia()));x.setPais(r.pais()==null||r.pais().isBlank()?"Argentina":r.pais());airports.save(x);return new AirportView(x.getId(),x.getCodigoOaci(),x.getCodigoIata(),x.getNombre(),x.getCiudad());}
 private String blank(String value){return value==null||value.isBlank()?null:value.trim();}
 public record AircraftRequest(@NotBlank @Size(max=20) String matricula,@NotBlank @Size(max=100) String modelo,@NotBlank @Size(max=50) String tipo,@NotNull @Min(1) Short capacidadPacientes,@NotNull @Min(1) Short capacidadTripulacion,@Size(max=10000) String equipamientoMedico){}
 public record AirportRequest(@Size(max=4) String codigoOaci,@Size(max=3) String codigoIata,@NotBlank @Size(max=150) String nombre,@Size(max=100) String ciudad,@Size(max=100) String provincia,@Size(max=100) String pais){}
 public record AircraftView(UUID id,String matricula,String modelo,String tipo){} public record AirportView(UUID id,String codigoOaci,String codigoIata,String nombre,String ciudad){} public record PriorityView(String codigo,String nombre){}
}
