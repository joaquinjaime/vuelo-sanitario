package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.flight.CommanderGeographicException;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;

/**
 * Regla geográfica ordinaria de la asignación de un comandante (V64): debe encontrarse en la misma jurisdicción (provincia o Ciudad Autónoma de Buenos Aires) que el
 * aeropuerto desde el que despegará físicamente el vuelo. NO se compara con la localidad del paciente (que es la necesidad sanitaria, no el aeropuerto) ni se exige una
 * localidad del comandante. CABA y la provincia de Buenos Aires son jurisdicciones distintas. Una ubicación desconocida o una jurisdicción distinta sólo se admiten como
 * excepción explícita, justificada y autorizada por Centro de Operaciones.
 */
public final class CommanderGeography {
 private CommanderGeography(){}
 public static final String SAME_JURISDICTION="MISMA_JURISDICCION";
 public static final String SOURCE_CONFIRMED_AIRPORT="AEROPUERTO_CONFIRMADO",SOURCE_PROPOSED_AIRPORT="AEROPUERTO_PROPUESTO",SOURCE_PATIENT_PROVINCE="PROVINCIA_DEL_PACIENTE";
 /**
  * Jurisdicción desde la que despegará (o se prevé que despegue) el vuelo y con qué dato se conoce. {@code preliminary}: todavía no hay aeropuerto de salida confirmado
  * (se usó la provincia del paciente o un aeropuerto sólo propuesto): la elegibilidad es orientativa y se vuelve a verificar al confirmar el aeropuerto.
  */
 public record Departure(Long provinceId,String province,Long airportId,String airport,String source,boolean preliminary){
  public String warning(){
   if(!preliminary)return null;
   return SOURCE_PATIENT_PROVINCE.equals(source)
    ?"Todavía no hay aeropuerto de salida: los candidatos son preliminares y se calcularon con la provincia donde se encuentra el paciente ("+province+"). Se verificarán de nuevo cuando se confirme el aeropuerto."
    :"El aeropuerto de salida ("+airport+", "+province+") está propuesto pero no confirmado: los candidatos son preliminares y se verificarán de nuevo cuando el comandante lo confirme.";
  }
 }
 /** code: MISMA_JURISDICCION (ordinaria) o el tipo de excepción que haría falta (UBICACION_DESCONOCIDA, OTRA_PROVINCIA). */
 public record Assessment(boolean ordinary,String code,String message,Long provinceId,String province){
  public String exceptionType(){return ordinary?null:code;}
 }
 public static Assessment assess(CommanderProfile profile,Departure departure){
  Province province=profile==null?null:profile.getProvinciaActual();
  if(province==null)return new Assessment(false,CommanderGeographicException.UNKNOWN,"No tiene una ubicación operativa registrada",null,null);
  Long id=province.getId();String name=province.getNombre();
  if(departure!=null&&id.equals(departure.provinceId()))return new Assessment(true,SAME_JURISDICTION,"Se encuentra en la jurisdicción del aeropuerto de salida ("+name+")",id,name);
  String from=departure==null?"la jurisdicción de salida":departure.province();
  return new Assessment(false,CommanderGeographicException.OTHER_PROVINCE,"Se encuentra en "+name+" y el vuelo sale de "+from,id,name);
 }
}
