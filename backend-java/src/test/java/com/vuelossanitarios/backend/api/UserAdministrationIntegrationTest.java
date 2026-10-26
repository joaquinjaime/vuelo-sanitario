package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.SanitaryFlight;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDateTime;
import java.util.List;
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

/** Ciclo administrativo de usuarios de extremo a extremo sobre HTTP con JWT, seguridad y persistencia reales (H2 en modo SQL Server). La concurrencia real se prueba en el E2E con SQL Server. */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:useradmin;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class UserAdministrationIntegrationTest {
 @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder; @Autowired PlatformTransactionManager txm;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles; @Autowired PatientRepository patients; @Autowired AuditEventRepository events;
 @Autowired FlightRepository flights; @Autowired FlightTypeRepository types; @Autowired FlightStatusRepository statuses; @Autowired SanitaryFlightRepository sanitaryFlights; @Autowired SanitaryRequestStatusRepository requestStatuses;
 /** H2 no tiene DATETIMEOFFSET (tabla de obligaciones de informe): esa consulta se verifica con SQL Server real en el E2E; el resto de las responsabilidades usa el servicio real. */
 @org.springframework.boot.test.context.TestConfiguration static class H2Responsibilities {
  @org.springframework.context.annotation.Bean @org.springframework.context.annotation.Primary com.vuelossanitarios.backend.service.UserResponsibilityService h2Responsibilities(java.time.Clock clock){
   return new com.vuelossanitarios.backend.service.UserResponsibilityService(clock){@Override protected void pendingReports(Long userId,List<com.vuelossanitarios.backend.api.dto.AuthDtos.Blocker> out){}};
  }
 }
 private static int seq=0; private static final String PASSWORD="ClaveSegura-12345";
 private String adminName,adminToken; private User admin;

 private Role role(String code){return roles.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roles.save(r);});}
 private User account(String name,String roleCode,boolean active){
  Person p=new Person();p.setNombre(name);p.setApellido("Prueba");p.setDni(String.valueOf(60000000+(++seq)));persons.save(p);
  User u=new User();u.setUsername(name+seq);u.setPerson(p);u.setActivo(active);u.setEstadoCuenta(active?"ACTIVO":"DESACTIVADO");u.setPasswordHash(encoder.encode(PASSWORD));users.save(u);
  userRoles.save(new UserRole(u,role(roleCode)));return users.findById(u.getId()).orElseThrow();
 }
 private String login(String username,String password) throws Exception {
  return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+username+"\",\"password\":\""+password+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.accessToken");
 }
 private ResultActions get(String path,String token) throws Exception {return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path).header("Authorization","Bearer "+token));}
 private ResultActions send(String method,String path,String token,String body) throws Exception {
  var b=request(org.springframework.http.HttpMethod.valueOf(method),path).header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON);return mvc.perform(body==null?b:b.content(body));
 }
 private String createBody(String name,String dni,String roles,String license){
  return "{\"nombre\":\""+name+"\",\"apellido\":\"Nueva\",\"dni\":\""+dni+"\",\"roles\":["+roles+"],"+(license==null?"":"\"licenciaAeronautica\":\""+license+"\",")+"\"correos\":[{\"direccion\":\""+name.toLowerCase()+"@example.test\",\"tipo\":\"PERSONAL\"}],\"telefonos\":[{\"pais\":\"AR\",\"numero\":\"3815550000\",\"tipo\":\"PERSONAL\"}]}";
 }
 /** Alta, activación y primer ingreso de una cuenta; devuelve su id y nombre de usuario. */
 private long[] provision(String name,String roles,String license) throws Exception {
  String dni=String.valueOf(70000000+(++seq));
  String code=JsonPath.read(send("POST","/api/auth/users",adminToken,createBody(name,dni,roles,license)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.codigo");
  mvc.perform(post("/api/auth/activar-cuenta").contentType(MediaType.APPLICATION_JSON).content("{\"dni\":\""+dni+"\",\"codigo\":\""+code+"\",\"username\":\""+name.toLowerCase()+seq+"\",\"password\":\""+PASSWORD+"\",\"confirmacionPassword\":\""+PASSWORD+"\"}")).andExpect(status().isNoContent());
  return new long[]{users.findWithRolesByUsername(name.toLowerCase()+seq).orElseThrow().getId(),seq};
 }
 private String nameOf(long[] p){return users.findById(p[0]).orElseThrow().getUsername();}

 @BeforeEach void seed(){admin=account("admin","ADMINISTRADOR",true);adminName=admin.getUsername();for(String r:List.of("DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE"))role(r);}
 private void adminLogin() throws Exception {adminToken=login(adminName,PASSWORD);}

 @Test void createActivateLoginRoleChangeInvalidatesTokensAndDeactivationBlocksAccessUntilReactivated() throws Exception {
  adminLogin();
  long[] ana=provision("Ana","\"DTS\"",null);String anaName=nameOf(ana);String anaToken=login(anaName,PASSWORD);
  get("/api/auth/me",anaToken).andExpect(status().isOk()).andExpect(jsonPath("$.roles[0]").value("DTS"));
  // un cambio de roles invalida de inmediato todas las sesiones anteriores
  String body="{\"nombre\":\"Ana\",\"apellido\":\"Nueva\",\"roles\":[\"CENTRO_OPERACIONES\"],\"activo\":true}";
  send("PUT","/api/auth/users/"+ana[0],adminToken,body).andExpect(status().isOk()).andExpect(jsonPath("$.roles[0]").value("CENTRO_OPERACIONES"));
  get("/api/auth/me",anaToken).andExpect(status().isUnauthorized());
  String anaToken2=login(anaName,PASSWORD);get("/api/auth/me",anaToken2).andExpect(status().isOk());
  // desactivación: la sesión vigente y el ingreso quedan bloqueados; el historial permanece
  send("PATCH","/api/auth/users/"+ana[0]+"/deactivate",adminToken,"{\"motivo\":\"fin de contrato\"}").andExpect(status().isOk()).andExpect(jsonPath("$.activo").value(false));
  get("/api/auth/me",anaToken2).andExpect(status().isUnauthorized());get("/api/flights",anaToken2).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+anaName+"\",\"password\":\""+PASSWORD+"\"}")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error").value("Credenciales inválidas"));
  mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"no.existe\",\"password\":\"x\"}")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error").value("Credenciales inválidas"));
  User inactive=users.findById(ana[0]).orElseThrow();assertEquals("DESACTIVADO",inactive.getEstadoCuenta());assertNotNull(inactive.getFechaBaja());assertEquals("fin de contrato",inactive.getMotivoBaja());assertEquals(admin.getId(),inactive.getBajaPor().getId());
  assertTrue(persons.findById(inactive.getPerson().getId()).isPresent(),"la persona se conserva");
  // reactivación: misma cuenta, contraseña temporal, cambio obligatorio y credenciales anteriores inválidas
  String reactivated=send("PATCH","/api/auth/users/"+ana[0]+"/reactivate",adminToken,"{\"nombre\":\"Ana\",\"apellido\":\"Nueva\",\"roles\":[\"DTS\"]}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  String temporary=JsonPath.read(reactivated,"$.contrasenaTemporal");assertNull(users.findById(ana[0]).orElseThrow().getMotivoBaja());assertNull(users.findById(ana[0]).orElseThrow().getBajaPor());
  mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+anaName+"\",\"password\":\""+PASSWORD+"\"}")).andExpect(status().isUnauthorized());
  String tmpToken=login(anaName,temporary);
  get("/api/auth/me",tmpToken).andExpect(status().isOk());                      // lo mínimo para completar el cambio
  get("/api/flights",tmpToken).andExpect(status().isForbidden());                // ningún recurso operativo antes del cambio
  send("POST","/api/auth/me/password",tmpToken,"{\"passwordActual\":\""+temporary+"\",\"nuevaPassword\":\"OtraClave-98765\",\"confirmacionPassword\":\"OtraClave-98765\"}").andExpect(status().isOk());
  get("/api/auth/me",tmpToken).andExpect(status().isUnauthorized());            // el token anterior al cambio ya no sirve
  mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+anaName+"\",\"password\":\""+temporary+"\"}")).andExpect(status().isUnauthorized());   // la temporal reemplazada tampoco
  String finalToken=login(anaName,"OtraClave-98765");get("/api/flights",finalToken).andExpect(status().isOk());
 }

 @Test void anExistingPersonWithoutAnAccountIsLinkedOnlyWithExplicitConfirmationAndMatchingIdentity() throws Exception {
  adminLogin();
  Person known=new Person();known.setNombre("Beatriz");known.setApellido("Nueva");known.setDni("40111222");persons.save(known);Patient pa=new Patient();pa.setPerson(known);patients.save(pa);   // por ejemplo, una persona que consta como paciente
  long before=persons.count();
  String r1=send("POST","/api/auth/users",adminToken,createBody("Beatriz","40.111.222","\"DTS\"",null)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PERSON_EXISTS_WITHOUT_ACCOUNT")).andExpect(jsonPath("$.coincideNombre").value(true)).andReturn().getResponse().getContentAsString();
  assertFalse(r1.contains("paciente")||r1.toLowerCase().contains("patient"),"no se revela información sanitaria");assertEquals(before,persons.count());
  String mismatch=createBody("Otra","40111222","\"DTS\"",null).replace("\"personaExistenteId\"","");
  send("POST","/api/auth/users",adminToken,mismatch.substring(0,mismatch.length()-1)+",\"personaExistenteId\":"+known.getId()+"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PERSON_IDENTITY_MISMATCH"));
  String ok=createBody("Beatriz","40111222","\"DTS\"",null);
  send("POST","/api/auth/users",adminToken,ok.substring(0,ok.length()-1)+",\"personaExistenteId\":"+(known.getId()+999)+"}").andExpect(status().isConflict());
  send("POST","/api/auth/users",adminToken,ok.substring(0,ok.length()-1)+",\"personaExistenteId\":"+known.getId()+"}").andExpect(status().isOk()).andExpect(jsonPath("$.codigo").isNotEmpty());
  assertEquals(before,persons.count(),"la identidad no se duplica");assertEquals(1,users.findAll().stream().filter(u->u.getPerson().getId().equals(known.getId())).count());assertTrue(patients.findByPersonId(known.getId()).isPresent(),"el vínculo con el paciente se conserva");
  send("POST","/api/auth/users",adminToken,ok).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("USER_DNI_ALREADY_EXISTS"));   // ahora ya tiene cuenta
  send("POST","/api/auth/users",adminToken,createBody("Nadia","50999888","\"NO_EXISTE\"",null)).andExpect(status().isBadRequest());
  send("POST","/api/auth/users",adminToken,createBody("Nadia","50999888","\"COMANDANTE\"",null)).andExpect(status().isBadRequest());
  send("POST","/api/auth/users",adminToken,createBody("Nadia","sin-digitos","\"DTS\"",null)).andExpect(status().isBadRequest());
 }

 @Test void theLastActiveAdministratorAndOwnAccountAreProtected() throws Exception {
  adminLogin();long[] other=provision("Otro","\"ADMINISTRADOR\"",null);
  send("PATCH","/api/auth/users/"+admin.getId()+"/deactivate",adminToken,"{}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CANNOT_DEACTIVATE_SELF"));
  send("PUT","/api/auth/users/"+admin.getId(),adminToken,"{\"nombre\":\"admin\",\"apellido\":\"Prueba\",\"roles\":[\"DTS\"],\"activo\":true}").andExpect(status().isForbidden());
  send("POST","/api/auth/users/"+admin.getId()+"/credential-reset",adminToken,null).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CANNOT_RESET_SELF"));
  String otherToken=login(nameOf(other),PASSWORD);
  send("PATCH","/api/auth/users/"+other[0]+"/deactivate",adminToken,"{}").andExpect(status().isOk());                    // quedan dos -> uno
  send("PATCH","/api/auth/users/"+admin.getId()+"/deactivate",otherToken,"{}").andExpect(status().isUnauthorized());     // el desactivado ya no opera
  User lone=users.findById(admin.getId()).orElseThrow();assertTrue(lone.getActivo());
  // sin otro administrador activo no puede quitarse el rol ni desactivarse a quien queda
  long[] third=provision("Tercero","\"ADMINISTRADOR\"",null);
  send("PATCH","/api/auth/users/"+third[0]+"/deactivate",adminToken,"{}").andExpect(status().isOk());
  long[] fourth=provision("Cuarto","\"ADMINISTRADOR\"",null);String fourthToken=login(nameOf(fourth),PASSWORD);
  send("PATCH","/api/auth/users/"+admin.getId()+"/deactivate",fourthToken,"{}").andExpect(status().isOk());                 // el cuarto sí puede: quedan 1 (él)
  send("PATCH","/api/auth/users/"+fourth[0]+"/deactivate",adminToken,"{}").andExpect(status().isUnauthorized());
  assertEquals(1,java.util.stream.Stream.of(admin.getId(),other[0],third[0],fourth[0]).filter(id->users.findById(id).orElseThrow().getActivo()).count());
  send("PUT","/api/auth/users/"+fourth[0],fourthToken,"{\"nombre\":\"Cuarto\",\"apellido\":\"Nueva\",\"roles\":[\"ADMINISTRADOR\"],\"activo\":true}").andExpect(status().isOk());
 }

 private Flight flight(String type,String state,User commander,User requester,String requestState){
  FlightType t=types.findByCodigoAndActivoTrue(type).orElseGet(()->{FlightType x=new FlightType();x.setCodigo(type);x.setNombre(type);return types.save(x);});
  FlightStatus st=state==null?null:statuses.findByCodigo(state).orElseGet(()->{FlightStatus s=new FlightStatus();s.setCodigo(state);s.setNombre(state);s.setOrden((short)1);return statuses.save(s);});
  Flight f=new Flight();f.setCodigo("U-"+(++seq)+"-"+System.nanoTime()%100000);f.setTipoVuelo(t);f.setMotivoVuelo("Prueba");f.setCreadoPor(admin);f.setComandante(commander);f.setEstadoVuelo(st);
  f.setFechaPlanificadaSalida(LocalDateTime.of(2030,1,1,10,0));f.setFechaPlanificadaLlegada(LocalDateTime.of(2030,1,1,12,0));flights.save(f);
  if(requester!=null){
   Person pp=new Person();pp.setNombre("Pac");pp.setApellido("Ficticio");pp.setDni(String.valueOf(80000000+(++seq)));persons.save(pp);Patient pa=new Patient();pa.setPerson(pp);patients.save(pa);
   SanitaryRequestStatus rs=requestStatuses.findByCodigo(requestState).orElseGet(()->{SanitaryRequestStatus x=new SanitaryRequestStatus();x.setCodigo(requestState);x.setNombre(requestState);x.setOrden((short)1);return requestStatuses.save(x);});
   SanitaryFlight s=new SanitaryFlight();s.setFlight(f);s.setPatient(pa);s.setSolicitadoPor(requester);s.setFechaSolicitada(LocalDateTime.of(2030,1,1,9,0));s.setEstadoSolicitud(rs);sanitaryFlights.save(s);f.setSanitario(s);
  }
  return f;
 }
 private void setState(Flight f,String state){new TransactionTemplate(txm).executeWithoutResult(s->{Flight x=flights.findById(f.getId()).orElseThrow();x.setEstadoVuelo(statuses.findByCodigo(state).orElseGet(()->{FlightStatus st=new FlightStatus();st.setCodigo(state);st.setNombre(state);st.setOrden((short)1);return statuses.save(st);}));flights.save(x);});}

 @Test void operationalResponsibilitiesBlockDeactivationAndRoleRemovalWithoutChangingAnythingAndNeverForFinishedFlights() throws Exception {
  adminLogin();
  long[] cmd=provision("Comandante","\"COMANDANTE\"","LIC"+(++seq));User commander=users.findById(cmd[0]).orElseThrow();
  Flight planned=flight("REGRESO_BASE","PLANIFICADO",commander,null,null);Flight done=flight("REGRESO_BASE","COMPLETADO",commander,null,null);Flight cancelled=flight("REGRESO_BASE","CANCELADO",commander,null,null);
  String body=send("PATCH","/api/auth/users/"+cmd[0]+"/deactivate",adminToken,"{\"motivo\":\"x\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("USER_HAS_OPERATIONAL_ASSIGNMENTS")).andReturn().getResponse().getContentAsString();
  assertEquals(1,((List<?>)JsonPath.read(body,"$.impedimentos")).size(),"sólo el vuelo vigente; los completados y cancelados no bloquean");
  assertEquals(planned.getCodigo(),JsonPath.read(body,"$.impedimentos[0].vueloCodigo"));assertEquals("COMANDANTE_ASIGNADO",JsonPath.read(body,"$.impedimentos[0].tipo"));
  assertTrue(users.findById(cmd[0]).orElseThrow().getActivo());assertEquals(commander.getId(),flights.findById(planned.getId()).orElseThrow().getComandante().getId(),"no se reasigna ni se cancela nada automáticamente");
  send("PUT","/api/auth/users/"+cmd[0],adminToken,"{\"nombre\":\"Comandante\",\"apellido\":\"Nueva\",\"roles\":[\"DTS\"],\"activo\":true}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("USER_ROLE_HAS_OPERATIONAL_ASSIGNMENTS"));
  get("/api/auth/users/"+cmd[0],adminToken).andExpect(status().isOk()).andExpect(jsonPath("$.impedimentosBaja[0].vueloCodigo").value(planned.getCodigo())).andExpect(jsonPath("$.roles[0]").value("COMANDANTE"));
  setState(planned,"FINALIZADO");
  send("PATCH","/api/auth/users/"+cmd[0]+"/deactivate",adminToken,"{}").andExpect(status().isOk());   // un vuelo terminado no bloquea la baja
  // DTS con una contrapropuesta pendiente de su respuesta: intervención exclusiva
  long[] dts=provision("Solicitante","\"DTS\"",null);User requester=users.findById(dts[0]).orElseThrow();Flight pending=flight("SANITARIO",null,null,requester,"PENDIENTE_RESPUESTA_DTS");
  send("PATCH","/api/auth/users/"+dts[0]+"/deactivate",adminToken,"{}").andExpect(status().isConflict()).andExpect(jsonPath("$.impedimentos[0].tipo").value("RESPUESTA_DTS_PENDIENTE")).andExpect(jsonPath("$.impedimentos[0].vueloCodigo").value(pending.getCodigo()));
  send("PUT","/api/auth/users/"+dts[0],adminToken,"{\"nombre\":\"Solicitante\",\"apellido\":\"Nueva\",\"roles\":[\"OPERACIONES\"],\"activo\":true}").andExpect(status().isConflict());
  assertNotNull(done);assertNotNull(cancelled);
 }

 @Test void adminResetGeneratesATemporaryPasswordShownOnceAndForcesTheChange() throws Exception {
  adminLogin();long[] ana=provision("Reset","\"DTS\"",null);String name=nameOf(ana);String oldToken=login(name,PASSWORD);
  String response=send("POST","/api/auth/users/"+ana[0]+"/credential-reset",adminToken,null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  String temporary=JsonPath.read(response,"$.contrasenaTemporal");assertTrue(temporary.length()>=12);
  get("/api/auth/me",oldToken).andExpect(status().isUnauthorized());
  User u=users.findById(ana[0]).orElseThrow();assertTrue(u.getDebeCambiarContrasena());assertNotEquals(temporary,u.getPasswordHash());assertTrue(encoder.matches(temporary,u.getPasswordHash()));
  String detail=get("/api/auth/users/"+ana[0],adminToken).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  String list=get("/api/auth/users/search?status=TODOS&size=100",adminToken).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  for(String text:List.of(detail,list,get("/api/auth/users",adminToken).andReturn().getResponse().getContentAsString(),get("/api/auth/me",login(name,temporary)).andReturn().getResponse().getContentAsString())){
   assertFalse(text.contains(temporary),"la contraseña temporal no se puede recuperar por consulta");assertFalse(text.contains("$2a$")||text.toLowerCase().contains("passwordhash")||text.toLowerCase().contains("hash"),"nunca se devuelve el hash");}
  assertTrue(JsonPath.<Boolean>read(detail,"$.debeCambiarContrasena"));
  send("POST","/api/auth/me/password",login(name,temporary),"{\"passwordActual\":\""+temporary+"\",\"nuevaPassword\":\""+temporary+"\",\"confirmacionPassword\":\""+temporary+"\"}").andExpect(status().isBadRequest());   // la nueva debe ser distinta
  send("POST","/api/auth/me/password",login(name,temporary),"{\"passwordActual\":\"incorrecta-123456\",\"nuevaPassword\":\"Nueva-Clave-12345\",\"confirmacionPassword\":\"Nueva-Clave-12345\"}").andExpect(status().isBadRequest());
  send("POST","/api/auth/me/password",login(name,temporary),"{\"passwordActual\":\""+temporary+"\",\"nuevaPassword\":\"corta\",\"confirmacionPassword\":\"corta\"}").andExpect(status().isBadRequest());
  send("POST","/api/auth/users/"+ana[0]+"/credential-reset",adminToken,null).andExpect(status().isOk());
  // reinicio sobre cuentas que no corresponden
  send("POST","/api/auth/users/999999/credential-reset",adminToken,null).andExpect(status().isNotFound());
 }

 @Test void sensitiveAdministrativeOperationsAreAuditedWithoutSecretsAndBeforeAfterRolesArePreserved() throws Exception {
  adminLogin();long[] ana=provision("Audita","\"DTS\"",null);
  send("PUT","/api/auth/users/"+ana[0],adminToken,"{\"nombre\":\"Auditada\",\"apellido\":\"Nueva\",\"roles\":[\"DTS\",\"OPERACIONES\"],\"activo\":true}").andExpect(status().isOk());
  String temporary=JsonPath.read(send("POST","/api/auth/users/"+ana[0]+"/credential-reset",adminToken,null).andReturn().getResponse().getContentAsString(),"$.contrasenaTemporal");
  send("PATCH","/api/auth/users/"+ana[0]+"/deactivate",adminToken,"{\"motivo\":\"licencia prolongada\"}").andExpect(status().isOk());
  String reactivationBody=send("PATCH","/api/auth/users/"+ana[0]+"/reactivate",adminToken,"{\"nombre\":\"Auditada\",\"apellido\":\"Nueva\",\"roles\":[\"OPERACIONES\"]}").andReturn().getResponse().getContentAsString();
  String reactivationPassword=JsonPath.read(reactivationBody,"$.contrasenaTemporal");
  send("POST","/api/auth/me/password",login(nameOf(ana),reactivationPassword),"{\"passwordActual\":\""+reactivationPassword+"\",\"nuevaPassword\":\"Definitiva-Clave-1\",\"confirmacionPassword\":\"Definitiva-Clave-1\"}").andExpect(status().isOk());
  List<AuditEvent> all=events.findAll().stream().filter(e->("USER".equals(e.getEntityType())||"USER_ROLE".equals(e.getEntityType()))&&e.getEntityId()!=null&&e.getEntityId().equals(ana[0])).toList();
  List<String> ops=all.stream().map(AuditEvent::getOperation).toList();
  for(String expected:List.of("USUARIO_CREADO","USUARIO_ACTIVADO","USUARIO_ACTUALIZADO","UPDATE","CONTRASENA_RESTABLECIDA","USUARIO_DESACTIVADO","USUARIO_REACTIVADO","CONTRASENA_CAMBIADA"))assertTrue(ops.contains(expected),"falta el evento "+expected+" en "+ops);
  for(AuditEvent e:all){String text=(e.getOldValues()+" "+e.getNewValues());
   for(String secret:List.of(temporary,reactivationPassword,"Definitiva-Clave-1",PASSWORD,"$2a$","eyJ"))assertFalse(text.contains(secret),e.getOperation()+" no debe contener secretos");
   if(e.getOperation().equals("USUARIO_ACTIVADO")||e.getOperation().equals("CONTRASENA_CAMBIADA"))assertEquals(ana[0],e.getActor().getId(),"el responsable es el propio usuario");
   else if(!e.getOperation().equals("USUARIO_CREADO")||e.getActor()!=null)assertEquals(admin.getId(),e.getActor().getId(),"el responsable es el administrador que operó ("+e.getOperation()+")");}
  AuditEvent roleChange=all.stream().filter(e->"USER_ROLE".equals(e.getEntityType())&&"UPDATE".equals(e.getOperation())).findFirst().orElseThrow();
  assertEquals("{\"roles\":[\"DTS\"]}",roleChange.getOldValues());assertEquals("{\"roles\":[\"DTS\",\"OPERACIONES\"]}",roleChange.getNewValues());
  AuditEvent dataChange=all.stream().filter(e->"USUARIO_ACTUALIZADO".equals(e.getOperation())).findFirst().orElseThrow();assertTrue(dataChange.getOldValues().contains("\"nombre\":\"Audita\"")&&dataChange.getNewValues().contains("\"nombre\":\"Auditada\""));assertFalse(dataChange.getNewValues().contains("dni"));
  // y se consultan con la auditoría V46 (sólo administrador), con los valores saneados
  String page=get("/api/audit?entityType=USER&entityId="+ana[0]+"&size=100",adminToken).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  assertTrue(JsonPath.<Integer>read(page,"$.total")>=6);assertFalse(page.contains(temporary));
 }

 @Test void listingSearchFiltersAndPaginationAreResolvedByTheServerAndEveryEndpointIsAdministratorOnly() throws Exception {
  adminLogin();String marker="Zeta"+(++seq);
  long[] a=provision(marker+"Uno","\"DTS\"",null);long[] b=provision(marker+"Dos","\"OPERACIONES\"",null);long[] c=provision(marker+"Tres","\"DTS\"",null);
  send("PATCH","/api/auth/users/"+c[0]+"/deactivate",adminToken,"{\"motivo\":\"prueba\"}").andExpect(status().isOk());
  String actives=get("/api/auth/users/search?q="+marker+"&status=ACTIVOS",adminToken).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  assertEquals(2,(int)JsonPath.<Integer>read(actives,"$.total"));
  String inactive=get("/api/auth/users/search?q="+marker.toLowerCase()+"&status=INACTIVOS",adminToken).andReturn().getResponse().getContentAsString();
  assertEquals(1,(int)JsonPath.<Integer>read(inactive,"$.total"));assertEquals("prueba",JsonPath.read(inactive,"$.items[0].motivoBaja"));assertEquals("admin Prueba",JsonPath.read(inactive,"$.items[0].bajaPor"));assertNotNull(JsonPath.read(inactive,"$.items[0].fechaBaja"));
  assertEquals(1,(int)JsonPath.<Integer>read(get("/api/auth/users/search?q="+marker+"&role=OPERACIONES",adminToken).andReturn().getResponse().getContentAsString(),"$.total"));
  assertEquals(3,(int)JsonPath.<Integer>read(get("/api/auth/users/search?q="+marker+"&status=TODOS",adminToken).andReturn().getResponse().getContentAsString(),"$.total"));
  String paged=get("/api/auth/users/search?q="+marker+"&status=TODOS&size=2&page=1",adminToken).andReturn().getResponse().getContentAsString();assertEquals(1,((List<?>)JsonPath.read(paged,"$.items")).size());assertEquals(2,(int)JsonPath.<Integer>read(paged,"$.totalPages"));
  assertEquals(0,(int)JsonPath.<Integer>read(get("/api/auth/users/search?q=%25%27%3B--",adminToken).andReturn().getResponse().getContentAsString(),"$.total"),"los comodines y comillas se tratan como texto");
  for(String q:List.of("size=0","size=101","page=-1","status=ROTO","role=a%20b","page=1000&size=100"))get("/api/auth/users/search?"+q,adminToken).andExpect(status().isBadRequest());
  get("/api/auth/users/summary",adminToken).andExpect(status().isOk()).andExpect(jsonPath("$.activos").isNumber()).andExpect(jsonPath("$.inactivos").isNumber());
  get("/api/auth/roles",adminToken).andExpect(status().isOk());get("/api/auth/users/999999",adminToken).andExpect(status().isNotFound());
  // ningún otro perfil, ni sin credenciales
  String nonAdmin=login(nameOf(b),PASSWORD);
  for(String p:List.of("/api/auth/users/search","/api/auth/users/summary","/api/auth/users/"+a[0],"/api/auth/roles","/api/auth/users"))get(p,nonAdmin).andExpect(status().isForbidden());
  send("POST","/api/auth/users/"+a[0]+"/credential-reset",nonAdmin,null).andExpect(status().isForbidden());send("PATCH","/api/auth/users/"+a[0]+"/deactivate",nonAdmin,"{}").andExpect(status().isForbidden());
  send("PUT","/api/auth/users/"+a[0],nonAdmin,"{\"nombre\":\"x\",\"apellido\":\"y\",\"roles\":[\"ADMINISTRADOR\"],\"activo\":true}").andExpect(status().isForbidden());   // sin autoelevación
  mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/auth/users/search")).andExpect(status().isUnauthorized());
  // el perfil propio no permite cambiar roles ni la contraseña de otro mediante identificadores
  String own=get("/api/auth/me",nonAdmin).andReturn().getResponse().getContentAsString();assertFalse(own.toLowerCase().contains("hash"));
  send("POST","/api/auth/me/password",nonAdmin,"{\"passwordActual\":\""+PASSWORD+"\",\"nuevaPassword\":\"Segunda-Clave-123\",\"confirmacionPassword\":\"Segunda-Clave-123\",\"id\":"+a[0]+"}").andExpect(status().isOk());
  assertTrue(encoder.matches(PASSWORD,users.findById(a[0]).orElseThrow().getPasswordHash()),"la contraseña de otro usuario no se modifica");
 }
}
