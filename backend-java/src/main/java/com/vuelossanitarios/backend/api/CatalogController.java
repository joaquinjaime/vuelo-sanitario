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
 private final AircraftRepository aircraft; private final AirportRepository airports; private final FlightPriorityRepository priorities; private final ProvinceRepository provinces; private final LocalityRepository localities;
 public CatalogController(AircraftRepository a, AirportRepository ap, FlightPriorityRepository p, ProvinceRepository pr, LocalityRepository l){aircraft=a;airports=ap;priorities=p;provinces=pr;localities=l;}
 @GetMapping("/aircraft") @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')") public List<AircraftView> aircraft(){return aircraft.findAll().stream().filter(x->Boolean.TRUE.equals(x.getActivo())).map(x->new AircraftView(x.getId(),x.getMatricula(),x.getModelo(),x.getTipo())).toList();}
 @GetMapping("/provinces") @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')") public List<ProvinceView> provinces(){return provinces.findByActivoTrueOrderByNombreAsc().stream().map(x->new ProvinceView(x.getId(),x.getCodigoOficial(),x.getNombre())).toList();}
 @GetMapping("/localities") @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')") public List<LocalityView> localities(@RequestParam UUID provinceId,@RequestParam(defaultValue="") String q){return localities.findTop50ByProvinciaIdAndActivoTrueAndNombreContainingIgnoreCaseOrderByNombreAsc(provinceId,q.trim()).stream().map(x->new LocalityView(x.getId(),x.getCodigoOficial(),x.getNombre(),x.getProvincia().getNombre())).toList();}
 @GetMapping("/airports") @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')") public List<AirportView> airports(@RequestParam(required=false) UUID provinceId,@RequestParam(defaultValue="") String q){List<Airport> found=provinceId==null?airports.findAll().stream().filter(x->Boolean.TRUE.equals(x.getActivo())&&x.getNombre().toLowerCase(Locale.ROOT).contains(q.trim().toLowerCase(Locale.ROOT))).limit(50).toList():airports.findTop50ByActivoTrueAndProvinciaReferencialIdAndNombreContainingIgnoreCaseOrderByNombreAsc(provinceId,q.trim());return found.stream().map(x->new AirportView(x.getId(),x.getCodigoOaci(),x.getCodigoIata(),x.getNombre(),x.getCiudad(),x.getTipo())).toList();}
 @GetMapping("/priorities") @PreAuthorize("hasAnyRole('DTS','OPERACIONES','CENTRO_OPERACIONES','COMANDANTE')") public List<PriorityView> priorities(){return priorities.findAll().stream().filter(x->Boolean.TRUE.equals(x.getActivo())).sorted(Comparator.comparing(FlightPriority::getOrden)).map(x->new PriorityView(x.getCodigo(),x.getNombre())).toList();}
 @PostMapping("/aircraft") @PreAuthorize("hasRole('ADMINISTRADOR')") @Transactional public AircraftView createAircraft(@Valid @RequestBody AircraftRequest r){Aircraft x=new Aircraft();x.setMatricula(r.matricula());x.setModelo(r.modelo());x.setTipo(r.tipo());x.setCapacidadPacientes(r.capacidadPacientes());x.setCapacidadTripulacion(r.capacidadTripulacion());x.setEquipamientoMedico(r.equipamientoMedico());aircraft.save(x);return new AircraftView(x.getId(),x.getMatricula(),x.getModelo(),x.getTipo());}
 @PostMapping("/airports") @PreAuthorize("hasRole('ADMINISTRADOR')") @Transactional public AirportView createAirport(@Valid @RequestBody AirportRequest r){Airport x=new Airport();x.setCodigoOaci(blank(r.codigoOaci()));x.setCodigoIata(blank(r.codigoIata()));x.setNombre(r.nombre());x.setCiudad(blank(r.ciudad()));x.setProvincia(blank(r.provincia()));x.setPais(r.pais()==null||r.pais().isBlank()?"Argentina":r.pais());airports.save(x);return new AirportView(x.getId(),x.getCodigoOaci(),x.getCodigoIata(),x.getNombre(),x.getCiudad(),x.getTipo());}
 private String blank(String value){return value==null||value.isBlank()?null:value.trim();}
 public record AircraftRequest(@NotBlank @Size(max=20) String matricula,@NotBlank @Size(max=100) String modelo,@NotBlank @Size(max=50) String tipo,@NotNull @Min(1) Short capacidadPacientes,@NotNull @Min(1) Short capacidadTripulacion,@Size(max=10000) String equipamientoMedico){}
 public record AirportRequest(@Size(max=4) String codigoOaci,@Size(max=3) String codigoIata,@NotBlank @Size(max=150) String nombre,@Size(max=100) String ciudad,@Size(max=100) String provincia,@Size(max=100) String pais){}
 public record AircraftView(UUID id,String matricula,String modelo,String tipo){} public record ProvinceView(UUID id,String codigoOficial,String nombre){} public record LocalityView(UUID id,String codigoOficial,String nombre,String provincia){} public record AirportView(UUID id,String codigoOaci,String codigoIata,String nombre,String ciudad,String tipo){} public record PriorityView(String codigo,String nombre){}
}
