package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

/**
 * Contrato numérico de la ruta: unidades y límites estructurales del modelo (altitud en pies, distancia en millas náuticas, tiempo en minutos),
 * sin ningún límite aeronáutico. Los máximos son los que la columna puede representar (DECIMAL(8,2): seis enteros y dos decimales; INT para
 * minutos). Además un número con parte decimal nunca se trunca en silencio a un entero (versión esperada y minutos).
 */
class FlightRouteInputContractTest {
 private final Validator validator=Validation.buildDefaultValidatorFactory().getValidator();
 private final ObjectMapper json=Jackson2ObjectMapperBuilder.json().build();

 private FlightRouteService.Input parse(String altitud,String distancia,String minutos)throws Exception{
  return json.readValue("{\"version\":0,\"recorrido\":\"Directo\""+(altitud==null?"":",\"altitudPies\":"+altitud)+(distancia==null?"":",\"distanciaNm\":"+distancia)+(minutos==null?"":",\"tiempoEstimadoMinutos\":"+minutos)+"}",FlightRouteService.Input.class);
 }
 private boolean valid(String altitud,String distancia,String minutos){
  try{return validator.validate(parse(altitud,distancia,minutos)).isEmpty();}catch(Exception e){return false;}
 }

 @Test void theThreeMeasuresAreOptional()throws Exception{
  FlightRouteService.Input input=parse(null,null,null);
  assertNull(input.altitudPies());assertNull(input.distanciaNm());assertNull(input.tiempoEstimadoMinutos());assertTrue(validator.validate(input).isEmpty());
  assertTrue(valid("null","null","null"));
 }
 @Test void altitudeAcceptsZeroAndTheRepresentableMaximumButNotNegativesExcessOrExtraPrecision(){
  assertTrue(valid("0",null,null));assertTrue(valid("0.00",null,null));assertTrue(valid("9000.5",null,null));assertTrue(valid("999999.99",null,null));
  assertFalse(valid("-0.01",null,null));assertFalse(valid("-1",null,null));assertFalse(valid("1000000",null,null));assertFalse(valid("999999.999",null,null));assertFalse(valid("12.345",null,null));assertFalse(valid("\"abc\"",null,null));
 }
 @Test void distanceNeedsAtLeastOneHundredthAndFitsTheColumn(){
  assertFalse(valid(null,"0",null));assertFalse(valid(null,"0.00",null));assertFalse(valid(null,"-5",null));assertFalse(valid(null,"0.001",null));
  assertTrue(valid(null,"0.01",null));assertTrue(valid(null,"640.5",null));assertTrue(valid(null,"999999.99",null));
  assertFalse(valid(null,"1000000",null));assertFalse(valid(null,"999999.999",null));assertFalse(valid(null,"\"x\"",null));
 }
 @Test void durationIsAWholeNumberOfMinutesFromOneUpToTheIntegerRange(){
  assertFalse(valid(null,null,"0"));assertFalse(valid(null,null,"-1"));
  assertTrue(valid(null,null,"1"));assertTrue(valid(null,null,"95"));assertTrue(valid(null,null,"2147483647"));
  assertFalse(valid(null,null,"2147483648"),"fuera del rango entero");assertFalse(valid(null,null,"\"x\""));
 }
 @Test void aFractionalNumberIsNeverTruncatedIntoAWholeValue(){
  assertFalse(valid(null,null,"1.5"),"1.5 minutos no puede guardarse como 1");assertFalse(valid(null,null,"95.9"));assertFalse(valid(null,null,"95.0"));
  assertThrows(JsonMappingException.class,()->json.readValue("{\"version\":1.7,\"recorrido\":\"Directo\"}",FlightRouteService.Input.class),"la versión esperada tampoco se trunca");
  assertThrows(JsonMappingException.class,()->json.readValue("{\"version\":1.2}",FlightRouteService.Submit.class));
  assertThrows(JsonMappingException.class,()->json.readValue("{\"version\":2.5,\"motivo\":\"Falta algo importante\"}",FlightRouteService.Return.class));
  assertThrows(JsonMappingException.class,()->json.readValue("{\"version\":2.5}",FlightRouteService.Approve.class));
 }
 @Test void wholeNumbersAreBoundExactly()throws Exception{
  FlightRouteService.Input input=parse("9000.50","640.5","95");
  assertEquals(0,new BigDecimal("9000.50").compareTo(input.altitudPies()));assertEquals(95,input.tiempoEstimadoMinutos());assertEquals(0,input.version());
 }
}
