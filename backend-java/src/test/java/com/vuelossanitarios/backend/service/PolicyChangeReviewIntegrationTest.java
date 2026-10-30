package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;

import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * La baja de una política de suficiencia vuelve no elegible, de inmediato, a quien dependía de ella (la elegibilidad se calcula en cada consulta) y,
 * en segundo plano y sin demorar al administrador, dispara la revisión de los vuelos abiertos: Operaciones recibe una alerta única y la asignación
 * histórica no se toca. El mismo recorrido contra SQL Server real está en scripts/e2e-habilitaciones-vuelos.cjs (allí por vuelo, no global).
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:policyreview;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;LOCK_TIMEOUT=20000",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false","app.storage.documents-directory=target/test-credential-docs",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email=",
  "app.credential-expiry.sweep-initial-ms=3600000","app.antimalware.retry-initial-ms=3600000","app.crew-eligibility.sweep-initial-ms=3600000"
})
class PolicyChangeReviewIntegrationTest {
 @Autowired CredentialPolicyService policies; @Autowired CrewManagementService crewService; @Autowired CrewEligibilityMonitoringService monitoring;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roleRepository; @Autowired UserRoleRepository userRoles; @Autowired CrewRoleRepository crewRoles;
 @Autowired CrewQualificationRepository qualifications; @Autowired ProfessionalCredentialRepository credentials; @Autowired FlightRepository flights; @Autowired FlightTypeRepository types;
 @Autowired FlightStatusRepository statuses; @Autowired FlightCrewRepository crews; @Autowired org.springframework.transaction.PlatformTransactionManager manager; @Autowired NotificationRepository notifications; @Autowired CredentialPolicyRepository policyRepository;

 private CrewManagementService.Eligibility eligibility(Long flightId,Long userId){return new org.springframework.transaction.support.TransactionTemplate(manager).execute(st->crewService.evaluate(flights.findById(flightId).orElseThrow(),users.findById(userId).orElseThrow(),"MEDICO",false));}
 private static int seq;
 private static synchronized int next(){return ++seq;}
 private Role role(String code){return roleRepository.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roleRepository.save(r);});}
 private CrewRole crewRole(String code){return crewRoles.findByCodigo(code).orElseGet(()->{CrewRole r=new CrewRole();r.setCodigo(code);r.setNombre(code);return crewRoles.save(r);});}
 private User user(String prefix,String roleCode){
  int n=next();Person p=new Person();p.setNombre(prefix);p.setApellido("T"+n);p.setDni(String.valueOf(60000000+n));persons.save(p);
  User u=new User();u.setUsername(prefix+n);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");users.save(u);userRoles.save(new UserRole(u,role(roleCode)));return users.findById(u.getId()).orElseThrow();
 }

 @Test void dropping_a_policy_makes_the_assignee_ineligible_and_alerts_operations_once_without_touching_the_assignment() throws Exception {
  User admin=user("adm","ADMINISTRADOR"),ops=user("ops","CENTRO_OPERACIONES"),medic=user("med","MEDICO");
  CrewRole medicRole=crewRole("MEDICO");
  FlightStatus planned=statuses.findByCodigo("PLANIFICADO").orElseGet(()->{FlightStatus s=new FlightStatus();s.setCodigo("PLANIFICADO");s.setNombre("PLANIFICADO");s.setOrden((short)1);return statuses.save(s);});
  FlightType type=types.findByCodigo("REGRESO_BASE").orElseGet(()->{FlightType t=new FlightType();t.setCodigo("REGRESO_BASE");t.setNombre("Regreso");return types.save(t);});
  Flight f=new Flight();f.setCodigo("V-PR"+next());f.setTipoVuelo(type);f.setMotivoVuelo("Revisión de política");f.setCreadoPor(ops);f.setFechaPlanificadaSalida(LocalDateTime.now().plusDays(30).withNano(0));f.setFechaPlanificadaLlegada(LocalDateTime.now().plusDays(30).plusHours(2).withNano(0));f.setEstadoVuelo(planned);f=flights.save(f);
  CrewQualification q=new CrewQualification();q.setUser(medic);q.setRole(medicRole);q.setClassifier(admin);qualifications.save(q);
  ProfessionalCredential c=new ProfessionalCredential();c.person=medic.getPerson();c.role=medicRole;c.type="Médico "+f.getCodigo();c.number="PR-"+next();c.issuer="Colegio";c.noExpiry=true;c.status="VERIFICADA";credentials.save(c);
  FlightCrew assignment=new FlightCrew();assignment.setFlight(f);assignment.setUser(medic);assignment.setCrewRole(medicRole);assignment.setAsignadoPor(admin);crews.saveAndFlush(assignment);
  for(CredentialPolicy existing:policyRepository.findActiveByRole("MEDICO"))policies.deactivate(existing.getId(),"preparación",admin.getId());
  var policy=policies.create(new CredentialPolicyService.Input("MEDICO",null,null,"Médico "+f.getCodigo(),false,false,null,null,null),admin.getId());
  assertTrue(eligibility(f.getId(),medic.getId()).eligible(),"con la política vigente es elegible");

  long before=notifications.findByUserIdOrderByCreatedAtDesc(ops.getId(),org.springframework.data.domain.PageRequest.of(0,200)).getContent().stream().filter(n->"CREW_ELIGIBILITY_REVIEW".equals(n.getTipo())).count();
  policies.deactivate(policy.id(),"Cambio de criterio",admin.getId());
  var after=eligibility(f.getId(),medic.getId());
  assertFalse(after.eligible());assertEquals("POLITICA_HABILITACION_NO_CONFIGURADA",after.code(),"inmediato, sin esperar a la revisión de fondo");

  long deadline=System.currentTimeMillis()+20000;long seen=before;
  while(System.currentTimeMillis()<deadline&&seen==before){Thread.sleep(200);seen=notifications.findByUserIdOrderByCreatedAtDesc(ops.getId(),org.springframework.data.domain.PageRequest.of(0,200)).getContent().stream().filter(n->"CREW_ELIGIBILITY_REVIEW".equals(n.getTipo())).count();}
  assertEquals(before+1,seen,"la revisión asíncrona alerta a Operaciones");
  monitoring.reviewFlight(f.getId());monitoring.reviewFlight(f.getId());
  assertEquals(before+1,notifications.findByUserIdOrderByCreatedAtDesc(ops.getId(),org.springframework.data.domain.PageRequest.of(0,200)).getContent().stream().filter(n->"CREW_ELIGIBILITY_REVIEW".equals(n.getTipo())).count(),"repetir la revisión no duplica la alerta");
  assertEquals(1,crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()).size(),"la asignación histórica sigue allí");
  Long id=f.getId();assertEquals("PLANIFICADO",new org.springframework.transaction.support.TransactionTemplate(manager).execute(st->flights.findById(id).orElseThrow().getEstadoVuelo().getCodigo()),"el vuelo no se altera");
 }
}
