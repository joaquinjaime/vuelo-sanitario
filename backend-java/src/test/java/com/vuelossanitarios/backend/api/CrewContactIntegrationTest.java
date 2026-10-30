package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import com.vuelossanitarios.backend.domain.flight.SanitaryFlight;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.EmailContact;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.person.PhoneContact;
import com.vuelossanitarios.backend.domain.person.PhoneNumbers;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import jakarta.persistence.EntityManagerFactory;
import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Supplier;
import org.hibernate.SessionFactory;
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
 * Consulta de contactos laborales de la tripulación por Operaciones, sobre HTTP con JWT, seguridad y persistencia reales (H2).
 * Los índices filtrados y la integridad con SQL Server se comprueban en el E2E.
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:crewcontacts;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "spring.jpa.properties.hibernate.generate_statistics=true",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class CrewContactIntegrationTest {
 @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder; @Autowired PlatformTransactionManager txm; @Autowired EntityManagerFactory emf;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles; @Autowired PatientRepository patients;
 @Autowired FlightTypeRepository types; @Autowired FlightStatusRepository statuses; @Autowired FlightRepository flights; @Autowired FlightCrewRepository crews; @Autowired CrewRoleRepository crewRoles;
 @Autowired SanitaryFlightRepository sanitaryFlights; @Autowired SanitaryRequestStatusRepository requestStatuses;
 @Autowired PhoneContactRepository phones; @Autowired EmailContactRepository emails; @Autowired AuditEventRepository events;
 private static int seq=0; private static final String PASSWORD="ClaveSegura-12345";

 private record Account(long userId,long personId,String username,String dni,String token){}
 private <T> T tx(Supplier<T> work){return new TransactionTemplate(txm).execute(s->work.get());}
 private Role role(String code){return roles.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roles.save(r);});}
 private CrewRole crewRole(String code,String name){return crewRoles.findByCodigo(code).orElseGet(()->{CrewRole r=new CrewRole();r.setCodigo(code);r.setNombre(name);return crewRoles.save(r);});}
 private Account account(String name,String... roleCodes) throws Exception {
  Person p=new Person();p.setNombre(name);p.setApellido("Tripulante");p.setDni(String.valueOf(64000000+(++seq)));persons.save(p);
  User u=new User();u.setUsername(name.toLowerCase()+seq);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");u.setPasswordHash(encoder.encode(PASSWORD));users.save(u);
  for(String r:roleCodes)userRoles.save(new UserRole(u,role(r)));
  String token=roleCodes.length==0?null:JsonPath.read(mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+u.getUsername()+"\",\"password\":\""+PASSWORD+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.accessToken");
  return new Account(u.getId(),p.getId(),u.getUsername(),p.getDni(),token);
 }
 private PhoneContact phone(Account a,String number,String type,boolean main){PhoneContact c=new PhoneContact();c.setPerson(persons.findById(a.personId()).orElseThrow());c.setValidated(PhoneNumbers.parse(number,"AR"));c.setTipo(type);c.setPrincipal(main);return phones.save(c);}
 private EmailContact email(Account a,String address,String type,boolean main){EmailContact c=new EmailContact();c.setPerson(persons.findById(a.personId()).orElseThrow());c.setDireccion(address);c.setTipo(type);c.setPrincipal(main);c.setFechaVerificacion(LocalDateTime.now());return emails.save(c);}
 private EmailContact unverifiedEmail(Account a,String address,String type,boolean main){EmailContact c=new EmailContact();c.setPerson(persons.findById(a.personId()).orElseThrow());c.setDireccion(address);c.setTipo(type);c.setPrincipal(main);return emails.save(c);}
 private PhoneContact unvalidatedPhone(Account a,String number,String type,boolean main){PhoneContact c=new PhoneContact();c.setPerson(persons.findById(a.personId()).orElseThrow());c.setNumero(number);c.setTipo(type);c.setPrincipal(main);return phones.save(c);}
 private static String intl(String number){return PhoneNumbers.parse(number,"AR").international();}
 private FlightStatus flightState(String code){return statuses.findByCodigo(code).orElseGet(()->{FlightStatus s=new FlightStatus();s.setCodigo(code);s.setNombre(code);s.setOrden((short)1);return statuses.save(s);});}
 private FlightType type(String code){return types.findByCodigoAndActivoTrue(code).orElseGet(()->{FlightType t=new FlightType();t.setCodigo(code);t.setNombre(code);return types.save(t);});}
 private Flight flight(String state,Account commander){
  Flight f=new Flight();f.setCodigo("CC-"+(++seq)+"-"+System.nanoTime()%100000);f.setTipoVuelo(type("OPERATIVO"));f.setMotivoVuelo("Prueba de contactos");f.setCreadoPor(users.findById(commander==null?firstUser():commander.userId()).orElseThrow());
  f.setEstadoVuelo(flightState(state));if(commander!=null)f.setComandante(users.findById(commander.userId()).orElseThrow());return flights.save(f);
 }
 private long firstUser(){return users.findAll().get(0).getId();}
 private FlightCrew assign(Flight f,Account a,String roleCode){
  FlightCrew c=new FlightCrew();c.setFlight(f);c.setUser(users.findById(a.userId()).orElseThrow());c.setCrewRole(crewRole(roleCode,roleCode));c.setAsignadoPor(c.getUser());return crews.save(c);
 }
 private ResultActions get(long flightId,String token) throws Exception {
  var b=MockMvcRequestBuilders.get("/api/flights/"+flightId+"/crew/contacts");if(token!=null)b=b.header("Authorization","Bearer "+token);return mvc.perform(b);
 }
 private String body(long flightId,String token) throws Exception {return get(flightId,token).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();}
 private List<AuditEvent> crewViews(long flightId){return tx(()->{var l=events.findAll().stream().filter(e->"FLIGHT_CREW_CONTACT".equals(e.getEntityType())&&e.getFlight()!=null&&e.getFlight().getId().equals(flightId)).toList();l.forEach(e->{e.getActor().getId();});return l;});}
 private long allCrewViews(){return tx(()->events.findAll().stream().filter(e->"FLIGHT_CREW_CONTACT".equals(e.getEntityType())).count());}
 private String member(String json,String name){return JsonPath.<List<String>>read(json,"$.tripulantes[?(@.nombre=='"+name+"')].estado").get(0);}

 @BeforeEach void seed(){for(String r:List.of("ADMINISTRADOR","DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE"))role(r);}

 @Test void operationsAndOperationsCenterReadOnlyWorkContactsOfCommanderAndCurrentCrew() throws Exception {
  Account ops=account("Omar","OPERACIONES"),center=account("Celia","CENTRO_OPERACIONES");
  Account cmd=account("Comandante","COMANDANTE"),doctor=account("Doctora"),nurse=account("Enfermero"),copilot=account("Copiloto"),nobody=account("Sinnada");
  phone(cmd,"+54 381 555-0101","LABORAL",false);phone(cmd,"3815550102","PERSONAL",true);email(cmd,"cmd.privado@correo.test","PERSONAL",true);
  phone(doctor,"3815550201","LABORAL",true);email(doctor,"doctora@trabajo.test","LABORAL",false);email(doctor,"doctora.privado@correo.test","PERSONAL",false);
  phone(nurse,"3815550301","PERSONAL",true);email(nurse,"enfermero.privado@correo.test","PERSONAL",true);
  phone(copilot,"3815550401","PERSONAL",true);phone(copilot,"3815550402","LABORAL",false);
  Flight f=flight("PLANIFICADO",cmd);assign(f,cmd,"COMANDANTE");assign(f,doctor,"MEDICO");assign(f,nurse,"ENFERMERO");assign(f,copilot,"COPILOTO");assign(f,nobody,"ENFERMERO");
  long contactsBefore=phones.count()+emails.count();
  for(Account actor:List.of(ops,center)){
   String json=body(f.getId(),actor.token());
   assertEquals(f.getId().longValue(),((Number)JsonPath.read(json,"$.vueloId")).longValue());
   assertEquals(5,(Integer)JsonPath.read(json,"$.tripulantes.length()"),"el comandante figura una sola vez aunque esté en el vuelo y en vuelos_tripulantes");
   assertEquals("Comandante",JsonPath.read(json,"$.tripulantes[0].nombre"));assertEquals(true,JsonPath.read(json,"$.tripulantes[0].comandante"));assertEquals("COMANDANTE",JsonPath.read(json,"$.tripulantes[0].funcionCode"));
   assertEquals(List.of("+54 381 555-0101"),JsonPath.<List<String>>read(json,"$.tripulantes[0].telefonos[*].valor"));assertEquals(0,(Integer)JsonPath.read(json,"$.tripulantes[0].correos.length()"));
   assertEquals(List.of(intl("3815550201")),JsonPath.<List<String>>read(json,"$.tripulantes[?(@.nombre=='Doctora')].telefonos[*].valor"));assertEquals(List.of("doctora@trabajo.test"),JsonPath.<List<String>>read(json,"$.tripulantes[?(@.nombre=='Doctora')].correos[*].valor"));
   assertEquals("DISPONIBLE",member(json,"Doctora"));assertEquals("DISPONIBLE",member(json,"Copiloto"));
   assertEquals("SIN_CONTACTO_LABORAL",member(json,"Enfermero"),"sólo tiene contactos personales: no se muestra ninguno ni se los reemplaza");
   assertEquals("SIN_CONTACTO_LABORAL",member(json,"Sinnada"),"sin ningún contacto: el mismo estado, sin distinguir");
   for(String hidden:List.of(intl("3815550102"),"cmd.privado","doctora.privado",intl("3815550301"),"enfermero.privado",intl("3815550401")))assertFalse(json.contains(hidden),"no debe exponerse el contacto personal "+hidden);
  }
  assertEquals(contactsBefore,phones.count()+emails.count(),"la consulta no crea ni copia contactos");
  assertEquals(2,crewViews(f.getId()).size());
 }

 @Test void onlyOperationsRolesMayQueryAndTheyNeedARealOpenFlight() throws Exception {
  Account ops=account("Omar","OPERACIONES"),dts=account("Dora","DTS"),cmd=account("Carlos","COMANDANTE"),admin=account("Admin","ADMINISTRADOR"),both=account("Doble","ADMINISTRADOR","CENTRO_OPERACIONES");
  Flight f=flight("PLANIFICADO",cmd);assign(f,cmd,"COMANDANTE");phone(cmd,"3815550501","LABORAL",false);
  long before=allCrewViews();
  for(Account denied:List.of(dts,cmd,admin))get(f.getId(),denied.token()).andExpect(status().isForbidden());
  get(f.getId(),null).andExpect(status().isUnauthorized());
  get(f.getId()+99999,admin.token()).andExpect(status().isForbidden());
  assertEquals(before,allCrewViews(),"los rechazos no generan consultas auditadas");
  get(f.getId(),both.token()).andExpect(status().isOk());// quien además tiene un rol operativo sí consulta
  get(f.getId()+99999,ops.token()).andExpect(status().isNotFound());
  get(99999999L,ops.token()).andExpect(status().isNotFound());
  mvc.perform(MockMvcRequestBuilders.get("/api/flights/abc/crew/contacts").header("Authorization","Bearer "+ops.token())).andExpect(status().is4xxClientError());
  assertEquals(1,crewViews(f.getId()).size(),"sólo la consulta autorizada deja evento");
  // la cuenta de Operaciones dada de baja pierde el acceso aunque conserve el token
  User u=users.findById(ops.userId()).orElseThrow();u.setActivo(false);users.save(u);
  get(f.getId(),ops.token()).andExpect(status().is4xxClientError());
 }

 @Test void terminalFlightsAndRejectedRequestsDoNotExposeCurrentContacts() throws Exception {
  Account ops=account("Omar","OPERACIONES"),cmd=account("Carlos","COMANDANTE");
  phone(cmd,"3815550601","LABORAL",false);
  long before=allCrewViews();
  for(String state:List.of("FINALIZADO","COMPLETADO","CANCELADO","RECHAZADO")){
   Flight f=flight(state,cmd);assign(f,cmd,"COMANDANTE");
   String error=get(f.getId(),ops.token()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CREW_CONTACTS_CLOSED")).andReturn().getResponse().getContentAsString();
   assertFalse(error.contains(intl("3815550601")),"el rechazo no contiene datos");
  }
  // solicitud sanitaria rechazada con el vuelo todavía abierto
  Person pp=new Person();pp.setNombre("Pablo");pp.setApellido("Paciente");pp.setDni(String.valueOf(64000000+(++seq)));persons.save(pp);Patient patient=new Patient();patient.setPerson(pp);patients.save(patient);
  SanitaryRequestStatus rejected=requestStatuses.findByCodigo("RECHAZADO").orElseGet(()->{SanitaryRequestStatus s=new SanitaryRequestStatus();s.setCodigo("RECHAZADO");s.setNombre("Rechazado");s.setOrden((short)9);return requestStatuses.save(s);});
  Flight sanitary=flight("SOLICITADO",null);SanitaryFlight s=new SanitaryFlight();s.setFlight(sanitary);s.setPatient(patient);s.setSolicitadoPor(users.findById(cmd.userId()).orElseThrow());s.setFechaSolicitada(LocalDateTime.now().plusDays(3));s.setEstadoSolicitud(rejected);sanitaryFlights.save(s);
  get(sanitary.getId(),ops.token()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CREW_CONTACTS_CLOSED"));
  assertEquals(before,allCrewViews());
  // en cambio un estado abierto (incluida la replanificación) sí se consulta
  for(String open:List.of("PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PENDIENTE_REPLANIFICACION","EN_CURSO")){Flight f=flight(open,cmd);assign(f,cmd,"COMANDANTE");get(f.getId(),ops.token()).andExpect(status().isOk());}
 }

 @Test void emptyCrewCommanderOnlyInFlightAndNeverTheWorkContactsOfPeopleNoLongerAssigned() throws Exception {
  Account ops=account("Omar","OPERACIONES"),cmd=account("Comandante","COMANDANTE"),old=account("Retirado"),replaced=account("Reemplazado"),next=account("Nuevo");
  phone(cmd,"3815550701","LABORAL",false);phone(old,"3815550702","LABORAL",false);phone(replaced,"3815550703","LABORAL",false);phone(next,"3815550704","LABORAL",false);
  // sin comandante ni tripulación
  Flight empty=flight("PLANIFICADO",null);
  assertEquals(0,(Integer)JsonPath.read(body(empty.getId(),ops.token()),"$.tripulantes.length()"));
  // comandante sólo en el vuelo (sin fila en vuelos_tripulantes): figura sin identificador de asignación
  Flight f=flight("PLANIFICADO",cmd);
  String only=body(f.getId(),ops.token());
  assertEquals(1,(Integer)JsonPath.read(only,"$.tripulantes.length()"));assertNull(JsonPath.read(only,"$.tripulantes[0].asignacionId"));assertEquals("COMANDANTE",JsonPath.read(only,"$.tripulantes[0].funcionCode"));
  assertEquals(0,crews.findByFlightIdOrderByIdAsc(f.getId()).size(),"no se creó una asignación duplicada del comandante");
  // retiro y reemplazo: quien ya no participa deja de figurar, quien entra figura según su asignación actual
  FlightCrew retired=assign(f,old,"ENFERMERO");FlightCrew swapped=assign(f,replaced,"MEDICO");
  assertEquals(3,(Integer)JsonPath.read(body(f.getId(),ops.token()),"$.tripulantes.length()"));
  tx(()->{FlightCrew c=crews.findById(retired.getId()).orElseThrow();c.darDeBaja(LocalDateTime.now(),users.findById(ops.userId()).orElseThrow(),FlightCrew.BAJA_RETIRO);return crews.save(c);});
  tx(()->{FlightCrew c=crews.findById(swapped.getId()).orElseThrow();c.darDeBaja(LocalDateTime.now(),users.findById(ops.userId()).orElseThrow(),FlightCrew.BAJA_REEMPLAZO);return crews.save(c);});
  assign(f,next,"MEDICO");
  String after=body(f.getId(),ops.token());
  assertEquals(List.of("Comandante","Nuevo"),JsonPath.<List<String>>read(after,"$.tripulantes[*].nombre"));
  assertFalse(after.contains(intl("3815550702"))||after.contains(intl("3815550703")),"retirados y reemplazados no se muestran");
  assertTrue(after.contains(intl("3815550704")));
  // contactos del retirado intactos
  assertEquals(1,phones.findActiveByPersonId(old.personId()).size());
  // el mismo comandante con fila y la misma persona repetida en dos filas vigentes: una sola vez
  Flight dup=flight("PLANIFICADO",cmd);assign(dup,cmd,"COMANDANTE");assign(dup,cmd,"COPILOTO");
  assertEquals(1,(Integer)JsonPath.read(body(dup.getId(),ops.token()),"$.tripulantes.length()"));
 }

 @Test void onlyActiveLaboralContactsAreReturnedWithADeterministicPrimaryFirstSelection() throws Exception {
  Account ops=account("Omar","OPERACIONES"),a=account("Alfa"),b=account("Beta"),c=account("Gamma"),d=account("Delta");
  Flight f=flight("PLANIFICADO",null);assign(f,a,"MEDICO");assign(f,b,"ENFERMERO");assign(f,c,"COPILOTO");assign(f,d,"MEDICO");
  // Alfa: principal personal, dos laborales sin principal -> el más antiguo primero, retirado excluido
  phone(a,"3815550801","PERSONAL",true);PhoneContact removed=phone(a,"3815550802","LABORAL",false);phone(a,"3815550803","LABORAL",false);phone(a,"3815550804","LABORAL",false);
  tx(()->{PhoneContact p=phones.findById(removed.getId()).orElseThrow();p.darDeBaja(LocalDateTime.now(),users.findById(a.userId()).orElseThrow(),"RETIRO");return phones.save(p);});
  // Beta: laboral principal y otros laborales: el principal va primero aunque sea el más nuevo
  phone(b,"3815550811","LABORAL",false);phone(b,"3815550812","LABORAL",false);phone(b,"3815550813","LABORAL",true);
  // Gamma: cuatro laborales -> se limitan a tres y se avisa
  for(int i=0;i<4;i++)phone(c,"381555082"+i,"LABORAL",i==0);
  // Delta: un correo laboral retirado y uno personal -> sin contacto laboral
  EmailContact gone=email(d,"delta@trabajo.test","LABORAL",false);email(d,"delta@privado.test","PERSONAL",true);
  tx(()->{EmailContact e=emails.findById(gone.getId()).orElseThrow();e.darDeBaja(LocalDateTime.now(),users.findById(d.userId()).orElseThrow(),"RETIRO");return emails.save(e);});
  String json=body(f.getId(),ops.token());
  assertEquals(List.of(intl("3815550803"),intl("3815550804")),JsonPath.<List<String>>read(json,"$.tripulantes[?(@.nombre=='Alfa')].telefonos[*].valor"));
  assertEquals(List.of(false,false),JsonPath.<List<Boolean>>read(json,"$.tripulantes[?(@.nombre=='Alfa')].telefonos[*].principal"));
  assertEquals(List.of(intl("3815550813"),intl("3815550811"),intl("3815550812")),JsonPath.<List<String>>read(json,"$.tripulantes[?(@.nombre=='Beta')].telefonos[*].valor"));
  assertEquals(true,JsonPath.<List<Boolean>>read(json,"$.tripulantes[?(@.nombre=='Beta')].telefonos[0].principal").get(0));
  assertEquals(3,JsonPath.<List<Object>>read(json,"$.tripulantes[?(@.nombre=='Gamma')].telefonos[*]").size());
  assertEquals(true,JsonPath.<List<Boolean>>read(json,"$.tripulantes[?(@.nombre=='Gamma')].hayMasContactos").get(0));
  assertEquals(false,JsonPath.<List<Boolean>>read(json,"$.tripulantes[?(@.nombre=='Beta')].hayMasContactos").get(0));
  assertEquals("SIN_CONTACTO_LABORAL",member(json,"Delta"));
  assertEquals(json,body(f.getId(),ops.token()),"la selección es determinista");
  // un cambio del titular se refleja de inmediato: no hay copias
  tx(()->{PhoneContact p=phones.findActiveByPersonId(b.personId()).stream().filter(x->intl("3815550813").equals(x.getNumero())).findFirst().orElseThrow();p.setTipo("PERSONAL");return phones.save(p);});
  assertFalse(body(f.getId(),ops.token()).contains(intl("3815550813")),"un contacto reclasificado como personal deja de ser visible");
 }

 @Test void inactiveAccountsExposeNoContactsAndAreReportedAsSuch() throws Exception {
  Account ops=account("Omar","OPERACIONES"),active=account("Activo"),off=account("Baja"),pending=account("Pendiente");
  phone(active,"3815550901","LABORAL",false);phone(off,"3815550902","LABORAL",false);phone(pending,"3815550903","LABORAL",false);
  Flight f=flight("PLANIFICADO",null);assign(f,active,"MEDICO");assign(f,off,"ENFERMERO");assign(f,pending,"COPILOTO");
  tx(()->{User u=users.findById(off.userId()).orElseThrow();u.setActivo(false);return users.save(u);});
  tx(()->{User u=users.findById(pending.userId()).orElseThrow();u.setEstadoCuenta("PENDIENTE_ACTIVACION");return users.save(u);});
  String json=body(f.getId(),ops.token());
  assertEquals("DISPONIBLE",member(json,"Activo"));assertEquals("CUENTA_NO_ACTIVA",member(json,"Baja"));assertEquals("CUENTA_NO_ACTIVA",member(json,"Pendiente"));
  assertFalse(json.contains(intl("3815550902"))||json.contains(intl("3815550903")));
 }

 @Test void identifiersAndParametersCannotWidenTheScopeBeyondTheFlightsCurrentCrew() throws Exception {
  Account ops=account("Omar","OPERACIONES"),mine=account("Propio"),stranger=account("Ajeno");
  phone(mine,"3815551001","LABORAL",false);phone(stranger,"3815551002","LABORAL",false);
  Flight f=flight("PLANIFICADO",null);assign(f,mine,"MEDICO");Flight other=flight("PLANIFICADO",null);assign(other,stranger,"MEDICO");
  for(String extra:List.of("?personaId="+stranger.personId(),"?userId="+stranger.userId(),"?vueloId="+other.getId(),"?history=true","?crewId=1")){
   String json=mvc.perform(MockMvcRequestBuilders.get("/api/flights/"+f.getId()+"/crew/contacts"+extra).header("Authorization","Bearer "+ops.token())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
   assertTrue(json.contains(intl("3815551001"))&&!json.contains(intl("3815551002")),"sólo la tripulación del vuelo consultado: "+extra);
  }
  for(String path:List.of("/api/flights/"+f.getId()+"/crew/contacts","/api/contacts","/api/personas/"+stranger.personId()+"/contacts","/api/crew/contacts"))
   for(String method:List.of("POST","PUT","DELETE"))mvc.perform(MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).header("Authorization","Bearer "+ops.token()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(result->assertTrue(result.getResponse().getStatus()>=400));
  mvc.perform(MockMvcRequestBuilders.get("/api/personas/"+stranger.personId()+"/contacts").header("Authorization","Bearer "+ops.token())).andExpect(result->assertTrue(result.getResponse().getStatus()>=400));
 }

 @Test void responseIsMinimalAndAuditLeavesOnlyCounts() throws Exception {
  Account ops=account("Omar","OPERACIONES"),m=account("Medico");
  phone(m,"+54 381 555-1101","LABORAL",true);email(m,"medico@trabajo.test","LABORAL",false);email(m,"medico.privado@correo.test","PERSONAL",true);
  Flight f=flight("PLANIFICADO",null);FlightCrew row=assign(f,m,"MEDICO");
  var res=get(f.getId(),ops.token()).andExpect(status().isOk());
  String json=res.andReturn().getResponse().getContentAsString();
  assertTrue(res.andReturn().getResponse().getHeader("Cache-Control").contains("no-store"),"los contactos no se almacenan en caché");
  for(String forbidden:List.of(m.dni(),m.username(),"passwordHash","hash","token","codigoActivacion","\"dni\"","username","personaId","userId","roles","medico.privado","direccion","version"))assertFalse(json.toLowerCase().contains(forbidden.toLowerCase()),"la respuesta no debe contener "+forbidden);
  assertEquals(List.of("asignacionId","nombre","apellido","funcionCode","funcion","comandante","estado","telefonos","correos","hayMasContactos","correoLaboralSinVerificar","telefonoLaboralSinValidar").stream().sorted().toList(),JsonPath.<java.util.Map<String,Object>>read(json,"$.tripulantes[0]").keySet().stream().sorted().toList());
  assertEquals(row.getId().longValue(),((Number)JsonPath.read(json,"$.tripulantes[0].asignacionId")).longValue());
  List<AuditEvent> views=crewViews(f.getId());
  assertEquals(1,views.size());AuditEvent e=views.get(0);
  assertEquals("VIEW",e.getOperation());assertEquals(ops.userId(),e.getActor().getId().longValue());assertNull(e.getOldValues());
  assertEquals("{\"tripulantes\":1,\"contactos\":2,\"sinContactoLaboral\":0}",e.getNewValues());
  String all=tx(()->{StringBuilder b=new StringBuilder();events.findAll().forEach(x->b.append(x.getEntityType()).append(x.getNewValues()).append(x.getOldValues()));return b.toString();});
  for(String secret:List.of("5551101","medico@trabajo","medico.privado"))assertFalse(all.contains(secret),"la auditoría no guarda "+secret);
 }

 @Test void queryCountDoesNotGrowWithCrewSizeAndNothingIsWritten() throws Exception {
  Account ops=account("Omar","OPERACIONES");
  Flight small=flight("PLANIFICADO",null),large=flight("PLANIFICADO",null);
  for(int i=0;i<2;i++){Account x=account("Chico"+(char)('a'+i));phone(x,"381556000"+i,"LABORAL",false);email(x,"c"+i+"@trabajo.test","LABORAL",false);assign(small,x,"MEDICO");}
  for(int i=0;i<8;i++){Account x=account("Grande"+(char)('a'+i));phone(x,"381557000"+i,"LABORAL",false);email(x,"g"+i+"@trabajo.test","LABORAL",false);phone(x,"381558000"+i,"PERSONAL",false);assign(large,x,"MEDICO");}
  body(small.getId(),ops.token());body(large.getId(),ops.token());// precalentamiento
  var stats=emf.unwrap(SessionFactory.class).getStatistics();
  stats.clear();body(small.getId(),ops.token());long few=stats.getPrepareStatementCount();
  stats.clear();body(large.getId(),ops.token());long many=stats.getPrepareStatementCount();
  assertEquals(few,many,"sin consultas N+1: la cantidad de sentencias no depende del tamaño de la tripulación");
  assertTrue(many<=20,"pocas consultas por solicitud: "+many);
 }

 @Test void unverifiedWorkEmailsAndUnvalidatedWorkPhonesAreNotDeliveredAsContactMeansButTheirExistenceIsReported() throws Exception {
  Account ops=account("Omar","OPERACIONES"),a=account("Verif"),b=account("Pend"),c=account("Vieja"),d=account("Mixta");
  Flight f=flight("PLANIFICADO",null);assign(f,a,"MEDICO");assign(f,b,"ENFERMERO");assign(f,c,"COPILOTO");assign(f,d,"MEDICO");
  email(a,"verif@trabajo.test","LABORAL",true);phone(a,"3815552001","LABORAL",false);
  unverifiedEmail(b,"pend@trabajo.test","LABORAL",true);email(b,"pend.privado@correo.test","PERSONAL",false);phone(b,"3815552002","PERSONAL",true);
  unvalidatedPhone(c,"3815552003","LABORAL",true);unvalidatedPhone(c,"+54 381 555-2004","PERSONAL",false);
  unverifiedEmail(d,"mixta.pend@trabajo.test","LABORAL",false);phone(d,"3815552005","LABORAL",true);
  String json=body(f.getId(),ops.token());
  // verificado y validado: se entrega (el teléfono con formato internacional)
  assertEquals(List.of("verif@trabajo.test"),JsonPath.<List<String>>read(json,"$.tripulantes[?(@.nombre=='Verif')].correos[*].valor"));
  assertEquals(List.of(intl("3815552001")),JsonPath.<List<String>>read(json,"$.tripulantes[?(@.nombre=='Verif')].telefonos[*].valor"));
  assertEquals("DISPONIBLE",member(json,"Verif"));assertFalse(JsonPath.<List<Boolean>>read(json,"$.tripulantes[?(@.nombre=='Verif')].correoLaboralSinVerificar").get(0));
  // correo laboral sin verificar: no se entrega, no se reemplaza por el personal y Operaciones sabe que no hay un correo laboral verificado
  assertEquals("SIN_CONTACTO_LABORAL",member(json,"Pend"));assertEquals(true,JsonPath.<List<Boolean>>read(json,"$.tripulantes[?(@.nombre=='Pend')].correoLaboralSinVerificar").get(0));
  assertEquals(false,JsonPath.<List<Boolean>>read(json,"$.tripulantes[?(@.nombre=='Pend')].telefonoLaboralSinValidar").get(0));
  // teléfono laboral anterior sin país: no se entrega y se informa; el personal sigue excluido
  assertEquals("SIN_CONTACTO_LABORAL",member(json,"Vieja"));assertEquals(true,JsonPath.<List<Boolean>>read(json,"$.tripulantes[?(@.nombre=='Vieja')].telefonoLaboralSinValidar").get(0));
  // mixto: el teléfono validado sí, el correo pendiente no
  assertEquals("DISPONIBLE",member(json,"Mixta"));assertEquals(List.of(intl("3815552005")),JsonPath.<List<String>>read(json,"$.tripulantes[?(@.nombre=='Mixta')].telefonos[*].valor"));
  assertEquals(0,JsonPath.<List<Object>>read(json,"$.tripulantes[?(@.nombre=='Mixta')].correos[*]").size());assertEquals(true,JsonPath.<List<Boolean>>read(json,"$.tripulantes[?(@.nombre=='Mixta')].correoLaboralSinVerificar").get(0));
  for(String hidden:List.of("pend@trabajo","pend.privado","mixta.pend","3815552002","3815552003","381 555-2003","381 555-2004","2004"))assertFalse(json.contains(hidden),"no debe exponerse: "+hidden);
  assertFalse(json.toLowerCase().contains("verificado por sms"));
  // el recuento auditado cuenta lo realmente mostrado: Verif 2 + Mixta 1 = 3; sin contacto disponible: Pend y Vieja
  String newValues=tx(()->events.findAll().stream().filter(e->"FLIGHT_CREW_CONTACT".equals(e.getEntityType())&&e.getFlight()!=null&&e.getFlight().getId().equals(f.getId())).findFirst().orElseThrow().getNewValues());
  assertEquals("{\"tripulantes\":4,\"contactos\":3,\"sinContactoLaboral\":2}",newValues);
 }
}
