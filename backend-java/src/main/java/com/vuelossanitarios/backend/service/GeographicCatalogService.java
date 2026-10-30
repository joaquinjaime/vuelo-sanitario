package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.GeographicCatalogDtos.*;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.*;

/**
 * Mantenimiento seguro del catálogo geográfico. No hay borrado físico: los vuelos y las rutas conservan sus FKs históricas.
 * <p>
 * Bajas: una referencia HISTÓRICA (vuelos cerrados, versiones de ruta anteriores, hangar, solicitudes cerradas) no impide la baja lógica; una referencia
 * VIGENTE (vuelo abierto, ruta vigente con el aeropuerto como alternativo, aeronave activa ubicada allí, solicitud abierta, jerarquía activa) sí, con 409.
 * La clasificación está en {@link GeographicDependencyService}. Concurrencia: cada operación bloquea las filas que escribe o de las que depende, siempre
 * en el orden provincia → localidad → aeropuerto, y la baja de un aeropuerto cuenta sus referencias DESPUÉS de bloquearlo, mientras que toda operación
 * que empieza a usarlo lo bloquea antes ({@link AirportLocks}): una de las dos se completa primero y la otra observa su resultado confirmado.
 */
@Service public class GeographicCatalogService {
 private final ProvinceRepository provinces; private final LocalityRepository localities; private final AirportRepository airports; private final UserRepository users; private final AuditService audit; private final ObjectMapper json; private final GeographicDependencyService dependencies;
 public GeographicCatalogService(ProvinceRepository p,LocalityRepository l,AirportRepository a,UserRepository u,AuditService au,ObjectMapper j,GeographicDependencyService d){provinces=p;localities=l;airports=a;users=u;audit=au;json=j;dependencies=d;}
 private ApiException bad(String m){return new ApiException(HttpStatus.BAD_REQUEST,m);} private ApiException conflict(String c,String m){return new ApiException(HttpStatus.CONFLICT,c,m,Map.of());}
 private User actor(Long id){return users.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));}
 private String value(String v){return v==null?null:v.trim();} private String required(String v){return value(v);}
 private String code(String v){return value(v)==null?null:value(v).toUpperCase(Locale.ROOT);}
 private String json(Object v){try{return json.writeValueAsString(v);}catch(JsonProcessingException e){throw new IllegalStateException(e);}}
 /** Provincia activa y bloqueada: el primer eslabón del orden de bloqueo; nadie puede darla de baja mientras se escribe un hijo suyo. */
 private Province province(Long id){return provinces.lockById(id).filter(x->Boolean.TRUE.equals(x.getActivo())).orElseThrow(()->bad("Seleccione una provincia activa válida"));}
 private Locality locality(Long id,Province p){if(id==null)return null;Locality l=localities.lockById(id).filter(x->Boolean.TRUE.equals(x.getActivo())).orElseThrow(()->bad("Seleccione una localidad activa válida"));if(!l.getProvincia().getId().equals(p.getId()))throw bad("La localidad debe pertenecer a la provincia indicada");return l;}
 private Pageable page(int page,int size){return PageRequest.of(Math.max(0,page),Math.max(5,Math.min(100,size)),Sort.by("nombre").ascending());}
 private <T,R> PageView<R> page(Page<T> source,java.util.function.Function<T,R> map){return new PageView<>(source.getContent().stream().map(map).toList(),source.getNumber(),source.getSize(),source.getTotalElements(),source.getTotalPages());}
 @Transactional(readOnly=true) public PageView<ProvinceAdminView> provinces(String q,int page,int size){Page<Province> pg=provinces.search(value(q)==null?"":value(q),page(page,size));Map<Long,DependencyView> d=dependencies.provinces(pg.getContent().stream().map(Province::getId).toList());return page(pg,p->view(p,d.get(p.getId())));}
 @Transactional(readOnly=true) public PageView<LocalityAdminView> localities(String q,int page,int size){Page<Locality> pg=localities.search(value(q)==null?"":value(q),page(page,size));Map<Long,DependencyView> d=dependencies.localities(pg.getContent().stream().map(Locality::getId).toList());return page(pg,l->view(l,d.get(l.getId())));}
 @Transactional(readOnly=true) public PageView<AirportAdminView> airports(String q,int page,int size){Page<Airport> pg=airports.search(value(q)==null?"":value(q),page(page,size));Map<Long,DependencyView> d=dependencies.airports(pg.getContent().stream().map(Airport::getId).toList());return page(pg,a->view(a,d.get(a.getId())));}
 @Transactional public ProvinceAdminView createProvince(ProvinceRequest r,Long actorId){String c=code(r.codigoOficial()),n=required(r.nombre());if(provinces.existsByCodigoOficialIgnoreCase(c)||provinces.existsByNombreIgnoreCase(n))throw conflict("DUPLICATE_GEOGRAPHIC_CODE","Ya existe una provincia con ese código o nombre");Province p=new Province();p.setCodigoOficial(c);p.setNombre(n);p.setActivo(true);try{provinces.saveAndFlush(p);}catch(DataIntegrityViolationException e){throw conflict("DUPLICATE_GEOGRAPHIC_CODE","Ya existe una provincia con ese código o nombre");}audit.record(null,actor(actorId),"GEOGRAPHIC_PROVINCE",p.getId(),"CREATE",null,json(view(p,null)));return view(p,dependencies.provinces(List.of(p.getId())).get(p.getId()));}
 @Transactional public ProvinceAdminView updateProvince(Long id,ProvinceRequest r,Long actorId){Province p=provinces.lockById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Provincia inexistente"));String c=code(r.codigoOficial()),n=required(r.nombre());if(provinces.existsByCodigoOficialIgnoreCaseAndIdNot(c,id)||provinces.existsByNombreIgnoreCaseAndIdNot(n,id))throw conflict("DUPLICATE_GEOGRAPHIC_CODE","Ya existe una provincia con ese código o nombre");var before=view(p,null);p.setCodigoOficial(c);p.setNombre(n);try{provinces.saveAndFlush(p);}catch(DataIntegrityViolationException e){throw conflict("DUPLICATE_GEOGRAPHIC_CODE","Ya existe una provincia con ese código o nombre");}audit.record(null,actor(actorId),"GEOGRAPHIC_PROVINCE",id,"UPDATE",json(before),json(view(p,null)));return view(p,dependencies.provinces(List.of(id)).get(id));}
 @Transactional public ProvinceAdminView setProvinceActive(Long id,ActiveRequest r,Long actorId){
  Province p=provinces.lockById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Provincia inexistente"));
  if(Boolean.TRUE.equals(p.getActivo())==r.activo())throw conflict("GEOGRAPHIC_STATE_UNCHANGED","La provincia ya tiene ese estado");
  DependencyView d=dependencies.provinces(List.of(id)).get(id);if(!r.activo())requireDeactivable(d,Map.of());
  var before=view(p,null);p.setActivo(r.activo());audit.record(null,actor(actorId),"GEOGRAPHIC_PROVINCE",id,"SET_ACTIVE",json(before),json(state(r.activo(),r.motivo(),d)));return view(p,dependencies.provinces(List.of(id)).get(id));
 }
 @Transactional public LocalityAdminView createLocality(LocalityRequest r,Long actorId){Province p=province(r.provinciaId());String c=code(r.codigoOficial()),n=required(r.nombre());if(localities.existsByCodigoOficialIgnoreCase(c)||localities.existsByProvincia_IdAndNombreIgnoreCase(p.getId(),n))throw conflict("DUPLICATE_GEOGRAPHIC_CODE","Ya existe una localidad con ese código o nombre en la provincia");Locality l=new Locality();l.setCodigoOficial(c);l.setNombre(n);l.setProvincia(p);l.setActivo(true);try{localities.saveAndFlush(l);}catch(DataIntegrityViolationException e){throw conflict("DUPLICATE_GEOGRAPHIC_CODE","Ya existe una localidad con ese código o nombre en la provincia");}audit.record(null,actor(actorId),"GEOGRAPHIC_LOCALITY",l.getId(),"CREATE",null,json(view(l,null)));return view(l,dependencies.localities(List.of(l.getId())).get(l.getId()));}
 @Transactional public LocalityAdminView updateLocality(Long id,LocalityRequest r,Long actorId){
  Province p=province(r.provinciaId());Locality l=localities.lockById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Localidad inexistente"));String c=code(r.codigoOficial()),n=required(r.nombre());
  if(localities.existsByCodigoOficialIgnoreCaseAndIdNot(c,id)||localities.existsByProvincia_IdAndNombreIgnoreCaseAndIdNot(p.getId(),n,id))throw conflict("DUPLICATE_GEOGRAPHIC_CODE","Ya existe una localidad con ese código o nombre en la provincia");
  if(!l.getProvincia().getId().equals(p.getId())){DependencyView d=dependencies.localities(List.of(id)).get(id);if(!d.vigentes().isEmpty())throw operational("No puede cambiarse la provincia de la localidad: "+d.motivoBloqueo().substring("No puede desactivarse: ".length()),d,Map.of());}
  var before=view(l,null);l.setCodigoOficial(c);l.setNombre(n);l.setProvincia(p);try{localities.saveAndFlush(l);}catch(DataIntegrityViolationException e){throw conflict("DUPLICATE_GEOGRAPHIC_CODE","Ya existe una localidad con ese código o nombre en la provincia");}audit.record(null,actor(actorId),"GEOGRAPHIC_LOCALITY",id,"UPDATE",json(before),json(view(l,null)));return view(l,dependencies.localities(List.of(id)).get(id));
 }
 @Transactional public LocalityAdminView setLocalityActive(Long id,ActiveRequest r,Long actorId){
  Long provinceId=r.activo()?localities.provinceIdOf(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Localidad inexistente")):null;
  Province parent=provinceId==null?null:provinces.lockById(provinceId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Provincia inexistente"));
  Locality l=localities.lockById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Localidad inexistente"));
  if(Boolean.TRUE.equals(l.getActivo())==r.activo())throw conflict("GEOGRAPHIC_STATE_UNCHANGED","La localidad ya tiene ese estado");
  if(r.activo()&&(!l.getProvincia().getId().equals(provinceId)||!Boolean.TRUE.equals(parent.getActivo())))throw conflict("GEOGRAPHIC_PARENT_INACTIVE","No se puede reactivar la localidad: su provincia está inactiva o cambió. Reactive primero la provincia y reintente");
  DependencyView d=dependencies.localities(List.of(id)).get(id);if(!r.activo())requireDeactivable(d,Map.of());
  var before=view(l,null);l.setActivo(r.activo());audit.record(null,actor(actorId),"GEOGRAPHIC_LOCALITY",id,"SET_ACTIVE",json(before),json(state(r.activo(),r.motivo(),d)));return view(l,dependencies.localities(List.of(id)).get(id));
 }
 @Transactional public AirportAdminView createAirport(AirportRequest r,Long actorId){Province p=province(r.provinciaId());Locality l=locality(r.localidadId(),p);Airport a=new Airport();write(a,r,p,l);assertUnique(a,null);a.setActivo(true);try{airports.saveAndFlush(a);}catch(DataIntegrityViolationException e){throw conflict("DUPLICATE_AIRPORT_CODE","Ya existe un aeropuerto con alguno de esos códigos");}audit.record(null,actor(actorId),"GEOGRAPHIC_AIRPORT",a.getId(),"CREATE",null,json(view(a,null)));return view(a,dependencies.airports(List.of(a.getId())).get(a.getId()));}
 @Transactional public AirportAdminView updateAirport(Long id,AirportRequest r,Long actorId){
  Province p=province(r.provinciaId());Locality l=locality(r.localidadId(),p);Airport a=airports.lockById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Aeropuerto inexistente"));
  if(a.getProvinciaReferencial()!=null&&!a.getProvinciaReferencial().getId().equals(p.getId())){DependencyView d=dependencies.airports(List.of(id)).get(id);if(!d.vigentes().isEmpty())throw operational("No puede cambiarse la provincia del aeropuerto: "+d.motivoBloqueo().substring("No puede desactivarse: ".length()),d,Map.of("vuelos",dependencies.openFlightCodes(id,10)));}
  var before=view(a,null);write(a,r,p,l);assertUnique(a,id);try{airports.saveAndFlush(a);}catch(DataIntegrityViolationException e){throw conflict("DUPLICATE_AIRPORT_CODE","Ya existe un aeropuerto con alguno de esos códigos");}audit.record(null,actor(actorId),"GEOGRAPHIC_AIRPORT",id,"UPDATE",json(before),json(view(a,null)));return view(a,dependencies.airports(List.of(id)).get(id));
 }
 @Transactional public AirportAdminView setAirportActive(Long id,ActiveRequest r,Long actorId){
  Province parentProvince=null;Locality parentLocality=null;Long provinceId=null,localityId=null;
  if(r.activo()){
   List<Object[]> peek=airports.parentIds(id);if(peek.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"Aeropuerto inexistente");
   provinceId=(Long)peek.get(0)[0];localityId=(Long)peek.get(0)[1];
   if(provinceId!=null)parentProvince=provinces.lockById(provinceId).orElse(null);if(localityId!=null)parentLocality=localities.lockById(localityId).orElse(null);
  }
  Airport a=airports.lockById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Aeropuerto inexistente"));
  if(Boolean.TRUE.equals(a.getActivo())==r.activo())throw conflict("GEOGRAPHIC_STATE_UNCHANGED","El aeropuerto ya tiene ese estado");
  if(r.activo()){
   Long currentProvince=a.getProvinciaReferencial()==null?null:a.getProvinciaReferencial().getId(),currentLocality=a.getLocalidad()==null?null:a.getLocalidad().getId();
   if(!Objects.equals(provinceId,currentProvince)||!Objects.equals(localityId,currentLocality))throw conflict("CONCURRENT_MODIFICATION","El aeropuerto cambió mientras se procesaba la operación; reintente");
   if(parentProvince==null||!Boolean.TRUE.equals(parentProvince.getActivo())||(parentLocality!=null&&(!Boolean.TRUE.equals(parentLocality.getActivo())||!parentLocality.getProvincia().getId().equals(provinceId))))throw conflict("GEOGRAPHIC_PARENT_INACTIVE","No se puede reactivar el aeropuerto: su provincia o localidad está inactiva (o no se corresponden). Reactive primero la jerarquía geográfica");
  }
  DependencyView d=dependencies.airports(List.of(id)).get(id);if(!r.activo())requireDeactivable(d,Map.of("vuelos",dependencies.openFlightCodes(id,10)));
  var before=view(a,null);a.setActivo(r.activo());audit.record(null,actor(actorId),"GEOGRAPHIC_AIRPORT",id,"SET_ACTIVE",json(before),json(state(r.activo(),r.motivo(),d)));return view(a,dependencies.airports(List.of(id)).get(id));
 }
 /** Una baja con referencias vigentes se rechaza; las históricas se conservan y sólo se informan. */
 private void requireDeactivable(DependencyView d,Map<String,Object> extra){if(!d.puedeDesactivar())throw operational(d.motivoBloqueo(),d,extra);}
 private ApiException operational(String message,DependencyView d,Map<String,Object> extra){
  boolean hierarchy=GeographicDependencyService.HIERARCHY.containsAll(d.vigentes().keySet());
  Map<String,Object> details=new LinkedHashMap<>();details.put("vigentes",d.vigentes());details.put("historicas",d.historicas());details.putAll(extra);
  return new ApiException(HttpStatus.CONFLICT,hierarchy?"GEOGRAPHIC_HAS_ACTIVE_DEPENDENCIES":"GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES",message,details);
 }
 private void write(Airport a,AirportRequest r,Province p,Locality l){a.setCodigoOficial(code(r.codigoOficial()));a.setCodigoOaci(code(r.codigoOaci()));a.setCodigoIata(code(r.codigoIata()));a.setNombre(required(r.nombre()));a.setCiudad(value(r.ciudad()));a.setProvincia(p.getNombre());a.setProvinciaReferencial(p);a.setLocalidad(l);a.setTipo(value(r.tipo()));a.setPais(required(r.pais()));a.setLatitud(r.latitud());a.setLongitud(r.longitud());}
 private void assertUnique(Airport a,Long id){if(a.getCodigoOficial()!=null&&(id==null?airports.existsByCodigoOficialIgnoreCase(a.getCodigoOficial()):airports.existsByCodigoOficialIgnoreCaseAndIdNot(a.getCodigoOficial(),id)))throw conflict("DUPLICATE_AIRPORT_CODE","El código oficial ya está registrado");if(a.getCodigoOaci()!=null&&(id==null?airports.existsByCodigoOaciIgnoreCase(a.getCodigoOaci()):airports.existsByCodigoOaciIgnoreCaseAndIdNot(a.getCodigoOaci(),id)))throw conflict("DUPLICATE_AIRPORT_CODE","El código OACI ya está registrado");if(a.getCodigoIata()!=null&&(id==null?airports.existsByCodigoIataIgnoreCase(a.getCodigoIata()):airports.existsByCodigoIataIgnoreCaseAndIdNot(a.getCodigoIata(),id)))throw conflict("DUPLICATE_AIRPORT_CODE","El código IATA ya está registrado");}
 /** Auditoría de la baja/reactivación: además del motivo, deja constancia de las referencias históricas que se conservaron. */
 private Map<String,Object> state(boolean active,String reason,DependencyView d){Map<String,Object> v=new LinkedHashMap<>();v.put("activo",active);v.put("motivo",value(reason));if(d!=null&&!d.historicas().isEmpty())v.put("referenciasHistoricasConservadas",d.historicas());return v;}
 private ProvinceAdminView view(Province p,DependencyView d){return new ProvinceAdminView(p.getId(),p.getCodigoOficial(),p.getNombre(),Boolean.TRUE.equals(p.getActivo()),d);} private LocalityAdminView view(Locality l,DependencyView d){return new LocalityAdminView(l.getId(),l.getCodigoOficial(),l.getNombre(),l.getProvincia().getId(),l.getProvincia().getNombre(),Boolean.TRUE.equals(l.getActivo()),d);} private AirportAdminView view(Airport a,DependencyView d){Province p=a.getProvinciaReferencial();Locality l=a.getLocalidad();return new AirportAdminView(a.getId(),a.getCodigoOficial(),a.getCodigoOaci(),a.getCodigoIata(),a.getNombre(),a.getCiudad(),p==null?null:p.getId(),p==null?null:p.getNombre(),l==null?null:l.getId(),l==null?null:l.getNombre(),a.getTipo(),a.getPais(),a.getLatitud(),a.getLongitud(),Boolean.TRUE.equals(a.getActivo()),d);}
}
