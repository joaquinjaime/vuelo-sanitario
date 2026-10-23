package com.vuelossanitarios.backend.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;

/** Administración de aeronaves de extremo a extremo sobre HTTP, con seguridad y persistencia reales (H2 en modo SQL Server). */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:aircraftadministration;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class AircraftAdministrationIntegrationTest {
 @Autowired MockMvc mvc; @Autowired AircraftRepository aircraft; @Autowired AirportRepository airports; @Autowired UserRepository users; @Autowired PersonRepository persons;
 @Autowired FlightRepository flights; @Autowired FlightTypeRepository types; @Autowired FlightStatusRepository statuses;
 private User admin,ops,dts,commander; private Airport tuc,aep;
 private static int seq=0;

 private User user(String name){Person p=new Person();p.setNombre(name);p.setApellido("Prueba");p.setDni(String.valueOf(30000000+(++seq)));persons.save(p);User u=new User();u.setUsername(name+seq);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");return users.save(u);}
 private RequestPostProcessor as(User u,String... roles){List<SimpleGrantedAuthority> authorities=java.util.Arrays.stream(roles).map(r->new SimpleGrantedAuthority("ROLE_"+r)).toList();return SecurityMockMvcRequestPostProcessors.authentication(new UsernamePasswordAuthenticationToken(new CurrentUser(u.getId(),u.getUsername()),null,authorities));}
 private static int codes=0;
 private Airport airport(String name){Airport a=new Airport();a.setNombre(name);a.setActivo(true);int n=++codes;a.setCodigoOaci(String.format("T%03d",n));a.setCodigoIata(String.format("%03d",n));return airports.save(a);}
 private FlightStatus flightStatus(String code){return statuses.findByCodigo(code).orElseGet(()->{FlightStatus s=new FlightStatus();s.setCodigo(code);s.setNombre(code);s.setOrden((short)1);return statuses.save(s);});}
 private Flight flight(Aircraft plane,String state,LocalDateTime from,LocalDateTime to){FlightType t=types.findByCodigoAndActivoTrue("REGRESO_BASE").orElseGet(()->{FlightType x=new FlightType();x.setCodigo("REGRESO_BASE");x.setNombre("Regreso");return types.save(x);});Flight f=new Flight();f.setCodigo("V-"+(++seq)+"-"+System.nanoTime()%100000);f.setTipoVuelo(t);f.setMotivoVuelo("Prueba");f.setCreadoPor(ops);f.setAircraft(plane);f.setComandante(commander);f.setOrigen(plane.getAeropuertoActual());f.setFechaPlanificadaSalida(from);f.setFechaPlanificadaLlegada(to);f.setEstadoVuelo(flightStatus(state));return flights.save(f);}
 private String plateOf(){return "LV-T"+(++seq)+(System.nanoTime()%1000);}
 private String body(String plate,long airportId){return "{\"matricula\":\""+plate+"\",\"modelo\":\"King Air\",\"tipo\":\"Turbohélice\",\"capacidadPacientes\":1,\"capacidadTripulacion\":4,\"equipamientoMedico\":\"Camilla\",\"aeropuertoActualId\":"+airportId+",\"activo\":true}";}
 private long create(String plate) throws Exception {String json=mvc.perform(post("/api/catalogs/aircraft").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content(body(plate,tuc.getId()))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();return ((Number)JsonPath.read(json,"$.id")).longValue();}

 @BeforeEach void setup(){admin=user("admin");ops=user("ops");dts=user("dts");commander=user("cmd");tuc=airport("Tucumán "+(++seq));aep=airport("Aeroparque "+(++seq));}

 @Test void administratorRunsTheWholeLifecycleAndEveryStepIsAudited() throws Exception {
  String plate=plateOf();long id=create(plate);
  mvc.perform(post("/api/catalogs/aircraft").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content(body(plate.toLowerCase(),tuc.getId()))).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DUPLICATE_PLATE"));
  mvc.perform(post("/api/catalogs/aircraft").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content(body(plateOf(),999999L))).andExpect(status().isBadRequest());
  mvc.perform(post("/api/catalogs/aircraft").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"matricula\":\"\",\"modelo\":\"\",\"tipo\":\"x\",\"capacidadPacientes\":0,\"capacidadTripulacion\":0,\"aeropuertoActualId\":null}")).andExpect(status().isBadRequest());
  mvc.perform(post("/api/catalogs/aircraft").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content(body("LV BAD!",tuc.getId()))).andExpect(status().isBadRequest());
  mvc.perform(get("/api/catalogs/aircraft/admin").with(as(admin,"ADMINISTRADOR"))).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id=="+id+")].estadoOperativo").value("SIN_ASIGNACIONES")).andExpect(jsonPath("$[?(@.id=="+id+")].aeropuertoActualId").value((int)(long)tuc.getId()));
  mvc.perform(put("/api/catalogs/aircraft/"+id).with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"matricula\":\""+plate+"\",\"modelo\":\"King Air B350\",\"tipo\":\"Turbohélice\",\"capacidadPacientes\":2,\"capacidadTripulacion\":5,\"equipamientoMedico\":\"Camilla y respirador\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.modelo").value("King Air B350")).andExpect(jsonPath("$.capacidadTripulacion").value(5));
  mvc.perform(put("/api/catalogs/aircraft/"+id).with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"matricula\":\""+plate+"\",\"modelo\":\"X\",\"tipo\":\"T\",\"capacidadPacientes\":1,\"capacidadTripulacion\":2,\"activo\":false}")).andExpect(status().isBadRequest());
  mvc.perform(post("/api/catalogs/aircraft/"+id+"/location").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"locationId\":"+aep.getId()+",\"motivo\":\"Reposicionamiento\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.aeropuertoActualId").value((int)(long)aep.getId()));
  mvc.perform(post("/api/catalogs/aircraft/"+id+"/location").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"locationId\":"+aep.getId()+"}")).andExpect(status().isBadRequest());
  mvc.perform(post("/api/catalogs/aircraft/"+id+"/active").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false,\"motivo\":\"Mantenimiento\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.estadoOperativo").value("DESACTIVADA"));
  mvc.perform(post("/api/catalogs/aircraft/"+id+"/active").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false}")).andExpect(status().isConflict());
  mvc.perform(get("/api/catalogs/aircraft").with(as(ops,"CENTRO_OPERACIONES"))).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id=="+id+")]").isEmpty());
  mvc.perform(get("/api/catalogs/aircraft/admin").with(as(admin,"ADMINISTRADOR"))).andExpect(jsonPath("$[?(@.id=="+id+")].activo").value(false));
  assertTrue(aircraft.findById(id).isPresent());
  mvc.perform(post("/api/catalogs/aircraft/"+id+"/active").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"activo\":true}")).andExpect(status().isOk()).andExpect(jsonPath("$.activo").value(true));
  String history=mvc.perform(get("/api/catalogs/aircraft/"+id+"/history").with(as(admin,"ADMINISTRADOR"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  List<String> operations=JsonPath.read(history,"$[*].operacion");
  assertTrue(operations.containsAll(List.of("CREATE","UPDATE","MANUAL_LOCATION_CHANGE","SET_ACTIVE")),operations.toString());assertEquals(5,operations.size());
  List<String> actors=JsonPath.read(history,"$[*].usuario");assertTrue(actors.stream().allMatch(a->a.equals(admin.getUsername())));
  assertEquals(2,((List<?>)JsonPath.read(history,"$[?(@.operacion=='SET_ACTIVE')]")).size());
 }

 @Test void committedFlightsBlockDeactivationAndEditsWhileCancellationFreesTheAircraftKeepingTheHistory() throws Exception {
  long id=create(plateOf());Aircraft plane=aircraft.findById(id).orElseThrow();
  Flight planned=flight(plane,"PLANIFICADO",LocalDateTime.now().plusDays(5),LocalDateTime.now().plusDays(5).plusHours(2));
  mvc.perform(post("/api/catalogs/aircraft/"+id+"/active").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("AIRCRAFT_HAS_ASSIGNMENTS")).andExpect(jsonPath("$.vuelos[0]").value(planned.getCodigo()));
  mvc.perform(post("/api/catalogs/aircraft/"+id+"/location").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"locationId\":"+aep.getId()+"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("AIRCRAFT_LOCATION_CONFLICT"));
  mvc.perform(get("/api/catalogs/aircraft/"+id).with(as(ops,"OPERACIONES"))).andExpect(jsonPath("$.estadoOperativo").value("ASIGNADA")).andExpect(jsonPath("$.vuelosComprometidos").value(1)).andExpect(jsonPath("$.proximoVuelo.codigo").value(planned.getCodigo()));
  planned.setEstadoVuelo(flightStatus("EN_CURSO"));flights.save(planned);
  mvc.perform(post("/api/catalogs/aircraft/"+id+"/active").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("AIRCRAFT_IN_FLIGHT"));
  mvc.perform(put("/api/catalogs/aircraft/"+id).with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"matricula\":\""+plane.getMatricula()+"\",\"modelo\":\"Otro\",\"tipo\":\"T\",\"capacidadPacientes\":1,\"capacidadTripulacion\":4}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("AIRCRAFT_IN_FLIGHT"));
  mvc.perform(get("/api/catalogs/aircraft/admin").with(as(admin,"ADMINISTRADOR"))).andExpect(jsonPath("$[?(@.id=="+id+")].estadoOperativo").value("EN_VUELO"));
  planned.setEstadoVuelo(flightStatus("CANCELADO"));flights.save(planned);
  mvc.perform(post("/api/catalogs/aircraft/"+id+"/active").with(as(admin,"ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false}")).andExpect(status().isOk()).andExpect(jsonPath("$.estadoOperativo").value("DESACTIVADA"));
  mvc.perform(get("/api/catalogs/aircraft/"+id+"/flights").with(as(admin,"ADMINISTRADOR"))).andExpect(status().isOk()).andExpect(jsonPath("$[0].codigo").value(planned.getCodigo())).andExpect(jsonPath("$[0].estado").value("CANCELADO"));
  assertTrue(flights.findById(planned.getId()).isPresent());assertEquals(id,flights.findById(planned.getId()).orElseThrow().getAircraft().getId());
 }

 @Test void availabilityIsPerIntervalAndDistinguishesActiveFromAvailable() throws Exception {
  long id=create(plateOf());Aircraft plane=aircraft.findById(id).orElseThrow();
  LocalDateTime tomorrow=LocalDateTime.now().plusDays(1).withHour(10).withMinute(0).withSecond(0).withNano(0);
  Flight f=flight(plane,"PLANIFICADO",tomorrow,tomorrow.plusHours(2));
  mvc.perform(get("/api/catalogs/aircraft/availability").with(as(ops,"CENTRO_OPERACIONES")).param("from",tomorrow.minusDays(1).toString()).param("to",tomorrow.minusDays(1).plusHours(2).toString())).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id=="+id+")].disponible").value(true));
  mvc.perform(get("/api/catalogs/aircraft/availability").with(as(ops,"CENTRO_OPERACIONES")).param("from",tomorrow.plusHours(1).toString()).param("to",tomorrow.plusHours(3).toString())).andExpect(jsonPath("$[?(@.id=="+id+")].disponible").value(false)).andExpect(jsonPath("$[?(@.id=="+id+")].conflictos[0].codigo").value(f.getCodigo()));
  mvc.perform(get("/api/catalogs/aircraft/availability").with(as(ops,"CENTRO_OPERACIONES")).param("from",tomorrow.plusHours(2).toString()).param("to",tomorrow.plusHours(4).toString())).andExpect(jsonPath("$[?(@.id=="+id+")].disponible").value(true));
  mvc.perform(get("/api/catalogs/aircraft/availability").with(as(ops,"CENTRO_OPERACIONES")).param("from",tomorrow.plusHours(3).toString()).param("to",tomorrow.toString())).andExpect(status().isBadRequest());
  f.setEstadoVuelo(flightStatus("CANCELADO"));flights.save(f);
  mvc.perform(get("/api/catalogs/aircraft/availability").with(as(ops,"CENTRO_OPERACIONES")).param("from",tomorrow.plusHours(1).toString()).param("to",tomorrow.plusHours(3).toString())).andExpect(jsonPath("$[?(@.id=="+id+")].disponible").value(true));
 }

 @Test void rolesAreEnforcedByTheServerNotByTheInterface() throws Exception {
  long id=create(plateOf());String json=body(plateOf(),tuc.getId());
  for(String role:List.of("DTS","COMANDANTE","CENTRO_OPERACIONES","OPERACIONES")){
   User u=user("x");
   mvc.perform(post("/api/catalogs/aircraft").with(as(u,role)).contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isForbidden());
   mvc.perform(put("/api/catalogs/aircraft/"+id).with(as(u,role)).contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isForbidden());
   mvc.perform(post("/api/catalogs/aircraft/"+id+"/active").with(as(u,role)).contentType(MediaType.APPLICATION_JSON).content("{\"activo\":false}")).andExpect(status().isForbidden());
   mvc.perform(get("/api/catalogs/aircraft/admin").with(as(u,role))).andExpect(status().isForbidden());
   mvc.perform(get("/api/catalogs/aircraft/"+id+"/history").with(as(u,role))).andExpect(status().isForbidden());
  }
  for(String role:List.of("DTS","COMANDANTE")){
   User u=user("y");
   mvc.perform(post("/api/catalogs/aircraft/"+id+"/location").with(as(u,role)).contentType(MediaType.APPLICATION_JSON).content("{\"locationId\":"+aep.getId()+"}")).andExpect(status().isForbidden());
   mvc.perform(get("/api/catalogs/aircraft/"+id+"/flights").with(as(u,role))).andExpect(status().isForbidden());
   mvc.perform(get("/api/catalogs/aircraft/availability").with(as(u,role)).param("from","2030-01-01T10:00:00").param("to","2030-01-01T12:00:00")).andExpect(status().isForbidden());
  }
  mvc.perform(post("/api/catalogs/aircraft/"+id+"/location").with(as(ops,"CENTRO_OPERACIONES")).contentType(MediaType.APPLICATION_JSON).content("{\"locationId\":"+aep.getId()+"}")).andExpect(status().isOk());
  mvc.perform(get("/api/catalogs/aircraft/"+id+"/flights").with(as(ops,"OPERACIONES"))).andExpect(status().isOk());
  mvc.perform(get("/api/catalogs/aircraft/admin")).andExpect(status().is4xxClientError());
  mvc.perform(get("/api/catalogs/aircraft").with(as(dts,"DTS"))).andExpect(status().isOk());
  mvc.perform(get("/api/catalogs/aircraft").with(as(commander,"COMANDANTE"))).andExpect(status().isOk());
  assertEquals(aep.getId(),aircraft.findAllWithCurrentAirportOrderByMatricula().stream().filter(a->a.getId().equals(id)).findFirst().orElseThrow().getAeropuertoActual().getId());
 }
}
