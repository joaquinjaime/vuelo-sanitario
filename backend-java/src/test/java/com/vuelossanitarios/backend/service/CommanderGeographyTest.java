package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;

import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import org.junit.jupiter.api.Test;

/** Regla provincial pura: jurisdicción del comandante contra la del aeropuerto de salida, sin localidades. */
class CommanderGeographyTest {
 private static Province province(long id,String name){Province p=new Province();p.setId(id);p.setNombre(name);return p;}
 private static CommanderProfile at(Province p){CommanderProfile c=new CommanderProfile();c.setProvinciaActual(p);return c;}
 private static CommanderGeography.Departure departure(Province p,boolean preliminary){return new CommanderGeography.Departure(p.getId(),p.getNombre(),preliminary?null:7L,preliminary?null:"Aeropuerto",preliminary?CommanderGeography.SOURCE_PATIENT_PROVINCE:CommanderGeography.SOURCE_CONFIRMED_AIRPORT,preliminary);}
 private final Province tucuman=province(1,"Tucumán"),cordoba=province(2,"Córdoba"),caba=province(3,"Ciudad Autónoma de Buenos Aires"),pba=province(4,"Buenos Aires");

 @Test void theSameProvinceIsOrdinary(){
  var a=CommanderGeography.assess(at(tucuman),departure(tucuman,false));
  assertTrue(a.ordinary());assertEquals(CommanderGeography.SAME_JURISDICTION,a.code());assertNull(a.exceptionType());assertEquals("Tucumán",a.province());
 }
 @Test void anotherProvinceNeedsAnException(){
  var a=CommanderGeography.assess(at(cordoba),departure(tucuman,false));
  assertFalse(a.ordinary());assertEquals("OTRA_PROVINCIA",a.exceptionType());assertTrue(a.message().contains("Córdoba")&&a.message().contains("Tucumán"));
 }
 @Test void cabaAndBuenosAiresAreNotEquivalentInEitherDirection(){
  assertFalse(CommanderGeography.assess(at(pba),departure(caba,false)).ordinary());
  assertFalse(CommanderGeography.assess(at(caba),departure(pba,false)).ordinary());
  assertTrue(CommanderGeography.assess(at(caba),departure(caba,false)).ordinary());assertTrue(CommanderGeography.assess(at(pba),departure(pba,false)).ordinary());
 }
 @Test void anUnknownLocationIsNeverOrdinaryAndNoLocalityIsInvolved(){
  var a=CommanderGeography.assess(new CommanderProfile(),departure(tucuman,false));
  assertFalse(a.ordinary());assertEquals("UBICACION_DESCONOCIDA",a.exceptionType());assertFalse(CommanderGeography.assess(null,departure(tucuman,false)).ordinary());
 }
 @Test void aPreliminaryDepartureWarnsAndAConfirmedOneDoesNot(){
  assertNotNull(departure(tucuman,true).warning());assertTrue(departure(tucuman,true).warning().contains("provincia donde se encuentra el paciente"));assertNull(departure(tucuman,false).warning());
 }
}
