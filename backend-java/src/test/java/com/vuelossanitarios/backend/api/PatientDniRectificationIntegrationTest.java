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

/** Rectificación del DNI sobre HTTP con JWT, seguridad y persistencia reales (H2). La unicidad con SQL Server y la concurrencia sobre el índice se prueban en el E2E. */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:dnirectification;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class PatientDniRectificationIntegrationTest {
 @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder; @Autowired PlatformTransactionManager txm;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles; @Autowired PatientRepository patients; @Autowired AuditEventRepository events;
 @SpyBean AuditService auditSpy;
 private static int seq=0; private static final String PASSWORD="ClaveSegura-12345";

 private <T> T tx(Supplier<T> work){return new TransactionTemplate(txm).execute(s->work.get());}
 private Role role(String code){return roles.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roles.save(r);});}
 private record Account(long userId,long personId,String username,String token,String hash,Long credentialVersion){}
 private Account account(String name,String roleCode) throws Exception {
  Person p=new Person();p.setNombre(name);p.setApellido("Identidad");p.setDni(String.valueOf(71000000+(++seq)));persons.save(p);
  User u=new User();u.setUsername(name.toLowerCase()+seq);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");u.setPasswordHash(encoder.encode(PASSWORD));users.save(u);userRoles.save(new UserRole(u,role(roleCode)));
  return new Account(u.getId(),p.getId(),u.getUsername(),login(u.getUsername()),users.findById(u.getId()).orElseThrow().getPasswordHash(),users.findById(u.getId()).orElseThrow().getVersionCredenciales());
 }
 private String login(String username) throws Exception {
  return JsonPath.read(mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+username+"\",\"password\":\""+PASSWORD+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.accessToken");
 }
 private record Ficha(long patientId,long personId,String dni){}
 /** Paciente sin cuenta. */
 private Ficha patient(String dni){return tx(()->{Person p=new Person();p.setNombre("Paciente");p.setApellido("Prueba"+(++seq));p.setDni(dni);persons.save(p);Patient pa=new Patient();pa.setPerson(p);return new Ficha(patients.save(pa).getId(),p.getId(),dni);});}
 private long patientOf(long personId){return tx(()->{Patient pa=new Patient();pa.setPerson(persons.findById(personId).orElseThrow());return patients.save(pa).getId();});}
 private ResultActions call(String method,String path,String token,String body) throws Exception {
  var b=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).contentType(MediaType.APPLICATION_JSON);
  if(token!=null)b=b.header("Authorization","Bearer "+token);
  return mvc.perform(body==null?b:b.content(body));
 }
 private static String body(String dni,long version,String reason,Object cotejo,Object account){
  return "{\"dniNuevo\":\""+dni+"\",\"version\":"+version+",\"motivo\":\""+reason+"\",\"cotejoDocumental\":"+cotejo+(account==null?"":",\"confirmaCuenta\":"+account)+"}";
 }
 private Person person(long id){return persons.findById(id).orElseThrow();}
 private List<AuditEvent> rectifications(long patientId){return events.findByEntityTypeAndEntityIdOrderByOccurredAtDesc("PATIENT_IDENTITY",patientId).stream().filter(e->e.getOperation().endsWith("_DNI")).toList();}
 private static final String REASON="Error de digitación al cargar la solicitud";

 @BeforeEach void seed(){for(String r:List.of("ADMINISTRADOR","DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE"))role(r);reset(auditSpy);}

 @Test void onlyAdministratorsRectifyAndEveryOtherRoleOrAnonymousCallIsRejectedWithoutChanges() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR");Ficha f=patient("50000001");
  for(String role:List.of("DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE")){
   Account other=account("Otro"+role.substring(0,3),role);
   call("PUT","/api/patients/"+f.patientId()+"/dni",other.token(),body("50000002",person(f.personId()).getVersion(),REASON,true,null)).andExpect(status().isForbidden());
  }
  call("PUT","/api/patients/"+f.patientId()+"/dni",null,body("50000002",0,REASON,true,null)).andExpect(status().isUnauthorized());
  assertEquals("50000001",person(f.personId()).getDni());assertTrue(rectifications(f.patientId()).isEmpty());
  call("PUT","/api/patients/"+f.patientId()+"/dni",admin.token(),body("50000002",person(f.personId()).getVersion(),REASON,true,null)).andExpect(status().isOk());
  assertEquals("50000002",person(f.personId()).getDni());
 }

 @Test void rectifyingAPatientWithoutAccountKeepsTheSameIdentityAndRecordsAMaskedAudit() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR");Ficha f=patient("50000011");long version=person(f.personId()).getVersion();
  call("PUT","/api/patients/"+f.patientId()+"/dni",admin.token(),body("50.000.012",version,REASON,true,null)).andExpect(status().isOk())
   .andExpect(jsonPath("$.id").value(f.patientId())).andExpect(jsonPath("$.dni").value("50000012")).andExpect(jsonPath("$.version").value(version+1)).andExpect(jsonPath("$.cuentaEstado").doesNotExist());
  Person p=person(f.personId());assertEquals("50000012",p.getDni());assertEquals(version+1,p.getVersion());assertEquals("Paciente",p.getNombre());
  assertEquals(1,patients.findAll().stream().filter(x->x.getPerson().getId().equals(f.personId())).count(),"una sola ficha por persona");
  assertEquals(f.patientId(),tx(()->patients.findWithPersonByDni("50000012").orElseThrow().getId()));assertTrue(patients.findWithPersonByDni("50000011").isEmpty());
  List<AuditEvent> audit=rectifications(f.patientId());assertEquals(1,audit.size());AuditEvent e=audit.get(0);
  assertEquals("RECTIFY_DNI",e.getOperation());assertEquals(admin.userId(),e.getActor().getId());
  assertEquals("{\"terminacionAnterior\":\"0011\"}",e.getOldValues());assertTrue(e.getNewValues().contains("\"terminacionNueva\":\"0012\""));assertTrue(e.getNewValues().contains("\"cotejoDocumental\":true"));assertTrue(e.getNewValues().contains(REASON));
  assertFalse((e.getOldValues()+e.getNewValues()).contains("50000011"));assertFalse((e.getOldValues()+e.getNewValues()).contains("50000012"));
  call("GET","/api/patients/"+f.patientId()+"/corrections",admin.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.items[0].operacion").value("RECTIFY_DNI")).andExpect(jsonPath("$.items[0].cambios[0].campo").value("dni")).andExpect(jsonPath("$.items[0].cambios[0].anterior").value("••••0011")).andExpect(jsonPath("$.items[0].cambios[0].nuevo").value("••••0012")).andExpect(jsonPath("$.items[0].responsable").value(admin.username()));
 }

 @Test void aPatientWithoutDniReceivesOneAsAnAssignment() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR");Ficha f=patient("50000021");
  tx(()->{Person p=person(f.personId());p.setDni(null);return persons.saveAndFlush(p);});
  call("PUT","/api/patients/"+f.patientId()+"/dni",admin.token(),body("50000022",person(f.personId()).getVersion(),"Se obtuvo el documento del paciente",true,null)).andExpect(status().isOk()).andExpect(jsonPath("$.dni").value("50000022"));
  assertEquals("ASSIGN_DNI",rectifications(f.patientId()).get(0).getOperation());
 }

 @Test void aPersonWithAccountNeedsAcknowledgementAndKeepsCredentialsRolesSessionsAndState() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR");Account medico=account("Dts","DTS");long patientId=patientOf(medico.personId());
  String dni=person(medico.personId()).getDni();long version=person(medico.personId()).getVersion();
  call("GET","/api/patients/"+patientId,admin.token(),null).andExpect(jsonPath("$.cuentaEstado").value("ACTIVO"));
  call("PUT","/api/patients/"+patientId+"/dni",admin.token(),body("50000031",version,REASON,true,null)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("DNI_ACCOUNT_CONFIRMATION_REQUIRED"));
  call("PUT","/api/patients/"+patientId+"/dni",admin.token(),body("50000031",version,REASON,true,false)).andExpect(status().isBadRequest());
  assertEquals(dni,person(medico.personId()).getDni(),"sin confirmación no cambia nada");
  call("PUT","/api/patients/"+patientId+"/dni",admin.token(),body("50000031",version,REASON,true,true)).andExpect(status().isOk()).andExpect(jsonPath("$.cuentaEstado").value("ACTIVO"));
  assertEquals("50000031",person(medico.personId()).getDni());
  User u=users.findById(medico.userId()).orElseThrow();
  assertEquals(medico.hash(),u.getPasswordHash());assertEquals(medico.credentialVersion(),u.getVersionCredenciales());assertEquals("ACTIVO",u.getEstadoCuenta());assertTrue(u.getActivo());assertEquals(medico.username(),u.getUsername());assertEquals(medico.personId(),u.getPerson().getId());
  assertEquals(1,tx(()->users.findWithRolesByUsername(medico.username()).orElseThrow().getUserRoles().size()),"los roles se conservan");
  call("GET","/api/auth/me",medico.token(),null).andExpect(status().isOk());   // la sesión vigente sigue siendo válida
  login(medico.username());                                                   // y el ingreso con las mismas credenciales también
  assertTrue(rectifications(patientId).get(0).getNewValues().contains("\"cuentaEstado\":\"ACTIVO\""));
 }

 @Test void anOccupiedDniIsRejectedEvenInEquivalentFormatsAndBothIdentitiesRemainUntouched() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR");Ficha a=patient("50000041"),b=patient("50000042");long va=person(a.personId()).getVersion(),vb=person(b.personId()).getVersion();
  for(String taken:List.of("50000042","50.000.042"," 50-000-042 "))
   call("PUT","/api/patients/"+a.patientId()+"/dni",admin.token(),body(taken,va,REASON,true,null)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DNI_ALREADY_REGISTERED"));
  assertEquals("50000041",person(a.personId()).getDni());assertEquals("50000042",person(b.personId()).getDni());assertEquals(va,person(a.personId()).getVersion());assertEquals(vb,person(b.personId()).getVersion());
  assertEquals(2,patients.findAll().stream().filter(x->List.of(a.personId(),b.personId()).contains(x.getPerson().getId())).count());
  assertTrue(rectifications(a.patientId()).isEmpty()&&rectifications(b.patientId()).isEmpty());
 }

 @Test void invalidRequestsAreRejectedWithoutChanges() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR");Ficha f=patient("50000051");long v=person(f.personId()).getVersion();String path="/api/patients/"+f.patientId()+"/dni";
  call("PUT",path,admin.token(),body("50000051",v,REASON,true,null)).andExpect(status().isBadRequest());                // igual al actual
  call("PUT",path,admin.token(),body("50.000.051",v,REASON,true,null)).andExpect(status().isBadRequest());             // equivalente al actual
  for(String bad:List.of("abc","50A00052","123456","1234567890123"))call("PUT",path,admin.token(),body(bad,v,REASON,true,null)).andExpect(status().isBadRequest());
  call("PUT",path,admin.token(),body("50000052",v,REASON,false,null)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("DNI_COTEJO_REQUIRED"));
  call("PUT",path,admin.token(),body("50000052",v,REASON,"null",null)).andExpect(status().isBadRequest());
  for(String reason:List.of("","   ","corto"))call("PUT",path,admin.token(),body("50000052",v,reason,true,null)).andExpect(status().isBadRequest());
  call("PUT",path,admin.token(),"{\"dniNuevo\":\"50000052\",\"version\":"+v+",\"motivo\":\""+REASON+"\",\"cotejoDocumental\":true,\"nombre\":\"Otro\"}").andExpect(status().isBadRequest());   // campo desconocido
  call("PUT",path,admin.token(),null).andExpect(status().isBadRequest());
  call("PUT","/api/patients/999999/dni",admin.token(),body("50000052",v,REASON,true,null)).andExpect(status().isNotFound());
  assertEquals("50000051",person(f.personId()).getDni());assertEquals(v,person(f.personId()).getVersion());assertTrue(rectifications(f.patientId()).isEmpty());
 }

 @Test void aStaleVersionIsRejectedAndTheCurrentOneSucceeds() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR");Ficha f=patient("50000061");long v=person(f.personId()).getVersion();String path="/api/patients/"+f.patientId()+"/dni";
  call("PUT","/api/patients/"+f.patientId()+"/identity",admin.token(),"{\"nombre\":\"Paciente\",\"apellido\":\"Corregido\",\"version\":"+v+",\"motivo\":\"Corrección de apellido\"}").andExpect(status().isOk());
  call("PUT",path,admin.token(),body("50000062",v,REASON,true,null)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PATIENT_STALE_IDENTITY"));
  assertEquals("50000061",person(f.personId()).getDni());
  call("PUT",path,admin.token(),body("50000062",v+1,REASON,true,null)).andExpect(status().isOk());
  assertEquals("Corregido",person(f.personId()).getApellido(),"la rectificación no pisa el cambio anterior");
 }

 @Test void twoAdministratorsWithTheSameVersionNeverBothSucceed() throws Exception {
  Account a1=account("AdminUno","ADMINISTRADOR"),a2=account("AdminDos","ADMINISTRADOR");Ficha f=patient("50000071");long v=person(f.personId()).getVersion();
  ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch start=new CountDownLatch(1);
  try{
   Callable<Integer> first=()->{start.await();return call("PUT","/api/patients/"+f.patientId()+"/dni",a1.token(),body("50000072",v,REASON,true,null)).andReturn().getResponse().getStatus();};
   Callable<Integer> second=()->{start.await();return call("PUT","/api/patients/"+f.patientId()+"/dni",a2.token(),body("50000073",v,REASON,true,null)).andReturn().getResponse().getStatus();};
   Future<Integer> r1=pool.submit(first),r2=pool.submit(second);start.countDown();
   List<Integer> statuses=List.of(r1.get(30,TimeUnit.SECONDS),r2.get(30,TimeUnit.SECONDS));
   assertEquals(1,statuses.stream().filter(s->s==200).count(),"statuses="+statuses);assertEquals(1,statuses.stream().filter(s->s==409).count(),"statuses="+statuses);
  }finally{pool.shutdownNow();}
  assertTrue(List.of("50000072","50000073").contains(person(f.personId()).getDni()));assertEquals(v+1,person(f.personId()).getVersion());assertEquals(1,rectifications(f.patientId()).size());
 }

 @Test void anAuditFailureRollsBackTheDniChange() throws Exception {
  Account admin=account("Admin","ADMINISTRADOR");Ficha f=patient("50000081");long v=person(f.personId()).getVersion();
  tx(()->{doThrow(new IllegalStateException("auditoría caída")).when(auditSpy).record(any(),any(),eq("PATIENT_IDENTITY"),any(),eq("RECTIFY_DNI"),any(),any());return null;});   // el proxy de AuditService exige una transacción incluso al declarar el doble
  call("PUT","/api/patients/"+f.patientId()+"/dni",admin.token(),body("50000082",v,REASON,true,null)).andExpect(status().is5xxServerError());
  Person p=person(f.personId());assertEquals("50000081",p.getDni(),"sin auditoría no hay cambio");assertEquals(v,p.getVersion());assertTrue(rectifications(f.patientId()).isEmpty());
  reset(auditSpy);
  call("PUT","/api/patients/"+f.patientId()+"/dni",admin.token(),body("50000082",v,REASON,true,null)).andExpect(status().isOk());
 }
}
