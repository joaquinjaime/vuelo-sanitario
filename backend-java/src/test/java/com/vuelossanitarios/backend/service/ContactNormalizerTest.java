package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;

import com.vuelossanitarios.backend.domain.person.ContactNormalizer;
import org.junit.jupiter.api.Test;

class ContactNormalizerTest {
 @Test void emailsAreComparedWithoutCaseOrOuterSpaces(){
  assertEquals("ana@example.test",ContactNormalizer.email("  ANA@Example.TEST "));
 }
 @Test void legacyPhoneCleaningOnlyDropsSeparatorsForMasksAndOldData(){
  assertEquals("+543815551234",ContactNormalizer.phone(" +54 (381) 555-1234 "));
  assertEquals("3815551234",ContactNormalizer.phone("381.555.1234"));
 }
 @Test void emailsAcceptLegitimateAddressesIncludingPlusTagsDotsAndInternationalDomains(){
  for(String ok:new String[]{"ana.paz+vuelos@sub.example.test","a@b.co","first.last@example.com","o'brien@example.ie","user_name-1@mail-server.example.org","x@xn--bcher-kva.example","info@bücher.example","UPPER@Example.COM","a+b+c@example.test","usuario-inventado@dominio-real.com","12345@example.test","a!#$%&*+/=?^_{|}~-b@example.test"})
   assertTrue(ContactNormalizer.validEmail(ok),ok+": "+ContactNormalizer.emailProblem(ok));
  assertEquals("ana.paz+vuelos@example.test",ContactNormalizer.email("Ana.Paz+Vuelos@Example.test"),"no se eliminan puntos ni etiquetas +");
 }
 @Test void emailsRejectMalformedControlAndMaliciousInput(){
  String[] bad={null,"","  ","ana","ana@","@example.test","ana@example","ana@example.","ana@.example.test","ana@example..test","ana@-example.test","ana@example-.test","ana@exam ple.test","a na@example.test","ana@@example.test","ana@example.t",
   ".ana@example.test","ana.@example.test","an..a@example.test","ana@example.123","ana@example.c0m","\"ana\"@example.test","ana<script>@example.test","ana@example.test>","ana,luis@example.test","ana;luis@example.test","ana@example.test,luis@example.test",
   "ana\u0000@example.test","ana\n@example.test","ana@example.test\r\nBcc: x@y.test","ana\t@example.test","ana(comentario)@example.test","ana@[127.0.0.1]","ana\\@example.test","ñandú@example.test",
   "a".repeat(65)+"@example.test","ana@"+"a".repeat(64)+".test","a".repeat(150)+"@example.test","ana@"+"a.".repeat(80)+"test"};
  for(String value:bad)assertFalse(ContactNormalizer.validEmail(value),String.valueOf(value));
  assertEquals("Ingrese un correo electrónico",ContactNormalizer.emailProblem(" "));
  assertTrue(ContactNormalizer.emailProblem("a b@example.test").contains("espacios"));
  assertTrue(ContactNormalizer.emailProblem("a".repeat(151)).contains("150"));
 }
 @Test void contactTypeDefaultsToPersonalAndRejectsUnknownValues(){
  assertEquals("PERSONAL",ContactNormalizer.type(null));assertEquals("PERSONAL",ContactNormalizer.type(" "));
  assertEquals("LABORAL",ContactNormalizer.type(" laboral "));assertNull(ContactNormalizer.type("SECRETO"));
 }
 @Test void auditMasksKeepOnlyWhatIdentifiesTheContact(){
  assertEquals("a***@example.test",ContactNormalizer.maskEmail("Ana.Privada@Example.test"));assertEquals("***",ContactNormalizer.maskEmail("sin-arroba"));
  assertEquals("*********234",ContactNormalizer.maskPhone("+54 381 555 1234").substring(1));assertEquals("123",ContactNormalizer.maskPhone("123"));
 }
}
