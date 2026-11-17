package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.domain.catalog.*;
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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** The patient condition of a sanitary request comes from the reference catalog: the DTS selects it, free text is rejected. */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:patientconditions;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false","app.storage.documents-directory=target/test-patient-conditions",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class PatientConditionCatalogIntegrationTest {
 @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles;
 @Autowired ProvinceRepository provinces; @Autowired LocalityRepository localities; @Autowired FlightPriorityRepository priorities; @Autowired FlightTypeRepository types;
 @Autowired SanitaryRequestStatusRepository requestStatuses; @Autowired PatientConditionRepository patientConditions; @Autowired FlightRepository flights; @Autowired FlightMedicalInfoRepository medicalInfo; @Autowired PlatformTransactionManager txm;
 private static int seq=0; private static final String PASSWORD="ClaveSegura-12345";
 private static Long originId,destinationId;
 private static final List<String> CODES=List.of("BUENO","REGULAR","GRAVE_ESTABLE","GRAVE_INESTABLE","CRITICO","EXTREMA_GRAVEDAD","ESTABLE");
 private static final List<String> NAMES=List.of("Bueno","Regular","Grave estable","Grave inestable","Crítico","Extrema gravedad","Estable");

 private Role role(String code){return roles.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roles.save(r);});}
 private String token(String name,String roleCode) throws Exception {
  Person p=new Person();p.setNombre(name);p.setApellido("Condicion");p.setDni(String.valueOf(66000000+(++seq)));persons.save(p);
  User u=new User();u.setUsername(name.toLowerCase()+seq);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");u.setPasswordHash(encoder.encode(PASSWORD));users.save(u);userRoles.save(new UserRole(u,role(roleCode)));
  return JsonPath.read(mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+u.getUsername()+"\",\"password\":\""+PASSWORD+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.accessToken");
 }
 private ResultActions call(String method,String path,String token,String body) throws Exception {
  var b=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).contentType(MediaType.APPLICATION_JSON).header("Authorization","Bearer "+token);
  return mvc.perform(body==null?b:b.content(body));
 }
 private String requestJson(String condition){
  return "{\"patient\":{\"nombre\":\"Pablo\",\"apellido\":\"Paciente\",\"dni\":\""+(43000000+(++seq))+"\"},\"identidadConfirmada\":true,\"localidadOrigenId\":"+originId+",\"localidadDestinoId\":"+destinationId+",\"priorityCode\":\"ALTA\",\"motivoVuelo\":\"Traslado de prueba\","
   +"\"fechaSolicitada\":\""+LocalDateTime.now().plusDays(10).withNano(0)+"\",\"extremaUrgencia\":false,\"medical\":{\"diagnostico\":\"Control\",\"condicionMedica\":\""+condition+"\",\"requiereEquipamientoEspecial\":false}}";
 }

 @BeforeEach void seed(){
  for(String r:List.of("DTS","OPERACIONES"))role(r);
  if(originId!=null)return;
  Province pr=new Province();pr.setCodigoOficial("PC1");pr.setNombre("Provincia de prueba");pr.setActivo(true);provinces.save(pr);
  Locality a=new Locality();a.setCodigoOficial("PCL1");a.setNombre("Origen");a.setProvincia(pr);a.setActivo(true);localities.save(a);
  Locality b=new Locality();b.setCodigoOficial("PCL2");b.setNombre("Destino");b.setProvincia(pr);b.setActivo(true);localities.save(b);
  originId=a.getId();destinationId=b.getId();
  FlightPriority p=new FlightPriority();p.setCodigo("ALTA");p.setNombre("Alta");p.setActivo(true);p.setOrden((short)1);priorities.save(p);
  FlightType t=new FlightType();t.setCodigo("SANITARIO");t.setNombre("Sanitario");types.save(t);
  short order=1;for(String code:List.of("SOLICITADO","PENDIENTE_RESPUESTA_DTS","APROBADO","RECHAZADO","CANCELADO")){SanitaryRequestStatus s=new SanitaryRequestStatus();s.setCodigo(code);s.setNombre(code);s.setOrden(order++);requestStatuses.save(s);}
  for(int i=0;i<CODES.size();i++){PatientCondition c=new PatientCondition();c.setCodigo(CODES.get(i));c.setNombre(NAMES.get(i));c.setOrden((short)(i+1));patientConditions.save(c);}
  PatientCondition retired=new PatientCondition();retired.setCodigo("RETIRADA");retired.setNombre("Retirada");retired.setOrden((short)99);retired.setActivo(false);patientConditions.save(retired);
 }

 @Test void theCatalogListsTheActiveConditionsInOrder() throws Exception {
  String body=call("GET","/api/catalogs/patient-conditions",token("Dora","DTS"),null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  assertEquals(CODES,JsonPath.read(body,"$[*].codigo"));
  assertEquals(NAMES,JsonPath.read(body,"$[*].nombre"));
 }

 @Test void aRequestStoresTheSelectedCatalogCondition() throws Exception {
  String dts=token("Dana","DTS");
  long id=((Number)JsonPath.read(call("POST","/api/flights/with-patient",dts,requestJson("GRAVE_INESTABLE")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.id")).longValue();
  String stored=new TransactionTemplate(txm).execute(st->medicalInfo.findByFlightId(id).orElseThrow().getCondicionPaciente().getCodigo());
  assertEquals("GRAVE_INESTABLE",stored);
 }

 @Test void freeTextOrARetiredConditionIsRejectedAndNothingIsCreated() throws Exception {
  String dts=token("Dino","DTS");
  long before=flights.count();
  for(String invalid:List.of("Más o menos bien","RETIRADA"))
   call("POST","/api/flights/with-patient",dts,requestJson(invalid)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("La condición del paciente no es válida: seleccione una del catálogo"));
  assertEquals(before,flights.count());
 }
}
