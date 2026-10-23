package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.service.AuditSanitizer.Field;
import com.vuelossanitarios.backend.service.AuditSanitizer.Result;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Política de saneado de valores de auditoría: se aplica en el servidor antes de armar cualquier respuesta. */
class AuditSanitizerTest {
 private final ObjectMapper mapper=new ObjectMapper();
 private Map<String,Object> values(Result r){return AuditSanitizer.asMap(r);}

 @Test void sensitiveKeysAreMaskedAtAnyDepthButBooleanFlagsAreKept(){
  Result r=AuditSanitizer.flatten(mapper,"{\"passwordHash\":\"$2a$x\",\"estado\":\"OK\",\"anidado\":{\"Token\":\"abc\",\"diagnostico\":\"Dx\",\"claveAlmacenamiento\":\"k\"},\"temporaryPasswordIssued\":true,\"equipamientoMedico\":\"Camilla\"}","FLIGHT",null);
  Map<String,Object> v=values(r);
  assertEquals(AuditSanitizer.HIDDEN,v.get("passwordHash"));assertEquals(AuditSanitizer.HIDDEN,v.get("anidado.Token"));assertEquals(AuditSanitizer.HIDDEN,v.get("anidado.diagnostico"));assertEquals(AuditSanitizer.HIDDEN,v.get("anidado.claveAlmacenamiento"));
  assertEquals("OK",v.get("estado"));assertEquals(Boolean.TRUE,v.get("temporaryPasswordIssued"));assertEquals("Camilla",v.get("equipamientoMedico"),"el equipamiento de la aeronave no es un dato clínico");
  assertTrue(r.anyMasked());assertFalse(r.dropped());
 }

 @Test void theProfileWhitelistDropsEverythingElseAndSaysSo(){
  Result r=AuditSanitizer.flatten(mapper,"{\"estado\":\"APROBADO\",\"propuestaId\":9,\"salida\":\"2030-01-01T10:00\"}","SANITARY_REQUEST",Set.of("estado","salida"));
  assertEquals(Map.of("estado","APROBADO","salida","2030-01-01T10:00"),values(r));assertTrue(r.dropped());
  assertTrue(AuditSanitizer.flatten(mapper,"[1,2]","X",Set.of("estado")).dropped(),"un valor que no es objeto no pasa por una lista blanca");
 }

 @Test void credentialNumbersKeepOnlyTheLastFourCharacters(){
  Field f=AuditSanitizer.flatten(mapper,"{\"number\":\"AB-123456\"}","PROFESSIONAL_CREDENTIAL",null).fields().get(0);
  assertEquals("••••3456",f.value());assertTrue(f.masked());
  assertEquals("AB-123456",AuditSanitizer.flatten(mapper,"{\"number\":\"AB-123456\"}","OTHER",null).fields().get(0).value(),"sólo aplica a ese tipo de entidad");
 }

 @Test void malformedEmptyAndOversizedValuesAreHandledWithoutInventingData(){
  assertTrue(AuditSanitizer.flatten(mapper,"esto no es json","FLIGHT",null).unreadable());
  assertTrue(AuditSanitizer.flatten(mapper,null,"FLIGHT",null).empty());assertTrue(AuditSanitizer.flatten(mapper,"  ","FLIGHT",null).empty());assertTrue(AuditSanitizer.flatten(mapper,"null","FLIGHT",null).empty());
  Result big=AuditSanitizer.flatten(mapper,"{\"descripcion\":\""+"x".repeat(5000)+"\"}","FLIGHT_LOG",null);
  assertTrue(big.truncated());assertTrue(((String)big.fields().get(0).value()).length()<=AuditSanitizer.MAX_TEXT+1);
  StringBuilder many=new StringBuilder("{");for(int i=0;i<200;i++)many.append(i==0?"":",").append("\"k").append(i).append("\":").append(i);many.append("}");
  Result capped=AuditSanitizer.flatten(mapper,many.toString(),"FLIGHT",null);assertEquals(AuditSanitizer.MAX_FIELDS,capped.fields().size());assertTrue(capped.truncated());
 }
}
