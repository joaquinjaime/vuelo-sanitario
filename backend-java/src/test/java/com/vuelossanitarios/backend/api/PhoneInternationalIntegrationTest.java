package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.person.PhoneContact;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Teléfonos internacionales sobre HTTP real (H2): el servidor decide, con las reglas de numeración del país elegido, y nunca confía en lo que
 * diga el cliente. Cubre el autoservicio, el alta administrativa y la conservación de datos anteriores sin país.
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:phoneintl;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class PhoneInternationalIntegrationTest {
 @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder; @Autowired PlatformTransactionManager txm;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles;
 @Autowired PhoneContactRepository phones; @Autowired AuditEventRepository events;
 private static int seq=0; private static final String PASSWORD="ClaveSegura-12345";
 private <T> T tx(Supplier<T> work){return new TransactionTemplate(txm).execute(s->work.get());}
 private Role role(String code){return roles.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roles.save(r);});}
 private record Account(long userId,long personId,String token){}
 private Account account(String name,String roleCode) throws Exception {
  Person p=new Person();p.setNombre(name);p.setApellido("Telefono");p.setDni(String.valueOf(63500000+(++seq)));persons.save(p);
  User u=new User();u.setUsername(name.toLowerCase()+seq);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");u.setPasswordHash(encoder.encode(PASSWORD));users.save(u);userRoles.save(new UserRole(u,role(roleCode)));
  String token=JsonPath.read(mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+u.getUsername()+"\",\"password\":\""+PASSWORD+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.accessToken");
  return new Account(u.getId(),p.getId(),token);
 }
 private ResultActions call(String method,String path,String token,String body) throws Exception {
  var b=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).contentType(MediaType.APPLICATION_JSON);
  if(token!=null)b=b.header("Authorization","Bearer "+token);
  return mvc.perform(body==null?b:b.content(body));
 }
 private static String phoneJson(String country,String number,String type){return "{"+(country==null?"":"\"pais\":\""+country+"\",")+"\"numero\":\""+number+"\""+(type==null?"":",\"tipo\":\""+type+"\"")+"}";}
 private ResultActions add(Account a,String country,String number) throws Exception {return call("POST","/api/auth/me/telefonos",a.token,phoneJson(country,number,null));}
 private List<PhoneContact> active(long personId){return tx(()->phones.findActiveByPersonId(personId));}

 @BeforeEach void seed(){for(String r:List.of("ADMINISTRADOR","DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE"))role(r);}

 @Test void selfServiceStoresE164AndTheInternationalFormWithTheSelectedCountry() throws Exception {
  Account ana=account("Ana","DTS");
  add(ana,"AR","0381 15 555-1234").andExpect(status().isOk()).andExpect(jsonPath("$.valor").value("+54 9 381 555-1234")).andExpect(jsonPath("$.pais").value("AR")).andExpect(jsonPath("$.principal").value(true));
  add(ana,"cl","9 8765 4321").andExpect(status().isOk()).andExpect(jsonPath("$.valor").value("+56 9 8765 4321")).andExpect(jsonPath("$.pais").value("CL"));
  add(ana,"BR","(11) 98765-4321").andExpect(status().isOk());add(ana,"ES","612 34 56 78").andExpect(status().isOk());
  add(ana,"US","(202) 555-0123").andExpect(status().isOk()).andExpect(jsonPath("$.pais").value("US"));
  add(ana,"CA","+1 416 555 0123").andExpect(status().isOk()).andExpect(jsonPath("$.pais").value("CA"));
  List<PhoneContact> saved=active(ana.personId());
  assertEquals(List.of("+5493815551234","+56987654321","+5511987654321","+34612345678","+12025550123","+14165550123"),saved.stream().map(PhoneContact::getNumeroNormalizado).toList());
  assertEquals(List.of("AR","CL","BR","ES","US","CA"),saved.stream().map(PhoneContact::getCodigoPais).toList());
  assertTrue(saved.stream().allMatch(p->p.isValidado()&&p.getNumeroNormalizado().startsWith("+")));
  call("GET","/api/auth/me",ana.token,null).andExpect(jsonPath("$.telefonos[0].pais").value("AR")).andExpect(jsonPath("$.telefonos[1].valor").value("+56 9 8765 4321"));
 }

 @Test void theServerRejectsWhatTheSelectedCountryDoesNotAllowWithoutPersistingAnything() throws Exception {
  Account luis=account("Luis","DTS");long before=active(luis.personId()).size();
  Object[][] cases={
   {null,"0381 555-1234","PHONE_COUNTRY_REQUIRED"},{"","0381 555-1234","PHONE_COUNTRY_REQUIRED"},{"ZZ","0381 555-1234","PHONE_COUNTRY_INVALID"},
   {"AR","+56 9 8765 4321","PHONE_COUNTRY_MISMATCH"},{"AR","+54 54 381 555 1234","PHONE_TOO_LONG"},{"AR","12345","PHONE_TOO_SHORT"},{"AR","381 555 1234 5678 9012","PHONE_TOO_LONG"},
   {"AR","0000 000 0000","PHONE_INVALID"},{"AR","381-555-12$4","PHONE_CHARS_INVALID"},{"AR","0381 555-1234 ext. 12","PHONE_EXTENSION_UNSUPPORTED"},{"AR","0381 555-1234 x12","PHONE_EXTENSION_UNSUPPORTED"},
   {"US","+1 416 555 0123","PHONE_INVALID"},{"CA","202 555 0123","PHONE_INVALID"},{"AR","54+3815551234","PHONE_CHARS_INVALID"},{"CL","381 555 1234","PHONE_INVALID"},
  };
  for(Object[] c:cases){
   add(luis,(String)c[0],(String)c[1]).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONTACT_INVALID")).andExpect(jsonPath("$.motivo").value(c[2])).andExpect(jsonPath("$.campo").value("telefono"));
  }
  assertEquals(before,active(luis.personId()).size(),"ningún rechazo deja residuos");
  // el cliente no puede declarar que el número ya es válido ni elegir qué se guarda
  call("POST","/api/auth/me/telefonos",luis.token,"{\"pais\":\"AR\",\"numero\":\"12345\",\"valido\":true,\"numeroNormalizado\":\"+5412345\",\"codigoPais\":\"AR\"}").andExpect(status().isBadRequest());
  call("POST","/api/auth/me/telefonos",luis.token,"{\"pais\":\"AR\",\"numero\":\"0381 555-1234\",\"numeroNormalizado\":\"+99999999999\",\"codigoPais\":\"CL\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("Campo no admitido: numeroNormalizado"));
  call("POST","/api/auth/me/telefonos",luis.token,phoneJson("AR","0381 555-1234",null)).andExpect(status().isOk());
  PhoneContact stored=active(luis.personId()).get(0);assertEquals("+543815551234",stored.getNumeroNormalizado());assertEquals("AR",stored.getCodigoPais());
  call("POST","/api/auth/me/telefonos",luis.token,"{\"pais\":\"ARG\",\"numero\":\"0381 555-1234\"}").andExpect(status().isBadRequest());
  call("POST","/api/auth/me/telefonos",null,phoneJson("AR","0381 555-9999",null)).andExpect(status().isUnauthorized());
 }

 @Test void equivalentFormsOfTheSameNumberAreDuplicatesWhateverTheSeparatorsOrPrefixes() throws Exception {
  Account eva=account("Eva","DTS");
  add(eva,"AR","0381 555-1234").andExpect(status().isOk());
  for(String same:List.of("381 555 1234","(0381) 555-1234","+54 381 555 1234","+54 (381) 555.1234","0054 381 5551234","381.555.1234"))
   add(eva,"AR",same).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_DUPLICATE"));
  assertEquals(1,active(eva.personId()).size());
  add(eva,"AR","0381 15 555-1234").andExpect(status().isOk());   // el móvil (con 9) es otro número válido
  // entre personas distintas se permite (p. ej. un teléfono familiar) y no se informa si ya existe
  Account other=account("Otra","DTS");add(other,"AR","381 555 1234").andExpect(status().isOk());
 }

 @Test void updatesRevalidateWithTheCountryAndDetectDuplicatesAndVersionConflicts() throws Exception {
  Account rosa=account("Rosa","DTS");
  long first=((Number)JsonPath.read(add(rosa,"AR","0381 555-1234").andReturn().getResponse().getContentAsString(),"$.id")).longValue();
  long second=((Number)JsonPath.read(add(rosa,"CL","9 8765 4321").andReturn().getResponse().getContentAsString(),"$.id")).longValue();
  call("PUT","/api/auth/me/telefonos/"+second,rosa.token,"{\"pais\":\"AR\",\"numero\":\"0381 555-1234\",\"version\":0}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_DUPLICATE"));
  call("PUT","/api/auth/me/telefonos/"+second,rosa.token,"{\"pais\":\"CL\",\"numero\":\"1234\",\"version\":0}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.motivo").value("PHONE_TOO_SHORT"));
  call("PUT","/api/auth/me/telefonos/"+second,rosa.token,"{\"numero\":\"9 8765 4321\",\"version\":0}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.motivo").value("PHONE_COUNTRY_REQUIRED"));
  call("PUT","/api/auth/me/telefonos/"+second,rosa.token,"{\"pais\":\"UY\",\"numero\":\"099 123 456\",\"tipo\":\"LABORAL\",\"version\":0}").andExpect(status().isOk()).andExpect(jsonPath("$.valor").value("+598 99 123 456")).andExpect(jsonPath("$.pais").value("UY")).andExpect(jsonPath("$.tipo").value("LABORAL")).andExpect(jsonPath("$.version").value(1));
  call("PUT","/api/auth/me/telefonos/"+second,rosa.token,"{\"pais\":\"UY\",\"numero\":\"099 123 456\",\"tipo\":\"LABORAL\",\"version\":0}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_VERSION_CONFLICT"));
  Long version=phones.findById(second).orElseThrow().getVersion();
  call("PUT","/api/auth/me/telefonos/"+second,rosa.token,"{\"pais\":\"UY\",\"numero\":\"+598 99 123 456\",\"tipo\":\"LABORAL\",\"version\":"+version+"}").andExpect(status().isOk());
  assertEquals(version,phones.findById(second).orElseThrow().getVersion(),"guardar el mismo número sin cambios no crea una versión");
  assertEquals("+543815551234",phones.findById(first).orElseThrow().getNumeroNormalizado());
 }

 @Test void legacyPhonesWithoutCountryAreKeptFlaggedAndOnlyValidatedByTheirOwner() throws Exception {
  Account vera=account("Vera","DTS");
  long legacy=tx(()->{PhoneContact p=new PhoneContact();p.setPerson(persons.findById(vera.personId()).orElseThrow());p.setNumero("3815551234");p.setPrincipal(true);return phones.save(p).getId();});
  long other=tx(()->{PhoneContact p=new PhoneContact();p.setPerson(persons.findById(vera.personId()).orElseThrow());p.setNumero("+54 (381) 444-5566");p.setPrincipal(false);return phones.save(p).getId();});
  call("GET","/api/auth/me",vera.token,null).andExpect(jsonPath("$.telefonos[0].valor").value("3815551234")).andExpect(jsonPath("$.telefonos[0].pais").doesNotExist());
  // no se agrega de nuevo lo que ya existe sin validar (con o sin prefijo de país)
  add(vera,"AR","0381 555-1234").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_DUPLICATE"));
  add(vera,"AR","+54 381 555 1234").andExpect(status().isConflict());
  add(vera,"AR","+54 381 444-5566").andExpect(status().isConflict());
  assertEquals(2,active(vera.personId()).size());
  // el titular lo valida indicando el país; nada se adivina
  call("PUT","/api/auth/me/telefonos/"+legacy,vera.token,"{\"pais\":\"AR\",\"numero\":\"3815551234\",\"version\":0}").andExpect(status().isOk()).andExpect(jsonPath("$.pais").value("AR")).andExpect(jsonPath("$.valor").value("+54 381 555-1234"));
  PhoneContact fixed=phones.findById(legacy).orElseThrow();assertEquals("+543815551234",fixed.getNumeroNormalizado());assertTrue(fixed.getPrincipal());assertTrue(fixed.isValidado());
  assertFalse(phones.findById(other).orElseThrow().isValidado(),"los demás datos anteriores no se tocan");assertEquals("+54 (381) 444-5566",phones.findById(other).orElseThrow().getNumero());
 }

 @Test void simultaneousEquivalentAdditionsLeaveASingleContact() throws Exception {
  Account sol=account("Sol","DTS");
  ExecutorService pool=Executors.newFixedThreadPool(6);CountDownLatch go=new CountDownLatch(1);List<Future<Integer>> results=new ArrayList<>();
  String[] forms={"0381 555-1234","381 555 1234","+54 381 555-1234","(0381) 555 1234","381.555.1234","0054 381 5551234"};
  for(String form:forms)results.add(pool.submit((Callable<Integer>)()->{go.await();return add(sol,"AR",form).andReturn().getResponse().getStatus();}));
  go.countDown();int ok=0,conflict=0;for(Future<Integer> f:results){int st=f.get();if(st==200)ok++;else if(st==409)conflict++;}
  pool.shutdown();
  assertEquals(1,ok);assertEquals(5,conflict);assertEquals(1,active(sol.personId()).size());
 }

 @Test void adminAccountCreationAppliesTheSameRulesAndLeavesNothingWhenRejected() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR");
  String ok="{\"nombre\":\"Nuevo\",\"apellido\":\"Alta\",\"dni\":\"%s\",\"roles\":[\"DTS\"],\"correos\":[{\"direccion\":\"nuevo.alta@example.test\"}],\"telefonos\":[%s]}";
  long people=persons.count();
  for(String badPhone:List.of("{\"numero\":\"0381 555-1234\"}","{\"pais\":\"AR\",\"numero\":\"12345\"}","{\"pais\":\"AR\",\"numero\":\"+56 9 8765 4321\"}","{\"pais\":\"XX\",\"numero\":\"0381 555-1234\"}","{\"pais\":\"AR\",\"numero\":\"0381 555-1234 ext 1\"}"))
   call("POST","/api/auth/users",admin.token,String.format(ok,String.valueOf(71000000+(++seq)),badPhone)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONTACT_INVALID"));
  assertEquals(people,persons.count(),"una alta rechazada no deja persona, cuenta ni contactos");
  String dni=String.valueOf(72000000+(++seq));
  call("POST","/api/auth/users",admin.token,String.format(ok,dni,"{\"pais\":\"AR\",\"numero\":\"0381 15 555-1234\"},{\"pais\":\"AR\",\"numero\":\"+54 9 381 555 1234\"},{\"pais\":\"CL\",\"numero\":\"9 8765 4321\",\"tipo\":\"LABORAL\"}")).andExpect(status().isOk());
  Person created=persons.findByDni(dni).orElseThrow();List<PhoneContact> saved=active(created.getId());
  assertEquals(List.of("+5493815551234","+56987654321"),saved.stream().map(PhoneContact::getNumeroNormalizado).toList(),"las formas equivalentes se guardan una sola vez");
  assertEquals(List.of(true,false),saved.stream().map(PhoneContact::getPrincipal).toList());assertEquals("LABORAL",saved.get(1).getTipo());
 }

 @Test void auditKeepsMaskedE164AndCountryNeverTheFullNumber() throws Exception {
  Account carla=account("Carla","DTS"),admin=account("Admin","ADMINISTRADOR");
  long id=((Number)JsonPath.read(add(carla,"AR","0381 555-7788").andReturn().getResponse().getContentAsString(),"$.id")).longValue();
  call("PUT","/api/auth/me/telefonos/"+id,carla.token,"{\"pais\":\"CL\",\"numero\":\"9 8765 4321\",\"tipo\":\"LABORAL\",\"version\":0}").andExpect(status().isOk());
  List<AuditEvent> list=tx(()->{var l=events.findByEntityTypeAndEntityIdOrderByOccurredAtDesc("PERSON_PHONE",id);l.forEach(e->e.getActor().getId());return l;});
  assertEquals(2,list.size());
  String text=list.stream().map(e->String.valueOf(e.getOldValues())+e.getNewValues()).reduce("",String::concat);
  assertTrue(text.contains("\"pais\":\"AR\"")&&text.contains("\"pais\":\"CL\""));
  for(String secret:List.of("3815557788","5557788","987654321","8765 4321","+5493815557788","+56987654321"))assertFalse(text.contains(secret),"auditoría sin el número completo: "+secret);
  call("GET","/api/audit?entityType=PERSON_PHONE&size=20",admin.token,null).andExpect(status().isOk());
 }
}
