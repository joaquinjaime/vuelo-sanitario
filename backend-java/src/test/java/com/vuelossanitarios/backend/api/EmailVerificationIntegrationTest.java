package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.api.RecordingMailConfiguration.RecordingMailTransport;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.person.EmailContact;
import com.vuelossanitarios.backend.domain.person.EmailVerification;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDateTime;
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
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Verificación de correos de punta a punta sobre HTTP (JWT, seguridad y persistencia reales en H2) con una bandeja de pruebas en memoria; no es una entrega real. */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:emailverification;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
@Import(RecordingMailConfiguration.class)
class EmailVerificationIntegrationTest {
 @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder; @Autowired PlatformTransactionManager txm; @Autowired RecordingMailTransport mail;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles;
 @Autowired EmailContactRepository emails; @Autowired EmailVerificationRepository verifications; @Autowired AuditEventRepository events;
 private static int seq=0; private static final String PASSWORD="ClaveSegura-12345";

 private <T> T tx(Supplier<T> work){return new TransactionTemplate(txm).execute(s->work.get());}
 private Role role(String code){return roles.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roles.save(r);});}
 private record Account(long userId,long personId,String token){}
 private Account account(String name,String roleCode) throws Exception {
  Person p=new Person();p.setNombre(name);p.setApellido("Correo");p.setDni(String.valueOf(62000000+(++seq)));persons.save(p);
  User u=new User();u.setUsername(name.toLowerCase()+seq);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");u.setPasswordHash(encoder.encode(PASSWORD));users.save(u);userRoles.save(new UserRole(u,role(roleCode)));
  String token=JsonPath.read(mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+u.getUsername()+"\",\"password\":\""+PASSWORD+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.accessToken");
  return new Account(u.getId(),p.getId(),token);
 }
 private ResultActions call(String method,String path,String token,String body) throws Exception {
  var b=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).contentType(MediaType.APPLICATION_JSON);
  if(token!=null)b=b.header("Authorization","Bearer "+token);
  return mvc.perform(body==null?b:b.content(body));
 }
 private long add(Account a,String address) throws Exception {
  return ((Number)JsonPath.read(call("POST","/api/auth/me/correos",a.token,"{\"direccion\":\""+address+"\"}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.id")).longValue();
 }
 private ResultActions confirm(Account a,long id,String code) throws Exception {return call("POST","/api/auth/me/correos/"+id+"/verificacion/confirmar",a.token,"{\"codigo\":\""+code+"\"}");}
 private ResultActions request(Account a,long id) throws Exception {return call("POST","/api/auth/me/correos/"+id+"/verificacion",a.token,null);}
 private EmailContact email(long id){return emails.findById(id).orElseThrow();}
 private List<EmailVerification> tokens(long emailId){return tx(()->{var l=verifications.findAll().stream().filter(v->v.getEmail().getId().equals(emailId)).toList();l.forEach(v->v.getEmail().getId());return l;});}
 /** Hace que el último código se haya emitido hace {@code minutes} minutos (los límites y el vencimiento se evalúan contra el reloj). */
 private void age(long emailId,long minutes){tx(()->{for(EmailVerification v:verifications.findAll())if(v.getEmail().getId().equals(emailId)){v.setCreadaEn(v.getCreadaEn().minusMinutes(minutes));v.setVenceEn(v.getVenceEn().minusMinutes(minutes));verifications.save(v);}return null;});}
 private List<AuditEvent> audit(long emailId){return tx(()->{var l=events.findByEntityTypeAndEntityIdOrderByOccurredAtDesc("PERSON_EMAIL",emailId);l.forEach(e->e.getActor().getId());return l;});}
 private List<String> ops(long emailId){return audit(emailId).stream().map(AuditEvent::getOperation).toList();}

 @BeforeEach void seed(){for(String r:List.of("ADMINISTRADOR","DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE"))role(r);mail.reset();}

 @Test void aNewEmailIsPendingUntilTheOwnerReturnsTheCodeSentToThatAddress() throws Exception {
  Account ana=account("Ana","DTS");
  var created=call("POST","/api/auth/me/correos",ana.token,"{\"direccion\":\"Ana.Nueva+vuelos@Example.test\",\"tipo\":\"LABORAL\"}").andExpect(status().isOk())
    .andExpect(jsonPath("$.verificacion").value("PENDIENTE")).andExpect(jsonPath("$.envio").value("ENVIADO")).andReturn().getResponse().getContentAsString();
  long id=((Number)JsonPath.read(created,"$.id")).longValue();
  assertNull(email(id).getFechaVerificacion(),"registrar no verifica");
  assertEquals(1,mail.sent.size());assertEquals("Ana.Nueva+vuelos@Example.test",mail.sent.get(0).to());
  String code=mail.lastCodeFor("Ana.Nueva+vuelos@Example.test");
  // sólo el HMAC queda en la base, nunca el código
  EmailVerification stored=tokens(id).get(0);
  assertEquals(64,stored.getCodigoHash().length());assertFalse(stored.getCodigoHash().contains(code.replace("-","")));assertNull(stored.getUsadaEn());assertNotNull(stored.getEnviadaEn());
  assertTrue(stored.getVenceEn().isAfter(stored.getCreadaEn()));
  // todavía no es un medio confirmado
  call("GET","/api/auth/me",ana.token,null).andExpect(jsonPath("$.correos[0].verificacion").value("PENDIENTE"));
  call("POST","/api/auth/me/correos/"+id+"/principal",ana.token,null).andExpect(status().isOk());   // es el único correo: ya era principal (sin cambio)
  // confirmar con el código (con o sin guion y en minúsculas)
  confirm(ana,id,code.toLowerCase().replace("-"," ")).andExpect(status().isOk()).andExpect(jsonPath("$.verificacion").value("VERIFICADO"));
  assertNotNull(email(id).getFechaVerificacion());
  assertNotNull(tokens(id).get(0).getUsadaEn());
  call("GET","/api/auth/me",ana.token,null).andExpect(jsonPath("$.correos[0].verificacion").value("VERIFICADO"));
  // un solo uso
  confirm(ana,id,code).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_ALREADY_VERIFIED"));
  request(ana,id).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_ALREADY_VERIFIED"));
  assertEquals(1,mail.sent.size(),"un correo verificado no recibe más códigos");
  // auditoría: sin código ni dirección completa
  assertEquals(java.util.Set.of("VERIFY_CONFIRM","VERIFY_REQUEST","CREATE"),new java.util.HashSet<>(ops(id)));assertEquals(3,ops(id).size());
  for(AuditEvent e:audit(id)){String text=String.valueOf(e.getOldValues())+e.getNewValues();assertFalse(text.contains(code)||text.contains(code.replace("-",""))||text.toLowerCase().contains("ana.nueva+vuelos@example"),text);}
  assertTrue(audit(id).stream().filter(e->"VERIFY_CONFIRM".equals(e.getOperation())).findFirst().orElseThrow().getNewValues().contains("VERIFICADO"));
 }

 @Test void wrongCodesAreCountedThenLockedAndOnlyANewCodeRecovers() throws Exception {
  Account luis=account("Luis","DTS");long id=add(luis,"luis@example.test");String code=mail.lastCodeFor("luis@example.test");
  confirm(luis,id,"AAAA-AAAA").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VERIFICATION_CODE_INVALID")).andExpect(jsonPath("$.intentosRestantes").value(4));
  confirm(luis,id,"corto").andExpect(status().isBadRequest()).andExpect(jsonPath("$.intentosRestantes").value(3));
  confirm(luis,id,"BBBBBBBB").andExpect(status().isBadRequest());confirm(luis,id,"CCCC-CCCC").andExpect(status().isBadRequest());
  confirm(luis,id,"DDDD-DDDD").andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("VERIFICATION_LOCKED"));
  assertEquals(EmailVerification.EXHAUSTED,tokens(id).get(0).getMotivoInvalidacion());
  confirm(luis,id,code).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VERIFICATION_NOT_REQUESTED"));   // ni siquiera el código correcto del token agotado
  assertNull(email(id).getFechaVerificacion());
  assertTrue(ops(id).contains("VERIFY_LOCKED"));
  age(id,2);   // pasó el intervalo mínimo de reenvío
  request(luis,id).andExpect(status().isOk()).andExpect(jsonPath("$.envio").value("ENVIADO")).andExpect(jsonPath("$.verificacion").value("PENDIENTE"));
  confirm(luis,id,mail.lastCodeFor("luis@example.test")).andExpect(status().isOk());
  assertNotNull(email(id).getFechaVerificacion());
 }

 @Test void anExpiredCodeIsRejectedAndRecordedAndCanBeReplaced() throws Exception {
  Account eva=account("Eva","DTS");long id=add(eva,"eva@example.test");String code=mail.lastCodeFor("eva@example.test");
  age(id,31);
  call("GET","/api/auth/me",eva.token,null).andExpect(jsonPath("$.correos[0].verificacion").value("EXPIRADO"));
  confirm(eva,id,code).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VERIFICATION_EXPIRED"));
  assertNull(email(id).getFechaVerificacion());assertEquals(EmailVerification.EXPIRED,tokens(id).get(0).getMotivoInvalidacion());assertTrue(ops(id).contains("VERIFY_EXPIRED"));
  request(eva,id).andExpect(status().isOk());
  String fresh=mail.lastCodeFor("eva@example.test");assertNotEquals(code,fresh);
  confirm(eva,id,fresh).andExpect(status().isOk());
 }

 @Test void resendReplacesTheOpenCodeAndIsRateLimitedPerEmailAndPerUser() throws Exception {
  Account rosa=account("Rosa","DTS");long id=add(rosa,"rosa@example.test");String first=mail.lastCodeFor("rosa@example.test");
  request(rosa,id).andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("VERIFICATION_RATE_LIMIT")).andExpect(jsonPath("$.reintentoEnSegundos").isNumber());
  assertEquals(1,mail.sent.size(),"el rechazo por frecuencia no envía nada");
  age(id,2);request(rosa,id).andExpect(status().isOk());
  String second=mail.lastCodeFor("rosa@example.test");assertNotEquals(first,second);
  confirm(rosa,id,first).andExpect(status().isBadRequest());   // el código anterior quedó reemplazado
  assertEquals(1,tokens(id).stream().filter(EmailVerification::isAbierta).count(),"una sola verificación abierta por correo");
  assertTrue(tokens(id).stream().anyMatch(v->EmailVerification.REPLACED.equals(v.getMotivoInvalidacion())));
  for(int i=0;i<3;i++){age(id,2);request(rosa,id).andExpect(status().isOk());}   // 5 envíos en total
  age(id,2);request(rosa,id).andExpect(status().isTooManyRequests());
  assertEquals(5,mail.sent.size(),"máximo 5 mensajes por correo y día");
  assertTrue(ops(id).contains("VERIFY_RATE_LIMITED"));
  assertEquals(1,ops(id).stream().filter("VERIFY_REQUEST"::equals).count());assertEquals(4,ops(id).stream().filter("VERIFY_RESEND"::equals).count());
  // límite por usuario: 10 códigos entre todos sus correos en 24 h
  Account omar=account("Omar","DTS");
  for(int i=0;i<10;i++)call("POST","/api/auth/me/correos",omar.token,"{\"direccion\":\"omar"+i+"@example.test\"}").andExpect(status().isOk()).andExpect(jsonPath("$.envio").value("ENVIADO"));
  call("POST","/api/auth/me/correos",omar.token,"{\"direccion\":\"omar-extra@example.test\"}").andExpect(status().isOk()).andExpect(jsonPath("$.envio").value("LIMITE_ALCANZADO")).andExpect(jsonPath("$.verificacion").value("SIN_VERIFICAR"));
  assertEquals(10,mail.sent.stream().filter(m->m.to().startsWith("omar")).count(),"el contacto se registra pero no se envía más allá del límite");
 }

 @Test void withoutMailConfigurationNothingIsSentSimulatedOrMarkedVerified() throws Exception {
  mail.configured=false;
  Account pia=account("Pia","DTS");
  var created=call("POST","/api/auth/me/correos",pia.token,"{\"direccion\":\"pia@example.test\"}").andExpect(status().isOk()).andExpect(jsonPath("$.envio").value("NO_CONFIGURADO")).andExpect(jsonPath("$.verificacion").value("SIN_VERIFICAR")).andReturn().getResponse().getContentAsString();
  long id=((Number)JsonPath.read(created,"$.id")).longValue();
  request(pia,id).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("MAIL_NOT_CONFIGURED"));
  assertTrue(mail.sent.isEmpty());assertTrue(tokens(id).isEmpty(),"sin servicio de correo no se emite ningún código");assertNull(email(id).getFechaVerificacion());
  confirm(pia,id,"AAAA-AAAA").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VERIFICATION_NOT_REQUESTED"));
  mail.configured=true;request(pia,id).andExpect(status().isOk());confirm(pia,id,mail.lastCodeFor("pia@example.test")).andExpect(status().isOk());
 }

 @Test void aRejectedSendInvalidatesTheCodeAndReportsTheFailureWithoutInventingDelivery() throws Exception {
  Account tomas=account("Tomas","DTS");mail.failNext=true;
  var created=call("POST","/api/auth/me/correos",tomas.token,"{\"direccion\":\"tomas@example.test\"}").andExpect(status().isOk()).andExpect(jsonPath("$.envio").value("FALLIDO")).andExpect(jsonPath("$.verificacion").value("SIN_VERIFICAR")).andReturn().getResponse().getContentAsString();
  long id=((Number)JsonPath.read(created,"$.id")).longValue();
  assertEquals(1,tokens(id).size());assertEquals(EmailVerification.SEND_FAILED,tokens(id).get(0).getMotivoInvalidacion());assertNull(tokens(id).get(0).getEnviadaEn());assertTrue(mail.sent.isEmpty());
  assertTrue(ops(id).contains("VERIFY_SEND_FAILED"));
  age(id,2);mail.failNext=true;request(tomas,id).andExpect(status().isBadGateway()).andExpect(jsonPath("$.code").value("MAIL_SEND_FAILED"));
  age(id,2);request(tomas,id).andExpect(status().isOk());confirm(tomas,id,mail.lastCodeFor("tomas@example.test")).andExpect(status().isOk());
 }

 @Test void nobodyConfirmsOrRequestsForAnotherPersonsEmailAndAnonymousCallsAreRejected() throws Exception {
  Account owner=account("Dueno","DTS"),intruder=account("Intruso","DTS"),admin=account("Admin","ADMINISTRADOR");
  long id=add(owner,"dueno@example.test");String code=mail.lastCodeFor("dueno@example.test");
  String foreign=confirm(intruder,id,code).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
  String missing=confirm(intruder,987654321L,code).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
  assertEquals(missing,foreign,"un identificador ajeno responde igual que uno inexistente");
  request(intruder,id).andExpect(status().isNotFound());confirm(admin,id,code).andExpect(status().isNotFound());request(admin,id).andExpect(status().isNotFound());
  call("POST","/api/auth/me/correos/"+id+"/verificacion/confirmar",null,"{\"codigo\":\""+code+"\"}").andExpect(status().isUnauthorized());
  call("POST","/api/auth/me/correos/"+id+"/verificacion",null,null).andExpect(status().isUnauthorized());
  assertNull(email(id).getFechaVerificacion());assertEquals(0,tokens(id).get(0).getIntentosFallidos(),"los intentos ajenos no consumen el código del titular");
  // la misma dirección en otra cuenta no revela nada y no se verifica por la del otro
  long copy=add(intruder,"dueno@example.test");assertNull(email(copy).getFechaVerificacion());
  confirm(intruder,copy,code).andExpect(status().isBadRequest());   // el código está ligado al correo y a la dirección del titular
  confirm(owner,id,code).andExpect(status().isOk());
  // campos desconocidos no se descartan en silencio
  call("POST","/api/auth/me/correos/"+copy+"/verificacion/confirmar",intruder.token,"{\"codigo\":\"AAAA-AAAA\",\"verificado\":true}").andExpect(status().isBadRequest());
  assertNull(email(copy).getFechaVerificacion());
 }

 @Test void changingTheAddressBeforeConfirmingInvalidatesTheOldCodeAndAVerifiedAddressIsNeverOverwritten() throws Exception {
  Account ines=account("Ines","DTS");long id=add(ines,"ines.vieja@example.test");String oldCode=mail.lastCodeFor("ines.vieja@example.test");
  call("PUT","/api/auth/me/correos/"+id,ines.token,"{\"direccion\":\"ines.nueva@example.test\",\"tipo\":\"PERSONAL\",\"version\":0}").andExpect(status().isOk()).andExpect(jsonPath("$.verificacion").value("SIN_VERIFICAR"));
  assertEquals(1L,email(id).getVersion(),"una edición de dirección y tipo es un único cambio de versión");
  assertEquals(EmailVerification.ADDRESS_CHANGED,tokens(id).get(0).getMotivoInvalidacion());
  confirm(ines,id,oldCode).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VERIFICATION_NOT_REQUESTED"));
  request(ines,id).andExpect(status().isTooManyRequests());   // el cambio no se usa para saltear el límite de envíos
  age(id,2);request(ines,id).andExpect(status().isOk());confirm(ines,id,mail.lastCodeFor("ines.nueva@example.test")).andExpect(status().isOk());
  // verificado: no se sobrescribe; el tipo sí puede cambiar
  call("PUT","/api/auth/me/correos/"+id,ines.token,"{\"direccion\":\"otra@example.test\",\"tipo\":\"PERSONAL\",\"version\":"+email(id).getVersion()+"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_VERIFIED_IMMUTABLE"));
  assertEquals("ines.nueva@example.test",email(id).getDireccion());assertNotNull(email(id).getFechaVerificacion());
  call("PUT","/api/auth/me/correos/"+id,ines.token,"{\"direccion\":\"Ines.Nueva@example.test\",\"tipo\":\"LABORAL\",\"version\":"+email(id).getVersion()+"}").andExpect(status().isOk()).andExpect(jsonPath("$.verificacion").value("VERIFICADO"));
 }

 @Test void replacingAVerifiedEmailKeepsTheOldOneValidUntilTheNewOneIsConfirmed() throws Exception {
  Account noe=account("Noe","DTS");long old=add(noe,"noe.viejo@example.test");confirm(noe,old,mail.lastCodeFor("noe.viejo@example.test")).andExpect(status().isOk());
  long next=add(noe,"noe.nuevo@example.test");String code=mail.lastCodeFor("noe.nuevo@example.test");
  // mientras el nuevo está pendiente: el anterior conserva su estado y el principal; el nuevo no puede ser principal
  assertEquals("VERIFICADO",JsonPath.<List<String>>read(call("GET","/api/auth/me",noe.token,null).andReturn().getResponse().getContentAsString(),"$.correos[?(@.id=="+old+")].verificacion").get(0));
  call("POST","/api/auth/me/correos/"+next+"/principal",noe.token,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
  assertTrue(email(old).getPrincipal());assertFalse(email(next).getPrincipal());
  call("DELETE","/api/auth/me/correos/"+old,noe.token,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LAST_VERIFIED_EMAIL"));
  // un código vencido no deja al usuario sin su contacto válido
  age(next,31);confirm(noe,next,code).andExpect(status().isConflict());
  assertNotNull(email(old).getFechaVerificacion());assertTrue(email(old).getPrincipal());
  request(noe,next).andExpect(status().isOk());confirm(noe,next,mail.lastCodeFor("noe.nuevo@example.test")).andExpect(status().isOk());
  call("POST","/api/auth/me/correos/"+next+"/principal",noe.token,null).andExpect(status().isOk());
  call("DELETE","/api/auth/me/correos/"+old,noe.token,null).andExpect(status().isOk());
  assertTrue(email(next).getPrincipal());assertNotNull(email(next).getFechaVerificacion());
  assertTrue(ops(next).containsAll(List.of("VERIFY_CONFIRM","SET_PRIMARY")));
  // retirar un correo con código abierto lo invalida
  long third=add(noe,"noe.tercero@example.test");call("DELETE","/api/auth/me/correos/"+third,noe.token,null).andExpect(status().isOk());
  assertEquals(EmailVerification.ADDRESS_REMOVED,tokens(third).get(0).getMotivoInvalidacion());
 }

 @Test void legacyEmailsStayUnverifiedAndMayBeConfirmedWithoutBlockingAnythingElse() throws Exception {
  Account vera=account("Vera","DTS");
  long legacy=tx(()->{EmailContact e=new EmailContact();e.setPerson(persons.findById(vera.personId()).orElseThrow());e.setDireccion("vera.heredada@example.test");e.setPrincipal(true);return emails.save(e).getId();});
  call("GET","/api/auth/me",vera.token,null).andExpect(status().isOk()).andExpect(jsonPath("$.correos[0].verificacion").value("SIN_VERIFICAR")).andExpect(jsonPath("$.correos[0].principal").value(true));
  assertNull(email(legacy).getFechaVerificacion());
  request(vera,legacy).andExpect(status().isOk());confirm(vera,legacy,mail.lastCodeFor("vera.heredada@example.test")).andExpect(status().isOk());
  assertNotNull(email(legacy).getFechaVerificacion());
 }

 @Test void onlyOneOfSeveralSimultaneousConfirmationsWinsAndTheCodeIsSingleUse() throws Exception {
  Account sol=account("Sol","DTS");long id=add(sol,"sol@example.test");String code=mail.lastCodeFor("sol@example.test");
  ExecutorService pool=Executors.newFixedThreadPool(6);CountDownLatch go=new CountDownLatch(1);List<Future<Integer>> results=new ArrayList<>();
  for(int i=0;i<6;i++)results.add(pool.submit((Callable<Integer>)()->{go.await();return confirm(sol,id,code).andReturn().getResponse().getStatus();}));
  go.countDown();int ok=0,conflict=0;for(Future<Integer> f:results){int st=f.get();if(st==200)ok++;else if(st==409)conflict++;}
  pool.shutdown();
  assertEquals(1,ok,"una sola confirmación");assertEquals(5,conflict);
  assertEquals(1,tokens(id).stream().filter(v->v.getUsadaEn()!=null).count());assertEquals(1,ops(id).stream().filter("VERIFY_CONFIRM"::equals).count(),"un solo evento de confirmación");
 }

 @Test void principalSelectionPrefersVerifiedEmailsWhenThePrincipalIsRetired() throws Exception {
  Account uma=account("Uma","DTS");long a=add(uma,"uma.a@example.test"),b=add(uma,"uma.b@example.test"),c=add(uma,"uma.c@example.test");
  confirm(uma,c,mail.lastCodeFor("uma.c@example.test")).andExpect(status().isOk());
  call("DELETE","/api/auth/me/correos/"+a,uma.token,null).andExpect(status().isOk());   // a era el principal (sin verificar)
  assertTrue(email(c).getPrincipal(),"se promueve al correo verificado, no al más antiguo sin verificar");assertFalse(email(b).getPrincipal());
 }
}
