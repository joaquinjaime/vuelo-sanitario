package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.domain.catalog.Locality;
import com.vuelossanitarios.backend.domain.flight.CommanderGeographicException;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;

/**
 * Regla geográfica ordinaria de la asignación de un comandante: debe estar registrado en la localidad de salida de la solicitud. Estar en la misma
 * provincia NO equivale a estar en la misma ciudad, y una ubicación desconocida, incompleta o deshabilitada no es elegible de forma ordinaria. No hay radios
 * de cobertura ni aeropuertos cercanos: la política del proyecto no los define, de modo que cualquier otra situación sólo se admite como excepción justificada.
 */
public final class CommanderGeography {
 private CommanderGeography(){}
 public static final String SAME_LOCALITY="MISMA_LOCALIDAD";
 /** code: MISMA_LOCALIDAD (ordinaria) o el tipo de excepción que haría falta (CommanderGeographicException.*). */
 public record Assessment(boolean ordinary,String code,String message,Long localityId,String locality,Long provinceId,String province){
  public String exceptionType(){return ordinary?null:code;}
 }
 public static Assessment assess(CommanderProfile profile,Locality departure){
  var province=profile==null?null:profile.getProvinciaActual();var locality=profile==null?null:profile.getLocalidadActual();
  Long provinceId=province==null?null:province.getId();String provinceName=province==null?null:province.getNombre();
  if(locality==null){
   if(province==null)return new Assessment(false,CommanderGeographicException.UNKNOWN,"No tiene una ubicación operativa registrada",null,null,null,null);
   return new Assessment(false,CommanderGeographicException.INCOMPLETE,"Sólo tiene registrada la provincia ("+provinceName+"); falta la localidad",null,null,provinceId,provinceName);
  }
  Long id=locality.getId();String name=locality.getNombre();
  if(!Boolean.TRUE.equals(locality.getActivo()))return new Assessment(false,CommanderGeographicException.DISABLED,"La localidad registrada ("+name+") fue deshabilitada",id,name,provinceId,provinceName);
  if(departure!=null&&id.equals(departure.getId()))return new Assessment(true,SAME_LOCALITY,"Se encuentra en la localidad de salida ("+name+")",id,name,provinceId,provinceName);
  String where=name+", "+provinceName,from=departure==null?"la localidad de salida":departure.getNombre()+", "+departure.getProvincia().getNombre();
  boolean sameProvince=departure!=null&&provinceId!=null&&provinceId.equals(departure.getProvincia().getId());
  return new Assessment(false,sameProvince?CommanderGeographicException.OTHER_LOCALITY:CommanderGeographicException.OTHER_PROVINCE,"Se encuentra en "+where+" y el vuelo sale de "+from,id,name,provinceId,provinceName);
 }
}
