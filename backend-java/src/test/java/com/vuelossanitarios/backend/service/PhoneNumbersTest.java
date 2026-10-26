package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;

import com.vuelossanitarios.backend.domain.person.PhoneNumbers;
import com.vuelossanitarios.backend.domain.person.PhoneNumbers.Parsed;
import com.vuelossanitarios.backend.domain.person.PhoneNumbers.Rejected;
import org.junit.jupiter.api.Test;

/** Reglas internacionales de numeración (libphonenumber): el país elegido decide qué es válido. */
class PhoneNumbersTest {
 private static String reason(String raw,String country){return assertThrows(Rejected.class,()->PhoneNumbers.parse(raw,country)).reason();}

 @Test void argentinaAcceptsNationalAndInternationalFormsAndMobileConventions() {
  Parsed fixed=PhoneNumbers.parse("0381 555-1234","AR");
  assertEquals("+543815551234",fixed.e164());assertEquals("AR",fixed.region());assertEquals(54,fixed.callingCode());assertEquals("+54 381 555-1234",fixed.international());
  assertEquals("+543815551234",PhoneNumbers.parse("+54 381 555-1234","AR").e164());
  assertEquals("+543815551234",PhoneNumbers.parse("(381) 555-1234","ar").e164(),"el código de país no distingue mayúsculas");
  // móviles: 0 troncal y 15; el E.164 argentino lleva 9 después del +54
  assertEquals("+5493815551234",PhoneNumbers.parse("0381 15 555-1234","AR").e164());
  assertEquals("+5491155551234",PhoneNumbers.parse("011 15 5555-1234","AR").e164());
  assertEquals("+5491155551234",PhoneNumbers.parse("+54 9 11 5555-1234","AR").e164());
  assertEquals("+541155551234",PhoneNumbers.parse("11 5555 1234","AR").e164(),"sin 15 ni 9 es una línea fija de Buenos Aires: no se agrega un 9");
 }

 @Test void equivalentFormsProduceTheSameCanonicalNumber() {
  String a=PhoneNumbers.parse("011 15 5555-1234","AR").e164(),b=PhoneNumbers.parse("+5491155551234","AR").e164(),c=PhoneNumbers.parse("+54 (9) 11-5555.1234","AR").e164();
  assertEquals(a,b);assertEquals(b,c);
 }

 @Test void otherCountriesFollowTheirOwnPlans() {
  assertEquals("+56987654321",PhoneNumbers.parse("9 8765 4321","CL").e164());
  assertEquals("+5511987654321",PhoneNumbers.parse("(11) 98765-4321","BR").e164());
  assertEquals("+34612345678",PhoneNumbers.parse("612 34 56 78","ES").e164());
  assertEquals("+12025550123",PhoneNumbers.parse("(202) 555-0123","US").e164());
  assertEquals("+14165550123",PhoneNumbers.parse("416 555 0123","CA").e164());
  assertEquals("+442079460958",PhoneNumbers.parse("020 7946 0958","GB").e164());
  assertEquals("+59899123456",PhoneNumbers.parse("099 123 456","UY").e164());
 }

 @Test void sharedCallingCodeIsDecidedByTheSelectedRegionNotByThePrefix() {
  assertEquals("+14165550123",PhoneNumbers.parse("+1 416 555 0123","CA").e164());
  assertEquals("CA",PhoneNumbers.parse("+1 416 555 0123","CA").region());
  assertEquals("US",PhoneNumbers.parse("+1 202 555 0123","US").region());
  assertEquals("PHONE_INVALID",reason("+1 416 555 0123","US"),"un número canadiense no es válido como estadounidense");
  assertEquals("PHONE_INVALID",reason("202 555 0123","CA"));
 }

 @Test void rejectsIncompatibleShortLongAndMalformedNumbers() {
  assertEquals("PHONE_COUNTRY_MISMATCH",reason("+56 9 1234 5678","AR"),"prefijo de otro país");
  assertEquals("PHONE_COUNTRY_MISMATCH",reason("+1 202 555 0123","AR"));
  assertTrue(reason("12345","AR").startsWith("PHONE_"));
  assertEquals("PHONE_TOO_SHORT",reason("381 555","AR"));
  assertEquals("PHONE_TOO_LONG",reason("381 555 1234 5678 9012","AR"));
  assertEquals("PHONE_INVALID",reason("0000 000 0000","AR"));
  assertEquals("PHONE_TOO_LONG",reason("+54 54 381 555 1234","AR"),"prefijo duplicado");
  assertEquals("PHONE_CHARS_INVALID",reason("38155512ab","AR"));
  assertEquals("PHONE_CHARS_INVALID",reason("381-555-12$4","AR"));
  assertEquals("PHONE_CHARS_INVALID",reason("54+3815551234","AR"));
  assertEquals("PHONE_REQUIRED",reason("  ","AR"));
  assertEquals("PHONE_REQUIRED",reason(null,"AR"));
  assertEquals("PHONE_TOO_LONG",reason("0".repeat(31),"AR"));
 }

 @Test void extensionsAreRejectedExplicitlyNeverDroppedSilently() {
  for(String withExtension:new String[]{"0381 555-1234 ext. 12","0381 555-1234 x12","0381 555-1234 #12","0381 555-1234;ext=5"})
   assertEquals("PHONE_EXTENSION_UNSUPPORTED",reason(withExtension,"AR"),withExtension);
 }

 @Test void countryMustBeSelectedAndSupported() {
  assertEquals("PHONE_COUNTRY_REQUIRED",reason("0381 555-1234",null));
  assertEquals("PHONE_COUNTRY_REQUIRED",reason("0381 555-1234"," "));
  assertEquals("PHONE_COUNTRY_INVALID",reason("0381 555-1234","ZZ"));
  assertEquals("PHONE_COUNTRY_INVALID",reason("0381 555-1234","ARG"));
  assertEquals("PHONE_COUNTRY_INVALID",reason("0381 555-1234","001"));
  assertTrue(PhoneNumbers.supported("AR")&&PhoneNumbers.supported("us")&&!PhoneNumbers.supported("ZZ")&&!PhoneNumbers.supported(null));
  assertEquals("Argentina",PhoneNumbers.countryName("AR"));
 }

 @Test void leadingZerosAreKeptAndTheResultFitsTheColumns() {
  Parsed p=PhoneNumbers.parse("0381 555-1234","AR");
  assertTrue(p.e164().length()<=16&&p.international().length()<=30);
  assertEquals("+34612345678",PhoneNumbers.parse("0034 612345678","ES").e164(),"prefijo de acceso internacional 00");
 }
}
