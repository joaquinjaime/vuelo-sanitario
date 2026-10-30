package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.EmailContact;
import com.vuelossanitarios.backend.domain.person.PhoneContact;
import com.vuelossanitarios.backend.domain.person.Person;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** Mantenimiento de los contactos de la propia persona sobre HTTP con JWT, seguridad y persistencia reales (H2). Los índices únicos y la concurrencia con SQL Server se prueban en el E2E. */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:personcontacts;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class PersonContactIntegrationTest {
 @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder; @Autowired PlatformTransactionManager txm;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles; @Autowired PatientRepository patients;
 @Autowired EmailContactRepository emails; @Autowired PhoneContactRepository phones; @Autowired AuditEventRepository events;
 private static int seq=0; private static final String PASSWORD="ClaveSegura-12345";

 private <T> T tx(Supplier<T> work){return new TransactionTemplate(txm).execute(s->work.get());}
 private Role role(String code){return roles.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roles.save(r);});}
 private record Account(long userId,long personId,String token,String hash,Long credentialVersion){}
 private Account account(String name,String roleCode) throws Exception {
  Person p=new Person();p.setNombre(name);p.setApellido("Contacto");p.setDni(String.valueOf(61000000+(++seq)));persons.save(p);
  User u=new User();u.setUsername(name.toLowerCase()+seq);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");u.setPasswordHash(encoder.encode(PASSWORD));users.save(u);userRoles.save(new UserRole(u,role(roleCode)));
  String token=JsonPath.read(mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+u.getUsername()+"\",\"password\":\""+PASSWORD+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.accessToken");
  User fresh=users.findById(u.getId()).orElseThrow();
  return new Account(u.getId(),p.getId(),token,fresh.getPasswordHash(),fresh.getVersionCredenciales());
 }
 private ResultActions call(String method,String path,String token,String body) throws Exception {
  var b=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).contentType(MediaType.APPLICATION_JSON);
  if(token!=null)b=b.header("Authorization","Bearer "+token);
  return mvc.perform(body==null?b:b.content(body));
 }
 private long addEmail(Account a,String address) throws Exception {
  return ((Number)JsonPath.read(call("POST","/api/auth/me/correos",a.token,"{\"direccion\":\""+address+"\"}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.id")).longValue();
 }
 private void verify(long emailId){tx(()->{var e=emails.findById(emailId).orElseThrow();e.setFechaVerificacion(java.time.LocalDateTime.now());return emails.save(e);});}
 private long addPhone(Account a,String number) throws Exception {
  return ((Number)JsonPath.read(call("POST","/api/auth/me/telefonos",a.token,"{\"pais\":\"AR\",\"numero\":\""+number+"\"}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.id")).longValue();
 }
 private List<EmailContact> activeEmails(long personId){return tx(()->{List<EmailContact> l=emails.findActiveByPersonId(personId);l.forEach(e->e.getPerson().getId());return l;});}
 private int mainCount(long personId){return (int)activeEmails(personId).stream().filter(e->Boolean.TRUE.equals(e.getPrincipal())).count();}
 private Long emailVersion(long id){return emails.findById(id).orElseThrow().getVersion();}

 @BeforeEach void seed(){for(String r:List.of("ADMINISTRADOR","DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE"))role(r);}

 @Test void ownerAddsEditsPromotesAndRetiresEmailsWithoutLosingHistory() throws Exception {
  Account ana=account("Ana","DTS");
  long first=addEmail(ana,"Ana.Uno@Example.Test");
  assertEquals(1,mainCount(ana.personId()),"el primer correo es el principal");
  long second=addEmail(ana,"ana.dos@example.test");
  call("GET","/api/auth/me",ana.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.correos.length()").value(2)).andExpect(jsonPath("$.correos[0].id").value(first)).andExpect(jsonPath("$.correos[0].principal").value(true)).andExpect(jsonPath("$.correos[1].principal").value(false)).andExpect(jsonPath("$.correos[1].version").value(0));

  // duplicados (sin distinguir mayúsculas ni espacios), formato y tipo
  call("POST","/api/auth/me/correos",ana.token(),"{\"direccion\":\" ANA.UNO@example.test \"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_DUPLICATE"));
  for(String bad:List.of("sin-arroba","a@b","a b@example.test","@example.test","ana@example."))
   call("POST","/api/auth/me/correos",ana.token(),"{\"direccion\":\""+bad+"\"}").andExpect(status().isBadRequest());
  call("POST","/api/auth/me/correos",ana.token(),"{\"direccion\":\"ok@example.test\",\"tipo\":\"SECRETO\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONTACT_INVALID"));
  assertEquals(2,activeEmails(ana.personId()).size(),"los intentos inválidos no dejan residuos");

  // edición con versión: la versión vencida se rechaza y no pisa
  call("PUT","/api/auth/me/correos/"+second,ana.token(),"{\"direccion\":\"ana.laboral@example.test\",\"tipo\":\"LABORAL\",\"version\":0}").andExpect(status().isOk()).andExpect(jsonPath("$.valor").value("ana.laboral@example.test")).andExpect(jsonPath("$.tipo").value("LABORAL")).andExpect(jsonPath("$.version").value(1));
  call("PUT","/api/auth/me/correos/"+second,ana.token(),"{\"direccion\":\"otra@example.test\",\"tipo\":\"PERSONAL\",\"version\":0}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_VERSION_CONFLICT"));
  assertEquals("ana.laboral@example.test",emails.findById(second).orElseThrow().getDireccion());
  call("PUT","/api/auth/me/correos/"+second,ana.token(),"{\"direccion\":\"ANA.UNO@example.test\",\"tipo\":\"PERSONAL\",\"version\":1}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_DUPLICATE"));
  call("PUT","/api/auth/me/correos/"+second,ana.token(),"{\"direccion\":\"nuevo\",\"tipo\":\"PERSONAL\",\"version\":1}").andExpect(status().isBadRequest());
  Long unchangedVersion=emailVersion(second);
  call("PUT","/api/auth/me/correos/"+second,ana.token(),"{\"direccion\":\"ana.laboral@example.test\",\"tipo\":\"LABORAL\",\"version\":1}").andExpect(status().isOk());
  assertEquals(unchangedVersion,emailVersion(second),"guardar sin cambios no crea una versión ni un evento");

  // principal único; retirar el principal promueve a otro; el último no se puede retirar
  call("POST","/api/auth/me/correos/"+second+"/principal",ana.token(),null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
  verify(second);
  call("POST","/api/auth/me/correos/"+second+"/principal",ana.token(),null).andExpect(status().isOk());
  assertEquals(1,mainCount(ana.personId()));assertTrue(emails.findById(second).orElseThrow().getPrincipal());assertFalse(emails.findById(first).orElseThrow().getPrincipal());
  verify(first);
  call("DELETE","/api/auth/me/correos/"+second,ana.token(),null).andExpect(status().isOk());
  assertEquals(1,mainCount(ana.personId()),"el contacto restante pasa a ser el principal");assertTrue(emails.findById(first).orElseThrow().getPrincipal());
  call("DELETE","/api/auth/me/correos/"+first,ana.token(),null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LAST_CONTACT_REQUIRED"));
  call("DELETE","/api/auth/me/correos/"+second,ana.token(),null).andExpect(status().isNotFound());   // ya retirado: se comporta como inexistente
  call("GET","/api/auth/me",ana.token(),null).andExpect(jsonPath("$.correos.length()").value(1));

  // el contacto retirado se conserva con su baja lógica y el valor puede volver a registrarse como contacto nuevo
  tx(()->{EmailContact gone=emails.findById(second).orElseThrow();
   assertNotNull(gone.getFechaBaja());assertEquals("RETIRO",gone.getMotivoBaja());assertEquals(ana.userId(),gone.getBajaPor().getId());assertFalse(gone.getPrincipal());return null;});
  long again=addEmail(ana,"ana.laboral@example.test");assertNotEquals(second,again);
  assertEquals(2,activeEmails(ana.personId()).size());assertEquals(1,mainCount(ana.personId()));
 }

 @Test void phonesAcceptSeparatorsRejectBadFormatsAndRespectDuplicatesAfterNormalization() throws Exception {
  Account luis=account("Luis","OPERACIONES");
  long main=addPhone(luis,"+54 381 555-1234");
  call("GET","/api/auth/me",luis.token(),null).andExpect(jsonPath("$.telefonos[0].valor").value("+54 381 555-1234")).andExpect(jsonPath("$.telefonos[0].principal").value(true));
  call("POST","/api/auth/me/telefonos",luis.token(),"{\"pais\":\"AR\",\"numero\":\"+543815551234\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_DUPLICATE"));
  for(String bad:List.of("12345","abc","38155512ab","1234567890123456","++5438155512"))
   call("POST","/api/auth/me/telefonos",luis.token(),"{\"pais\":\"AR\",\"numero\":\""+bad+"\"}").andExpect(status().isBadRequest());
  long other=addPhone(luis,"(0381) 444-5566");
  call("PUT","/api/auth/me/telefonos/"+other,luis.token(),"{\"pais\":\"AR\",\"numero\":\"3814445577\",\"tipo\":\"LABORAL\",\"version\":0}").andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
  call("PUT","/api/auth/me/telefonos/"+other,luis.token(),"{\"pais\":\"AR\",\"numero\":\"3814445588\",\"tipo\":\"PERSONAL\",\"version\":0}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_VERSION_CONFLICT"));
  call("PUT","/api/auth/me/telefonos/"+other,luis.token(),"{\"pais\":\"AR\",\"numero\":\"+54 (381) 555 1234\",\"tipo\":\"PERSONAL\",\"version\":1}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_DUPLICATE"));
  call("POST","/api/auth/me/telefonos/"+other+"/principal",luis.token(),null).andExpect(status().isOk());
  call("DELETE","/api/auth/me/telefonos/"+other,luis.token(),null).andExpect(status().isOk());
  call("DELETE","/api/auth/me/telefonos/"+main,luis.token(),null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LAST_CONTACT_REQUIRED"));
  call("GET","/api/auth/me",luis.token(),null).andExpect(jsonPath("$.telefonos.length()").value(1)).andExpect(jsonPath("$.telefonos[0].principal").value(true));
  // varias personas pueden compartir un teléfono y la respuesta no revela si otro ya lo usa
  Account marta=account("Marta","DTS");
  call("POST","/api/auth/me/telefonos",marta.token(),"{\"pais\":\"AR\",\"numero\":\"+54 381 555-1234\"}").andExpect(status().isOk());
 }

 @Test void nobodyReachesAnotherPersonsContactsNotEvenAnAdministratorAndUnknownIdsAreIndistinguishable() throws Exception {
  Account owner=account("Dueño","DTS"),intruder=account("Intruso","OPERACIONES"),admin=account("Admin","ADMINISTRADOR");
  long mail=addEmail(owner,"duenio@example.test"),second=addEmail(owner,"duenio2@example.test"),phone=addPhone(owner,"3815550001");
  Long version=emailVersion(mail);
  for(Account other:List.of(intruder,admin)){
   call("PUT","/api/auth/me/correos/"+mail,other.token(),"{\"direccion\":\"robado@example.test\",\"version\":0}").andExpect(status().isNotFound());
   call("DELETE","/api/auth/me/correos/"+mail,other.token(),null).andExpect(status().isNotFound());
   call("POST","/api/auth/me/correos/"+second+"/principal",other.token(),null).andExpect(status().isNotFound());
   call("PUT","/api/auth/me/telefonos/"+phone,other.token(),"{\"pais\":\"AR\",\"numero\":\"3815559999\",\"version\":0}").andExpect(status().isNotFound());
   call("DELETE","/api/auth/me/telefonos/"+phone,other.token(),null).andExpect(status().isNotFound());
  }
  String foreign=call("DELETE","/api/auth/me/correos/"+mail,intruder.token(),null).andReturn().getResponse().getContentAsString();
  String missing=call("DELETE","/api/auth/me/correos/987654321",intruder.token(),null).andReturn().getResponse().getContentAsString();
  assertEquals(missing,foreign,"un identificador ajeno y uno inexistente responden igual");
  assertEquals("duenio@example.test",emails.findById(mail).orElseThrow().getDireccion());assertEquals(version,emailVersion(mail));
  assertEquals("+54 381 555-0001",phones.findById(phone).orElseThrow().getNumero());
  assertEquals(2,activeEmails(owner.personId()).size());assertEquals(0,activeEmails(intruder.personId()).size());
  call("POST","/api/auth/me/correos",null,"{\"direccion\":\"anonimo@example.test\"}").andExpect(status().isUnauthorized());
  call("PUT","/api/auth/me/correos/"+mail,null,"{\"direccion\":\"anonimo@example.test\",\"version\":0}").andExpect(status().isUnauthorized());
  // no existe ninguna ruta que acepte otra persona
  call("PUT","/api/auth/users/"+owner.userId()+"/correos/"+mail,admin.token(),"{\"direccion\":\"x@example.test\",\"version\":0}").andExpect(status().is4xxClientError());
  assertEquals("duenio@example.test",emails.findById(mail).orElseThrow().getDireccion());
 }

 @Test void contactMaintenanceNeverTouchesCredentialsRolesIdentityPatientRecordOrSessions() throws Exception {
  Account ana=account("Beto","COMANDANTE");
  Long patientId=tx(()->{Patient pa=new Patient();pa.setPerson(persons.findById(ana.personId()).orElseThrow());return patients.save(pa).getId();});   // la misma persona también consta como paciente
  Person before=persons.findById(ana.personId()).orElseThrow();Long personVersion=before.getVersion();String dni=before.getDni(),first=before.getNombre(),last=before.getApellido();
  long mail=addEmail(ana,"beto@example.test");addEmail(ana,"beto2@example.test");long phone=addPhone(ana,"3815550002");addPhone(ana,"3815550003");
  call("PUT","/api/auth/me/correos/"+mail,ana.token(),"{\"direccion\":\"beto.nuevo@example.test\",\"version\":0}").andExpect(status().isOk());
  call("POST","/api/auth/me/telefonos/"+(phone+1)+"/principal",ana.token(),null).andExpect(status().isOk());
  call("DELETE","/api/auth/me/telefonos/"+phone,ana.token(),null).andExpect(status().isOk());
  User after=users.findById(ana.userId()).orElseThrow();
  assertEquals(ana.hash(),after.getPasswordHash());assertEquals(ana.credentialVersion(),after.getVersionCredenciales());assertEquals("ACTIVO",after.getEstadoCuenta());assertTrue(after.getActivo());assertFalse(after.getDebeCambiarContrasena());
  assertEquals(List.of("COMANDANTE"),tx(()->users.findWithRolesById(ana.userId()).orElseThrow().getUserRoles().stream().map(r->r.getRole().getCodigo()).toList()));
  Person person=persons.findById(ana.personId()).orElseThrow();assertEquals(personVersion,person.getVersion(),"la versión de la identidad no cambia");assertEquals(dni,person.getDni());assertEquals(first,person.getNombre());assertEquals(last,person.getApellido());
  assertTrue(patients.findById(patientId).isPresent());
  call("GET","/api/auth/me",ana.token(),null).andExpect(status().isOk());   // la sesión sigue vigente
 }

 @Test void everyChangeIsAuditedWithMaskedValuesAndOnlyAdministratorsCanReadIt() throws Exception {
  Account ana=account("Carla","DTS"),admin=account("Admin","ADMINISTRADOR");
  long mail=addEmail(ana,"carla.privada@example.test");addEmail(ana,"carla.dos@example.test");long phone=addPhone(ana,"+54 381 555 7788");addPhone(ana,"3815550011");
  call("PUT","/api/auth/me/correos/"+mail,ana.token(),"{\"direccion\":\"carla.nueva@example.test\",\"tipo\":\"LABORAL\",\"version\":0}").andExpect(status().isOk());
  call("POST","/api/auth/me/telefonos/"+(phone+1)+"/principal",ana.token(),null).andExpect(status().isOk());
  call("DELETE","/api/auth/me/telefonos/"+phone,ana.token(),null).andExpect(status().isOk());
  verify(mail+1);
  call("POST","/api/auth/me/correos/"+(mail+1)+"/principal",ana.token(),null).andExpect(status().isOk());
  call("POST","/api/auth/me/correos/"+(mail+1)+"/principal",ana.token(),null).andExpect(status().isOk());   // ya era principal: no hay cambio ni evento
  List<AuditEvent> mailEvents=tx(()->{List<AuditEvent> l=events.findByEntityTypeAndEntityIdOrderByOccurredAtDesc("PERSON_EMAIL",mail);l.forEach(e->e.getActor().getId());return l;});
  assertEquals(List.of("UPDATE","CREATE"),mailEvents.stream().map(AuditEvent::getOperation).toList());
  AuditEvent update=mailEvents.get(0);assertEquals(ana.userId(),update.getActor().getId());assertNull(update.getFlight());
  assertTrue(update.getOldValues().contains("c***@example.test")&&update.getNewValues().contains("LABORAL"));
  assertEquals(1,events.findByEntityTypeAndEntityIdOrderByOccurredAtDesc("PERSON_EMAIL",mail+1).stream().filter(e->"SET_PRIMARY".equals(e.getOperation())).count(),"sólo el cambio efectivo del principal se audita");
  List<AuditEvent> all=new ArrayList<>();for(String type:List.of("PERSON_EMAIL","PERSON_PHONE"))for(long id:new long[]{mail,mail+1,phone,phone+1})all.addAll(events.findByEntityTypeAndEntityIdOrderByOccurredAtDesc(type,id));
  assertTrue(all.stream().anyMatch(e->"REMOVE".equals(e.getOperation())),"el retiro queda auditado");
  for(AuditEvent e:all){String text=(e.getOldValues()==null?"":e.getOldValues())+(e.getNewValues()==null?"":e.getNewValues());
   for(String secret:List.of("carla.privada@example","carla.nueva@example","carla.dos@example","5517788","3815550011","3817788","hash","$2a$"))assertFalse(text.contains(secret),"la auditoría no guarda el valor completo ni credenciales: "+text);}
  String page=call("GET","/api/audit?entityType=PERSON_EMAIL&size=50",admin.token(),null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  assertTrue(((Number)JsonPath.read(page,"$.total")).intValue()>=3);
  call("GET","/api/audit",ana.token(),null).andExpect(status().isForbidden());
 }

 @Test void creatingAnAccountValidatesAndNormalizesContactsWithTheSameRules() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR");
  String ok="{\"nombre\":\"Nuevo\",\"apellido\":\"Alta\",\"dni\":\"%s\",\"roles\":[\"DTS\"],\"correos\":[{\"direccion\":\"Nuevo@Example.Test\"},{\"direccion\":\"nuevo@example.test\"}],\"telefonos\":[{\"pais\":\"AR\",\"numero\":\"381 555-0000\"},{\"pais\":\"AR\",\"numero\":\"3815550000\"}]}";
  String dni=String.valueOf(62000000+(++seq));
  call("POST","/api/auth/users",admin.token(),ok.formatted(dni)).andExpect(status().isOk());
  Long personId=persons.findByDni(dni).orElseThrow().getId();
  assertEquals(1,activeEmails(personId).size(),"las variantes del mismo correo se guardan una sola vez");assertEquals(1,tx(()->phones.findActiveByPersonId(personId).size()));
  String bad="{\"nombre\":\"Mala\",\"apellido\":\"Alta\",\"dni\":\"%s\",\"roles\":[\"DTS\"],\"correos\":[{\"direccion\":\"mala@example.test\"}],\"telefonos\":[{\"pais\":\"AR\",\"numero\":\"%s\"}]}";
  String dniBad=String.valueOf(62000000+(++seq));
  call("POST","/api/auth/users",admin.token(),bad.formatted(dniBad,"abc123")).andExpect(status().isBadRequest());
  assertTrue(persons.findByDni(dniBad).isEmpty(),"una alta rechazada no deja persona ni cuenta");
  call("POST","/api/auth/users",admin.token(),"{\"nombre\":\"Mala\",\"apellido\":\"Alta\",\"dni\":\""+dniBad+"\",\"roles\":[\"DTS\"],\"correos\":[{\"direccion\":\"mala@example.test\",\"tipo\":\"RARO\"}],\"telefonos\":[{\"pais\":\"AR\",\"numero\":\"3815550000\"}]}").andExpect(status().isBadRequest());
  assertTrue(persons.findByDni(dniBad).isEmpty());
 }

 @Test void simultaneousAdditionsOfTheSameContactLeaveASingleOne() throws Exception {
  Account ana=account("Dora","DTS");
  int threads=6;ExecutorService pool=Executors.newFixedThreadPool(threads);CountDownLatch start=new CountDownLatch(1);List<Future<Integer>> results=new ArrayList<>();
  for(int i=0;i<threads;i++)results.add(pool.submit((Callable<Integer>)()->{start.await();return call("POST","/api/auth/me/correos",ana.token(),"{\"direccion\":\"dora@example.test\"}").andReturn().getResponse().getStatus();}));
  start.countDown();int created=0,conflicts=0;for(Future<Integer> f:results){int s=f.get();if(s==200)created++;else if(s==409)conflicts++;}pool.shutdown();
  assertEquals(1,created);assertEquals(threads-1,conflicts);
  assertEquals(1,activeEmails(ana.personId()).size());assertEquals(1,mainCount(ana.personId()));
 }
}
