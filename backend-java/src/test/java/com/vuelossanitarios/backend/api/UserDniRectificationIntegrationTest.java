package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import com.vuelossanitarios.backend.service.AuditService;
import java.util.List;
import java.util.concurrent.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Rectificación del DNI desde el detalle de usuario sobre HTTP con JWT, seguridad y persistencia reales (H2); la unicidad y la concurrencia sobre SQL Server se prueban en el E2E. */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:userdnirectification;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class UserDniRectificationIntegrationTest {
 @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder; @Autowired PlatformTransactionManager txm;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles; @Autowired PatientRepository patients; @Autowired AuditEventRepository events; @Autowired AccountActivationRepository activations;
 @SpyBean AuditService auditSpy;
 /** Las responsabilidades operativas consultan tablas que H2 no puede crear (DATETIMEOFFSET); no intervienen en la rectificación. */
 @org.springframework.boot.test.mock.mockito.MockBean com.vuelossanitarios.backend.service.UserResponsibilityService responsibilities;
 private static int seq=0; private static final String PASSWORD="ClaveSegura-12345"; private static final String REASON="Error de digitación al crear la cuenta";

 private <T> T tx(Supplier<T> work){return new TransactionTemplate(txm).execute(s->work.get());}
 private Role role(String code){return roles.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roles.save(r);});}
 private record Account(long userId,long personId,String username,String token,String hash,Long credentialVersion){}
 private Account account(String name,String roleCode) throws Exception {
  Person p=new Person();p.setNombre(name);p.setApellido("Cuenta");p.setDni(String.valueOf(81000000+(++seq)));persons.save(p);
  User u=new User();u.setUsername(name.toLowerCase()+seq);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");u.setPasswordHash(encoder.encode(PASSWORD));users.save(u);userRoles.save(new UserRole(u,role(roleCode)));
  User fresh=users.findById(u.getId()).orElseThrow();
  return new Account(u.getId(),p.getId(),u.getUsername(),login(u.getUsername()),fresh.getPasswordHash(),fresh.getVersionCredenciales());
 }
 private String login(String username) throws Exception {
  return JsonPath.read(mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+username+"\",\"password\":\""+PASSWORD+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.accessToken");
 }
 private ResultActions call(String method,String path,String token,String body) throws Exception {
  var b=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).contentType(MediaType.APPLICATION_JSON);
  if(token!=null)b=b.header("Authorization","Bearer "+token);
  return mvc.perform(body==null?b:b.content(body));
 }
 private static String body(String dni,long version,Object cotejo,Object account){return "{\"dniNuevo\":\""+dni+"\",\"version\":"+version+",\"motivo\":\""+REASON+"\",\"cotejoDocumental\":"+cotejo+(account==null?"":",\"confirmaCuenta\":"+account)+"}";}
 private Person person(long id){return persons.findById(id).orElseThrow();}
 private long version(long personId){return person(personId).getVersion();}
 private String path(Account a){return "/api/auth/users/"+a.userId()+"/dni";}
 private List<AuditEvent> rectifications(String type,long id){return events.findByEntityTypeAndEntityIdOrderByOccurredAtDesc(type,id).stream().filter(e->e.getOperation().endsWith("_DNI")).toList();}
 private User user(long id){return users.findById(id).orElseThrow();}

 @BeforeEach void seed(){for(String r:List.of("ADMINISTRADOR","DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE"))role(r);reset(auditSpy);}

 @Test void onlyAdministratorsRectifyAUsersDniAndOtherRolesOrAnonymousCallsChangeNothing() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR"),target=account("Objetivo","DTS");String dni=person(target.personId()).getDni();long v=version(target.personId());
  for(String role:List.of("DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE"))
   call("PUT",path(target),account("Otro"+role.substring(0,3),role).token(),body("82000001",v,true,true)).andExpect(status().isForbidden());
  call("PUT",path(target),null,body("82000001",v,true,true)).andExpect(status().isUnauthorized());
  assertEquals(dni,person(target.personId()).getDni());assertEquals(v,version(target.personId()));assertTrue(rectifications("USER",target.userId()).isEmpty());
  call("PUT",path(target),admin.token(),body("82000001",v,true,true)).andExpect(status().isOk());
 }

 @Test void aUserWithoutPatientRecordIsRectifiedFromItsAccountKeepingCredentialsRolesAndSession() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR"),t=account("Sinficha","DTS");long v=version(t.personId());
  call("GET","/api/auth/users/"+t.userId(),admin.token(),null).andExpect(jsonPath("$.versionIdentidad").value(v)).andExpect(jsonPath("$.pacienteId").doesNotExist());
  call("PUT",path(t),admin.token(),body("82.000.011",v,true,null)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("DNI_ACCOUNT_CONFIRMATION_REQUIRED"));
  call("PUT",path(t),admin.token(),body("82.000.011",v,true,true)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(t.userId())).andExpect(jsonPath("$.dni").value("82000011")).andExpect(jsonPath("$.versionIdentidad").value(v+1)).andExpect(jsonPath("$.estado").value("ACTIVO")).andExpect(jsonPath("$.username").value(t.username()));
  User u=user(t.userId());
  assertEquals(t.hash(),u.getPasswordHash());assertEquals(t.credentialVersion(),u.getVersionCredenciales());assertEquals("ACTIVO",u.getEstadoCuenta());assertTrue(u.getActivo());assertEquals(t.personId(),u.getPerson().getId());
  assertEquals(1,tx(()->users.findWithRolesByUsername(t.username()).orElseThrow().getUserRoles().size()));
  call("GET","/api/auth/me",t.token(),null).andExpect(status().isOk());login(t.username());
  List<AuditEvent> audit=rectifications("USER",t.userId());assertEquals(1,audit.size());AuditEvent e=audit.get(0);
  assertEquals("RECTIFY_DNI",e.getOperation());assertEquals(admin.userId(),e.getActor().getId());
  assertTrue(e.getNewValues().contains("\"cuentaEstado\":\"ACTIVO\"")&&e.getNewValues().contains("\"cotejoDocumental\":true")&&e.getNewValues().contains(REASON)&&e.getNewValues().contains("\"usuarioId\":"+t.userId()));
  assertFalse((e.getOldValues()+e.getNewValues()).contains("82000011"));
  assertTrue(patients.findByPersonId(t.personId()).isEmpty(),"no se crea ninguna ficha de paciente");
  call("GET","/api/audit?entityType=USER&entityId="+t.userId()+"&operation=RECTIFY_DNI",admin.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.items[0].operationLabel").value("Rectificación de DNI"));
 }

 @Test void aUserWhoIsAlsoAPatientIsRectifiedConsistentlyFromBothContextsWithoutDuplicates() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR"),t=account("Ambos","DTS");long patientId=tx(()->{Patient pa=new Patient();pa.setPerson(person(t.personId()));return patients.save(pa).getId();});
  long v=version(t.personId());long personsBefore=persons.count(),patientsBefore=patients.count();
  call("GET","/api/auth/users/"+t.userId(),admin.token(),null).andExpect(jsonPath("$.pacienteId").value(patientId));
  call("PUT",path(t),admin.token(),body("82000021",v,true,true)).andExpect(status().isOk()).andExpect(jsonPath("$.dni").value("82000021")).andExpect(jsonPath("$.pacienteId").value(patientId));
  call("GET","/api/patients/"+patientId,admin.token(),null).andExpect(jsonPath("$.dni").value("82000021")).andExpect(jsonPath("$.version").value(v+1)).andExpect(jsonPath("$.cuentaEstado").value("ACTIVO"));
  assertEquals(personsBefore,persons.count());assertEquals(patientsBefore,patients.count());
  assertEquals(1,rectifications("PATIENT_IDENTITY",patientId).size(),"un único evento, bajo la ficha");assertTrue(rectifications("USER",t.userId()).isEmpty());
  call("GET","/api/patients/"+patientId+"/corrections",admin.token(),null).andExpect(jsonPath("$.items[0].operacion").value("RECTIFY_DNI"));
  // el camino inverso usa las mismas reglas: la versión que quedó vigente es la de la persona compartida
  call("PUT","/api/patients/"+patientId+"/dni",admin.token(),body("82000022",v,true,true)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PATIENT_STALE_IDENTITY"));
  call("PUT","/api/patients/"+patientId+"/dni",admin.token(),body("82000022",v+1,true,true)).andExpect(status().isOk());
  call("GET","/api/auth/users/"+t.userId(),admin.token(),null).andExpect(jsonPath("$.dni").value("82000022"));
 }

 @Test void aDeactivatedAccountIsRectifiedWithoutBeingReactivated() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR"),t=account("Inactivo","DTS");
  tx(()->{User u=user(t.userId());u.setActivo(false);u.setEstadoCuenta("DESACTIVADO");u.setMotivoBaja("Baja de prueba");return users.saveAndFlush(u);});
  String hash=user(t.userId()).getPasswordHash();long v=version(t.personId());
  call("PUT",path(t),admin.token(),body("82000031",v,true,true)).andExpect(status().isOk()).andExpect(jsonPath("$.activo").value(false)).andExpect(jsonPath("$.estado").value("DESACTIVADO")).andExpect(jsonPath("$.motivoBaja").value("Baja de prueba")).andExpect(jsonPath("$.dni").value("82000031"));
  User u=user(t.userId());assertFalse(u.getActivo());assertEquals("DESACTIVADO",u.getEstadoCuenta());assertEquals(hash,u.getPasswordHash());assertEquals("Baja de prueba",u.getMotivoBaja());
  call("POST","/api/auth/login",null,"{\"username\":\""+t.username()+"\",\"password\":\""+PASSWORD+"\"}").andExpect(status().isUnauthorized());
  assertTrue(rectifications("USER",t.userId()).get(0).getNewValues().contains("\"cuentaEstado\":\"DESACTIVADO\""));
 }

 @Test void aPendingAccountKeepsItsActivationCodeAndActivatesOnlyWithTheCorrectedDni() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR");
  String created=call("POST","/api/auth/users",admin.token(),"{\"nombre\":\"Pendiente\",\"apellido\":\"Activa\",\"dni\":\"82000041\",\"roles\":[\"DTS\"],\"correos\":[{\"direccion\":\"pendiente@example.test\"}],\"telefonos\":[{\"pais\":\"AR\",\"numero\":\"3815551234\"}]}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  String code=JsonPath.read(created,"$.codigo");User pending=tx(()->persons.findByDni("82000041").flatMap(p->users.findByPersonId(p.getId())).orElseThrow());long personId=pending.getPerson().getId();
  var hashBefore=tx(()->activations.findOpenByUserId(pending.getId()).stream().map(a->a.getTokenHash()+"|"+a.getExpiresAt()+"|"+a.getUsedAt()).toList());assertEquals(1,hashBefore.size());
  call("PUT","/api/auth/users/"+pending.getId()+"/dni",admin.token(),body("82000042",version(personId),true,true)).andExpect(status().isOk()).andExpect(jsonPath("$.estado").value("PENDIENTE_ACTIVACION")).andExpect(jsonPath("$.dni").value("82000042"));
  assertEquals("PENDIENTE_ACTIVACION",user(pending.getId()).getEstadoCuenta());assertNull(user(pending.getId()).getPasswordHash());
  assertEquals(hashBefore,tx(()->activations.findOpenByUserId(pending.getId()).stream().map(a->a.getTokenHash()+"|"+a.getExpiresAt()+"|"+a.getUsedAt()).toList()),"el código vigente no se toca ni se regenera");
  String activation="{\"dni\":\"%s\",\"codigo\":\""+code+"\",\"username\":\"pendiente1\",\"password\":\""+PASSWORD+"\",\"confirmacionPassword\":\""+PASSWORD+"\"}";
  call("POST","/api/auth/activar-cuenta",null,activation.formatted("82000041")).andExpect(status().isNotFound());                  // el DNI anterior ya no activa
  assertEquals("PENDIENTE_ACTIVACION",user(pending.getId()).getEstadoCuenta());
  call("POST","/api/auth/activar-cuenta",null,activation.formatted("82000042").replace(code,"codigo-equivocado-123")).andExpect(status().isBadRequest());   // el DNI correcto no basta sin el código
  call("POST","/api/auth/activar-cuenta",null,activation.formatted("82.000.042")).andExpect(status().isNoContent());               // con el corregido y el mismo código, sí
  assertEquals("ACTIVO",user(pending.getId()).getEstadoCuenta());login("pendiente1");
  call("POST","/api/auth/activar-cuenta",null,activation.formatted("82000042")).andExpect(status().isConflict());                   // y sólo una vez
 }

 @Test void anOccupiedDniEquivalentFormatsInvalidDataAndMissingAccountsAreRejectedWithoutChanges() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR"),t=account("Uno","DTS"),other=account("Dos","DTS");long v=version(t.personId()),vo=version(other.personId());String otherDni=person(other.personId()).getDni();
  for(String taken:List.of(otherDni,otherDni.substring(0,2)+"."+otherDni.substring(2,5)+"."+otherDni.substring(5)," "+otherDni+" "))
   call("PUT",path(t),admin.token(),body(taken,v,true,true)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DNI_ALREADY_REGISTERED"));
  String current=person(t.personId()).getDni();
  call("PUT",path(t),admin.token(),body(current,v,true,true)).andExpect(status().isBadRequest());
  call("PUT",path(t),admin.token(),body(current.substring(0,2)+"."+current.substring(2,5)+"."+current.substring(5),v,true,true)).andExpect(status().isBadRequest());
  for(String bad:List.of("abc","123456","1234567890123"))call("PUT",path(t),admin.token(),body(bad,v,true,true)).andExpect(status().isBadRequest());
  call("PUT",path(t),admin.token(),body("82000051",v,false,true)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("DNI_COTEJO_REQUIRED"));
  call("PUT",path(t),admin.token(),"{\"dniNuevo\":\"82000051\",\"version\":"+v+",\"motivo\":\"corto\",\"cotejoDocumental\":true,\"confirmaCuenta\":true}").andExpect(status().isBadRequest());
  call("PUT",path(t),admin.token(),"{\"dniNuevo\":\"82000051\",\"version\":"+v+",\"motivo\":\""+REASON+"\",\"cotejoDocumental\":true,\"confirmaCuenta\":true,\"personId\":"+other.personId()+"}").andExpect(status().isBadRequest());  // no se acepta un identificador de persona
  call("PUT",path(t),admin.token(),body("82000051",v+7,true,true)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PATIENT_STALE_IDENTITY"));
  call("PUT","/api/auth/users/999999/dni",admin.token(),body("82000051",v,true,true)).andExpect(status().isNotFound());
  assertEquals(current,person(t.personId()).getDni());assertEquals(otherDni,person(other.personId()).getDni());assertEquals(v,version(t.personId()));assertEquals(vo,version(other.personId()));
  assertTrue(rectifications("USER",t.userId()).isEmpty()&&rectifications("USER",other.userId()).isEmpty());
 }

 @Test void twoAdministratorsWithTheSameVersionNeverBothSucceed() throws Exception {
  Account a1=account("AdminUno","ADMINISTRADOR"),a2=account("AdminDos","ADMINISTRADOR"),t=account("Carrera","DTS");long v=version(t.personId());
  ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch start=new CountDownLatch(1);
  try{
   Future<Integer> r1=pool.submit(()->{start.await();return call("PUT",path(t),a1.token(),body("82000061",v,true,true)).andReturn().getResponse().getStatus();});
   Future<Integer> r2=pool.submit(()->{start.await();return call("PUT",path(t),a2.token(),body("82000062",v,true,true)).andReturn().getResponse().getStatus();});
   start.countDown();List<Integer> statuses=List.of(r1.get(30,TimeUnit.SECONDS),r2.get(30,TimeUnit.SECONDS));
   assertEquals(1,statuses.stream().filter(s->s==200).count(),"statuses="+statuses);assertEquals(1,statuses.stream().filter(s->s==409).count(),"statuses="+statuses);
  }finally{pool.shutdownNow();}
  assertEquals(1,rectifications("USER",t.userId()).size());assertEquals(v+1,version(t.personId()));
 }

 @Test void anAuditFailureRollsBackTheDniChangeAndTheAccountStaysUntouched() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR"),t=account("Revierte","DTS");long v=version(t.personId());String dni=person(t.personId()).getDni();
  tx(()->{doThrow(new IllegalStateException("auditoría caída")).when(auditSpy).record(any(),any(),eq("USER"),any(),eq("RECTIFY_DNI"),any(),any());return null;});
  call("PUT",path(t),admin.token(),body("82000071",v,true,true)).andExpect(status().is5xxServerError());
  assertEquals(dni,person(t.personId()).getDni());assertEquals(v,version(t.personId()));assertTrue(rectifications("USER",t.userId()).isEmpty());assertEquals(t.hash(),user(t.userId()).getPasswordHash());
  reset(auditSpy);
  call("PUT",path(t),admin.token(),body("82000071",v,true,true)).andExpect(status().isOk());
 }
}
