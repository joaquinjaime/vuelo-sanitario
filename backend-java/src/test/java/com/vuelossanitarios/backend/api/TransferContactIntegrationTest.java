package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.TransferContact;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.person.PhoneContact;
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
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Contactos de coordinación del traslado, de la solicitud al detalle de Operaciones, sobre HTTP con JWT, seguridad y persistencia reales (H2). Índices únicos y carreras con SQL Server: ver el E2E. */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:transfercontacts;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class TransferContactIntegrationTest {
 @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder; @Autowired PlatformTransactionManager txm;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles; @Autowired PatientRepository patients;
 @Autowired ProvinceRepository provinces; @Autowired LocalityRepository localities; @Autowired FlightPriorityRepository priorities; @Autowired FlightTypeRepository types;
 @Autowired SanitaryRequestStatusRepository requestStatuses; @Autowired FlightStatusRepository statuses; @Autowired FlightRepository flights; @Autowired SanitaryFlightRepository sanitaryFlights;
 @Autowired TransferContactRepository contacts; @Autowired AuditEventRepository events; @Autowired PhoneContactRepository phones;
 private static int seq=0; private static final String PASSWORD="ClaveSegura-12345";
 private static Long originId,destinationId;

 private record Account(long userId,long personId,String token,String hash,Long credentialVersion){}
 private <T> T tx(Supplier<T> work){return new TransactionTemplate(txm).execute(s->work.get());}
 private Role role(String code){return roles.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roles.save(r);});}
 private Account account(String name,String roleCode) throws Exception {
  Person p=new Person();p.setNombre(name);p.setApellido("Traslado");p.setDni(String.valueOf(63000000+(++seq)));persons.save(p);
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
 private String requestJson(String patientJson,String extra,String contactsJson){
  String when=LocalDateTime.now().plusDays(10).withNano(0).toString();
  return "{"+patientJson+",\"localidadOrigenId\":"+originId+",\"localidadDestinoId\":"+destinationId+",\"priorityCode\":\"ALTA\",\"motivoVuelo\":\"Traslado de prueba\",\"fechaSolicitada\":\""+when+"\",\"extremaUrgencia\":false,\"medical\":{\"diagnostico\":\"Control\",\"condicionMedica\":\"ESTABLE\",\"requiereEquipamientoEspecial\":false}"+(extra==null?"":","+extra)+(patientJson.contains("\"patient\"")&&(extra==null||!extra.contains("identidadConfirmada"))?",\"identidadConfirmada\":true":"")+(contactsJson==null?"":",\"contactos\":"+contactsJson)+"}";
 }
 private String newPatient(String dni){return "\"patient\":{\"nombre\":\"Pablo\",\"apellido\":\"Paciente\",\"dni\":\""+dni+"\"}";}
 private static String contact(String relation,String name,String phone){return "{\"relacion\":\""+relation+"\""+(name==null?"":",\"nombre\":\""+name+"\"")+",\"pais\":\"AR\",\"telefono\":\""+phone+"\"}";}
 private long createdFlight(ResultActions r) throws Exception {return ((Number)JsonPath.read(r.andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.id")).longValue();}
 private String dni(){return String.valueOf(41000000+(++seq));}
 private long views(long flight){return tx(()->events.findAll().stream().filter(e->"VIEW".equals(e.getOperation())&&e.getFlight()!=null&&e.getFlight().getId().equals(flight)).count());}

 @BeforeEach void seed(){
  for(String r:List.of("ADMINISTRADOR","DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE"))role(r);
  if(originId==null){
   Province pr=new Province();pr.setCodigoOficial("T1");pr.setNombre("Provincia de prueba");pr.setActivo(true);provinces.save(pr);
   Locality a=new Locality();a.setCodigoOficial("TL1");a.setNombre("Origen");a.setProvincia(pr);a.setActivo(true);localities.save(a);
   Locality b=new Locality();b.setCodigoOficial("TL2");b.setNombre("Destino");b.setProvincia(pr);b.setActivo(true);localities.save(b);
   originId=a.getId();destinationId=b.getId();
   FlightPriority p=new FlightPriority();p.setCodigo("ALTA");p.setNombre("Alta");p.setActivo(true);p.setOrden((short)1);priorities.save(p);
   FlightType t=new FlightType();t.setCodigo("SANITARIO");t.setNombre("Sanitario");types.save(t);
   SanitaryRequestStatus s=new SanitaryRequestStatus();s.setCodigo("SOLICITADO");s.setNombre("Solicitado");s.setOrden((short)1);requestStatuses.save(s);
  }
 }
 private long snapshotCounts(){return persons.count()*1_000_000+patients.count()*10_000+flights.count()*100+contacts.count();}
 private List<TransferContact> activeContacts(long flightId){return tx(()->{var l=contacts.findActiveByFlightId(flightId);l.forEach(c->c.getFlight().getId());return l;});}
 private String allAuditText(long flightId){return tx(()->{StringBuilder b=new StringBuilder();for(AuditEvent e:events.findAll())if(e.getFlight()!=null&&e.getFlight().getId().equals(flightId)||"TRANSFER_CONTACT".equals(e.getEntityType()))b.append(e.getEntityType()).append(e.getOperation()).append(e.getOldValues()).append(e.getNewValues()).append('\n');return b.toString();});}

 @Test void newPatientRequestStoresItsContactsAtomicallyAndOnlyAuthorizedRolesReadThemInContext() throws Exception {
  Account dts=account("Dora","DTS"),otherDts=account("Otra","DTS"),ops=account("Omar","CENTRO_OPERACIONES"),cmd=account("Carlos","COMANDANTE"),admin=account("Admin","ADMINISTRADOR");
  long phonesBefore=phones.count();
  long flight=createdFlight(call("POST","/api/flights/with-patient",dts.token(),requestJson(newPatient(dni()),"\"identidadConfirmada\":true",
    "["+contact("PACIENTE",null,"+54 381 555-0101")+","+contact("FAMILIAR_RESPONSABLE","Marta Paciente","3815550102")+"]")));
  List<TransferContact> saved=activeContacts(flight);
  assertEquals(2,saved.size());assertTrue(saved.get(0).getPrincipal());assertFalse(saved.get(1).getPrincipal());assertEquals("PACIENTE",saved.get(0).getRelacion());assertNull(saved.get(0).getNombre());
  assertEquals("+543815550101",saved.get(0).getTelefonoNormalizado());assertEquals(dts.userId(),tx(()->contacts.findById(saved.get(0).getId()).orElseThrow().getCreadoPor().getId()));
  assertEquals(phonesBefore,phones.count(),"el teléfono de la solicitud no se guarda como contacto personal de nadie");
  // el DTS solicitante lo ve y puede editar; no se audita su propia consulta
  call("GET","/api/flights/"+flight+"/transfer-contacts",dts.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.disponible").value(true)).andExpect(jsonPath("$.puedeEditar").value(true)).andExpect(jsonPath("$.items.length()").value(2)).andExpect(jsonPath("$.items[0].principal").value(true)).andExpect(jsonPath("$.items[1].nombre").value("Marta Paciente"));
  assertEquals(0,views(flight),"la consulta del propio solicitante no se audita");
  // Operaciones lo consulta desde el vuelo: lectura sin edición y con auditoría de la consulta (sin números)
  call("GET","/api/flights/"+flight+"/transfer-contacts",ops.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.puedeEditar").value(false)).andExpect(jsonPath("$.items[1].telefono").value("+54 381 555-0102"));
  call("GET","/api/flights/"+flight+"/transfer-contacts",ops.token(),null).andExpect(status().isOk());
  List<AuditEvent> views=tx(()->{var l=events.findAll().stream().filter(e->"VIEW".equals(e.getOperation())&&"TRANSFER_CONTACT".equals(e.getEntityType())&&e.getFlight().getId().equals(flight)).toList();l.forEach(e->{e.getActor().getId();e.getFlight().getId();});return l;});
  assertEquals(2,views.size());assertTrue(views.stream().allMatch(e->e.getActor().getId().equals(ops.userId())&&e.getFlight().getId().equals(flight)&&e.getNewValues().contains("\"cantidad\":2")));
  // nadie más: otro DTS, comandante, administrador, anónimo
  for(Account other:List.of(otherDts,cmd,admin))call("GET","/api/flights/"+flight+"/transfer-contacts",other.token(),null).andExpect(status().isForbidden());
  call("GET","/api/flights/"+flight+"/transfer-contacts",null,null).andExpect(status().isUnauthorized());
  // la auditoría no guarda números completos ni nombres
  String audit=allAuditText(flight);
  assertTrue(audit.contains("TRANSFER_CONTACT")&&audit.contains("CREATE"));
  for(String secret:List.of("3815550101","3815550102","+54 381","Marta"))assertFalse(audit.contains(secret),"auditoría sin datos completos: "+secret);
  // el detalle general del vuelo no lleva teléfonos: se verifica en el E2E con SQL Server (el detalle usa tablas que H2 no soporta)
  // identidad del DTS intacta
  User after=users.findById(dts.userId()).orElseThrow();assertEquals(dts.hash(),after.getPasswordHash());assertEquals(dts.credentialVersion(),after.getVersionCredenciales());
 }

 @Test void failedOrInvalidRequestsLeaveNoPatientFlightOrContactBehind() throws Exception {
  Account dts=account("Fallo","DTS");
  long before=snapshotCounts();
  // rollback tardío: la identidad ya se registró y falla la creación del vuelo (origen = destino)
  String bad=requestJson(newPatient(dni()),null,"["+contact("PACIENTE",null,"3815550201")+"]").replace("\"localidadDestinoId\":"+destinationId,"\"localidadDestinoId\":"+originId);
  call("POST","/api/flights/with-patient",dts.token(),bad).andExpect(status().isBadRequest());
  assertEquals(before,snapshotCounts(),"nada de la solicitud fallida persiste");
  // validaciones: se rechazan antes de crear nada
  String p=newPatient(dni());
  for(String invalid:List.of(
    "["+contact("PACIENTE",null,"12345")+"]","["+contact("PACIENTE",null,"abc")+"]","["+contact("FAMILIAR_RESPONSABLE",null,"3815550202")+"]",
    "["+contact("VECINO","Juan","3815550202")+"]",
    "["+contact("PACIENTE",null,"3815550202")+","+contact("FAMILIAR_RESPONSABLE","Ana","381-555-0202")+"]",
    "["+contact("PACIENTE",null,"3815550202")+","+contact("PACIENTE",null,"3815550203")+"]",
    "["+contact("OTRO","a","3815550211")+","+contact("OTRO","b","3815550212")+","+contact("OTRO","c","3815550213")+","+contact("OTRO","d","3815550214")+"]"))
   call("POST","/api/flights/with-patient",dts.token(),requestJson(p,null,invalid)).andExpect(status().isBadRequest());
  assertEquals(before,snapshotCounts());
  // campos desconocidos: nunca se descartan en silencio (incluido el antiguo patient.telefono)
  call("POST","/api/flights/with-patient",dts.token(),requestJson("\"patient\":{\"nombre\":\"Pablo\",\"apellido\":\"Paciente\",\"dni\":\""+dni()+"\",\"telefono\":\"3815550301\"}",null,null)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("Campo no admitido: telefono"));
  call("POST","/api/flights/with-patient",dts.token(),requestJson(p,"\"telefonoPaciente\":\"3815550302\"",null)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("Campo no admitido: telefonoPaciente"));
  call("POST","/api/flights/with-patient",dts.token(),requestJson(p,null,"[{\"relacion\":\"PACIENTE\",\"pais\":\"AR\",\"telefono\":\"3815550303\",\"whatsapp\":true}]")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("Campo no admitido: whatsapp"));
  assertEquals(before,snapshotCounts());
  // sin contactos sigue siendo válido: el campo es opcional
  createdFlight(call("POST","/api/flights/with-patient",dts.token(),requestJson(p,null,null)));
 }

 @Test void existingPatientAndPreexistingPersonKeepTheirPersonalContactsAndAccounts() throws Exception {
  Account dts=account("Selecta","DTS"),owner=account("Duenia","DTS");
  // una persona con cuenta y teléfono personal propio, a la que DTS vincula como paciente declarando el cotejo
  User ownerUser=users.findById(owner.userId()).orElseThrow();
  new TransactionTemplate(txm).executeWithoutResult(s->{PhoneContact ph=new PhoneContact();ph.setPerson(persons.findById(owner.personId()).orElseThrow());ph.setNumero("3815550900");ph.setPrincipal(true);phones.save(ph);});
  String personalBefore=tx(()->phones.findActiveByPersonId(owner.personId()).stream().map(x->x.getNumero()+"|"+x.getVersion()+"|"+x.getPrincipal()).toList().toString());
  Person ownerPerson=persons.findById(owner.personId()).orElseThrow();
  String patientJson="\"patient\":{\"nombre\":\""+ownerPerson.getNombre()+"\",\"apellido\":\""+ownerPerson.getApellido()+"\",\"dni\":\""+ownerPerson.getDni()+"\"}";
  long linked=createdFlight(call("POST","/api/flights/with-patient",dts.token(),requestJson(patientJson,"\"identidadConfirmada\":true",
    "["+contact("PACIENTE",null,"3815550901")+"]")));
  assertEquals(1,activeContacts(linked).size());
  assertEquals(personalBefore,tx(()->phones.findActiveByPersonId(owner.personId()).stream().map(x->x.getNumero()+"|"+x.getVersion()+"|"+x.getPrincipal()).toList().toString()),"los contactos personales de la persona no se tocan");
  User after=users.findById(owner.userId()).orElseThrow();assertEquals(owner.hash(),after.getPasswordHash());assertEquals(owner.credentialVersion(),after.getVersionCredenciales());assertEquals(ownerUser.getEstadoCuenta(),after.getEstadoCuenta());
  // paciente ya registrado, seleccionado por id: el contacto es de ESTA solicitud
  long patientId=tx(()->patients.findByPersonId(owner.personId()).orElseThrow().getId());
  long second=createdFlight(call("POST","/api/flights",dts.token(),requestJson("\"patientId\":"+patientId,null,"["+contact("FAMILIAR_RESPONSABLE","Responsable","3815550902")+"]")));
  assertEquals(List.of("+54 381 555-0902"),activeContacts(second).stream().map(TransferContact::getTelefono).toList());
  assertEquals(List.of("+54 381 555-0901"),activeContacts(linked).stream().map(TransferContact::getTelefono).toList(),"cada solicitud conserva su propio contacto");
  // un campo desconocido también se rechaza en la solicitud para paciente existente
  call("POST","/api/flights",dts.token(),requestJson("\"patientId\":"+patientId,"\"pais\":\"AR\",\"telefono\":\"3815550903\"",null)).andExpect(status().isBadRequest());
 }

 @Test void requesterMaintainsContactsWhileCoordinationIsOpenAndOthersCannot() throws Exception {
  Account dts=account("Mantiene","DTS"),other=account("Ajena","DTS"),ops=account("Opera","OPERACIONES");
  long flight=createdFlight(call("POST","/api/flights/with-patient",dts.token(),requestJson(newPatient(dni()),null,"["+contact("PACIENTE",null,"3815550401")+"]")));
  String base="/api/flights/"+flight+"/transfer-contacts";
  long first=activeContacts(flight).get(0).getId();
  long second=((Number)JsonPath.read(call("POST",base,dts.token(),contact("ESTABLECIMIENTO_ORIGEN","Hospital Origen","3815550402")).andExpect(status().isOk()).andExpect(jsonPath("$.principal").value(false)).andReturn().getResponse().getContentAsString(),"$.id")).longValue();
  call("POST",base,dts.token(),contact("OTRO","Mismo número","381 555 0402")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONTACT_AMBIGUOUS"));
  call("POST",base,dts.token(),contact("OTRO","Tercero","3815550403")).andExpect(status().isOk());
  call("POST",base,dts.token(),contact("OTRO","Cuarto","3815550404")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TRANSFER_CONTACT_LIMIT"));
  // edición con versión
  call("PUT",base+"/"+second,dts.token(),"{\"relacion\":\"ESTABLECIMIENTO_DESTINO\",\"nombre\":\"Hospital Destino\",\"pais\":\"AR\",\"telefono\":\"3815550499\",\"version\":0}").andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1)).andExpect(jsonPath("$.relacion").value("ESTABLECIMIENTO_DESTINO"));
  call("PUT",base+"/"+second,dts.token(),"{\"relacion\":\"OTRO\",\"nombre\":\"x\",\"pais\":\"AR\",\"telefono\":\"3815550498\",\"version\":0}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONTACT_VERSION_CONFLICT"));
  call("PUT",base+"/"+second,dts.token(),"{\"relacion\":\"OTRO\",\"nombre\":\"x\",\"pais\":\"AR\",\"telefono\":\"3815550401\",\"version\":1}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONTACT_AMBIGUOUS"));
  call("PUT",base+"/"+second,dts.token(),"{\"relacion\":\"OTRO\",\"nombre\":\"x\",\"pais\":\"AR\",\"telefono\":\"3815550498\",\"version\":1,\"extra\":1}").andExpect(status().isBadRequest());
  // principal y retiro con promoción
  call("POST",base+"/"+second+"/principal",dts.token(),null).andExpect(status().isOk());
  call("DELETE",base+"/"+second,dts.token(),null).andExpect(status().isOk());
  List<TransferContact> left=activeContacts(flight);assertEquals(2,left.size());assertEquals(1,left.stream().filter(TransferContact::getPrincipal).count(),"un solo principal vigente");
  tx(()->{TransferContact gone=contacts.findById(second).orElseThrow();assertNotNull(gone.getFechaBaja());assertEquals(dts.userId(),gone.getBajaPor().getId());assertFalse(gone.getPrincipal());assertEquals("RETIRO",gone.getMotivoBaja());return null;});
  call("DELETE",base+"/"+second,dts.token(),null).andExpect(status().isNotFound());
  // otro DTS, Operaciones y anónimo no escriben; un id de otro vuelo o inexistente es 404
  for(Account no:List.of(other,ops)){
   call("POST",base,no.token(),contact("OTRO","Intruso","3815550777")).andExpect(status().is4xxClientError());
   call("PUT",base+"/"+first,no.token(),"{\"relacion\":\"OTRO\",\"nombre\":\"x\",\"pais\":\"AR\",\"telefono\":\"3815550777\",\"version\":0}").andExpect(status().is4xxClientError());
   call("DELETE",base+"/"+first,no.token(),null).andExpect(status().is4xxClientError());
   call("POST",base+"/"+first+"/principal",no.token(),null).andExpect(status().is4xxClientError());
  }
  call("POST",base,null,contact("OTRO","Anónimo","3815550777")).andExpect(status().isUnauthorized());
  long other2=createdFlight(call("POST","/api/flights/with-patient",dts.token(),requestJson(newPatient(dni()),null,"["+contact("PACIENTE",null,"3815550601")+"]")));
  long foreignContact=activeContacts(other2).get(0).getId();
  call("DELETE",base+"/"+foreignContact,dts.token(),null).andExpect(status().isNotFound());   // contacto de otra solicitud por la ruta de ésta
  call("DELETE","/api/flights/987654/transfer-contacts/"+first,dts.token(),null).andExpect(status().isNotFound());
  assertEquals(1,activeContacts(other2).size());assertEquals("+54 381 555-0401",contacts.findById(first).orElseThrow().getTelefono());
  assertTrue(activeContacts(flight).stream().noneMatch(c->"+54 381 555-0777".equals(c.getTelefono())));
 }

 @Test void closedCoordinationStopsShowingAndAcceptingContactsButKeepsThem() throws Exception {
  Account dts=account("Cierra","DTS"),ops=account("Opera2","CENTRO_OPERACIONES");
  long flight=createdFlight(call("POST","/api/flights/with-patient",dts.token(),requestJson(newPatient(dni()),null,"["+contact("PACIENTE",null,"3815550701")+"]")));
  String base="/api/flights/"+flight+"/transfer-contacts";
  call("GET",base,ops.token(),null).andExpect(jsonPath("$.disponible").value(true));
  // rechazo de la solicitud
  tx(()->{var s=sanitaryFlights.findByFlightId(flight).orElseThrow();var rs=requestStatuses.findByCodigo("RECHAZADO").orElseGet(()->{SanitaryRequestStatus x=new SanitaryRequestStatus();x.setCodigo("RECHAZADO");x.setNombre("Rechazado");x.setOrden((short)9);return requestStatuses.save(x);});s.setEstadoSolicitud(rs);sanitaryFlights.save(s);return null;});
  long viewsBefore=views(flight);
  for(Account who:List.of(ops,dts))call("GET",base,who.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.disponible").value(false)).andExpect(jsonPath("$.items.length()").value(0)).andExpect(jsonPath("$.motivoNoDisponible").isNotEmpty());
  assertEquals(viewsBefore,views(flight),"sin datos mostrados no hay consulta que auditar");
  call("POST",base,dts.token(),contact("OTRO","Tarde","3815550702")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TRANSFER_CONTACTS_CLOSED"));
  assertEquals(1,activeContacts(flight).size(),"los contactos se conservan como historia");
  // vuelo finalizado
  long second=createdFlight(call("POST","/api/flights/with-patient",dts.token(),requestJson(newPatient(dni()),null,"["+contact("PACIENTE",null,"3815550801")+"]")));
  tx(()->{var f=flights.findById(second).orElseThrow();f.setEstadoVuelo(statuses.findByCodigo("FINALIZADO").orElseGet(()->{FlightStatus st=new FlightStatus();st.setCodigo("FINALIZADO");st.setNombre("Finalizado");st.setOrden((short)8);return statuses.save(st);}));flights.save(f);return null;});
  call("GET","/api/flights/"+second+"/transfer-contacts",ops.token(),null).andExpect(jsonPath("$.disponible").value(false)).andExpect(jsonPath("$.items.length()").value(0));
  call("DELETE","/api/flights/"+second+"/transfer-contacts/"+activeContacts(second).get(0).getId(),dts.token(),null).andExpect(status().isConflict());
  // un vuelo operativo (sin extensión sanitaria) no tiene contactos de coordinación
  long operational=tx(()->{var f=new com.vuelossanitarios.backend.domain.flight.Flight();f.setCodigo("OP-"+(++seq));f.setTipoVuelo(types.save(typeOf("REGRESO_BASE")));f.setMotivoVuelo("Operativo");f.setCreadoPor(users.findById(dts.userId()).orElseThrow());return flights.save(f).getId();});
  call("GET","/api/flights/"+operational+"/transfer-contacts",ops.token(),null).andExpect(status().isNotFound());
 }
 private FlightType typeOf(String code){return types.findByCodigoAndActivoTrue(code).orElseGet(()->{FlightType x=new FlightType();x.setCodigo(code);x.setNombre(code);return x;});}

 @Test void simultaneousAdditionsRespectTheLimitAndNeverDuplicateAPhone() throws Exception {
  Account dts=account("Carrera","DTS");
  long flight=createdFlight(call("POST","/api/flights/with-patient",dts.token(),requestJson(newPatient(dni()),null,null)));
  String base="/api/flights/"+flight+"/transfer-contacts";
  ExecutorService pool=Executors.newFixedThreadPool(6);CountDownLatch go=new CountDownLatch(1);List<Future<Integer>> same=new ArrayList<>();
  for(int i=0;i<6;i++)same.add(pool.submit((Callable<Integer>)()->{go.await();return call("POST",base,dts.token(),contact("OTRO","Mismo","3815550901")).andReturn().getResponse().getStatus();}));
  go.countDown();int ok=0;for(Future<Integer> f:same)if(f.get()==200)ok++;
  assertEquals(1,ok,"el mismo teléfono se registra una sola vez");assertEquals(1,activeContacts(flight).size());
  CountDownLatch go2=new CountDownLatch(1);List<Future<Integer>> distinct=new ArrayList<>();
  for(int i=0;i<6;i++){String phone="38155509"+(10+i);distinct.add(pool.submit((Callable<Integer>)()->{go2.await();return call("POST",base,dts.token(),contact("OTRO","N"+phone,phone)).andReturn().getResponse().getStatus();}));}
  go2.countDown();int added=0;for(Future<Integer> f:distinct)if(f.get()==200)added++;pool.shutdown();
  assertEquals(2,added,"el límite de "+3+" contactos vigentes se respeta bajo concurrencia");assertEquals(3,activeContacts(flight).size());
  assertEquals(1,activeContacts(flight).stream().filter(TransferContact::getPrincipal).count());
 }

 private static String contactIn(String relation,String name,String country,String phone){return "{\"relacion\":\""+relation+"\""+(name==null?"":",\"nombre\":\""+name+"\"")+(country==null?"":",\"pais\":\""+country+"\"")+",\"telefono\":\""+phone+"\"}";}

 @Test void coordinationPhonesFollowTheInternationalRulesStayAsE164AndNeverBecomePersonalContacts() throws Exception {
  Account dts=account("Internacional","DTS");long phonesBefore=phones.count();long before=snapshotCounts();
  for(String invalid:List.of(contactIn("PACIENTE",null,null,"3815550101"),contactIn("PACIENTE",null,"ZZ","3815550101"),contactIn("PACIENTE",null,"AR","+56 9 8765 4321"),contactIn("PACIENTE",null,"CL","381 555 0101"),
    contactIn("PACIENTE",null,"AR","0381 555-0101 ext 4"),contactIn("PACIENTE",null,"AR","123"),contactIn("PACIENTE",null,"US","+1 416 555 0123")))
   call("POST","/api/flights/with-patient",dts.token(),requestJson(newPatient(dni()),null,"["+invalid+"]")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("TRANSFER_CONTACT_INVALID")).andExpect(jsonPath("$.campo").value("telefono"));
  assertEquals(before,snapshotCounts(),"los rechazos no dejan persona, paciente, vuelo ni contacto");
  long flight=createdFlight(call("POST","/api/flights/with-patient",dts.token(),requestJson(newPatient(dni()),null,"["+contactIn("PACIENTE",null,"CL","9 8765 4321")+","+contactIn("FAMILIAR_RESPONSABLE","Marta","US","(202) 555-0123")+"]")));
  List<TransferContact> saved=activeContacts(flight);
  assertEquals(List.of("+56987654321","+12025550123"),saved.stream().map(TransferContact::getTelefonoNormalizado).toList());
  assertEquals(List.of("CL","US"),saved.stream().map(TransferContact::getCodigoPais).toList());
  assertEquals(List.of("+56 9 8765 4321","+1 202-555-0123"),saved.stream().map(TransferContact::getTelefono).toList());
  String base="/api/flights/"+flight+"/transfer-contacts";
  call("GET",base,dts.token(),null).andExpect(jsonPath("$.items[0].pais").value("CL")).andExpect(jsonPath("$.items[1].telefono").value("+1 202-555-0123"));
  // la misma línea escrita de otra forma es ambigua; el mismo número con otro país no es válido
  call("POST",base,dts.token(),contactIn("OTRO","Repetido","CL","+56 9 8765-4321")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONTACT_AMBIGUOUS"));
  call("POST",base,dts.token(),contactIn("OTRO","Otro país","AR","+56 9 8765 4321")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.motivo").value("PHONE_COUNTRY_MISMATCH"));
  // editar exige el país y revalida; guardar lo mismo no crea versión
  long first=saved.get(0).getId();
  call("PUT",base+"/"+first,dts.token(),"{\"relacion\":\"PACIENTE\",\"telefono\":\"9 8765 4321\",\"version\":0}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.motivo").value("PHONE_COUNTRY_REQUIRED"));
  call("PUT",base+"/"+first,dts.token(),"{\"relacion\":\"PACIENTE\",\"pais\":\"CL\",\"telefono\":\"+56 9 8765 4321\",\"version\":0}").andExpect(status().isOk()).andExpect(jsonPath("$.version").value(0));
  call("PUT",base+"/"+first,dts.token(),"{\"relacion\":\"PACIENTE\",\"pais\":\"BR\",\"telefono\":\"(11) 98765-4321\",\"version\":0}").andExpect(status().isOk()).andExpect(jsonPath("$.pais").value("BR")).andExpect(jsonPath("$.version").value(1));
  assertEquals(phonesBefore,phones.count(),"un teléfono de coordinación nunca pasa a ser un contacto personal de una persona");
  String audit=allAuditText(flight);for(String secret:List.of("987654321","8765 4321","2025550123","(202)"))assertFalse(audit.contains(secret),"auditoría sin números completos: "+secret);
 }
}
