package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.catalog.FlightType;
import com.vuelossanitarios.backend.domain.flight.CrewQualification;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import com.vuelossanitarios.backend.service.CredentialPolicyActivationService.*;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * I-5.7: simulación y activación atómica de la política de suficiencia y regularización de documentos anteriores a V59, sobre H2 (modo SQL Server).
 * Los triggers de V60 sólo existen en SQL Server: se comprueban en el E2E contra la base real.
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:policyactivation;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;LOCK_TIMEOUT=20000",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false","app.storage.documents-directory=target/test-policy-activation-docs",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false","app.antimalware.enabled=true",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email=",
  "app.credential-expiry.sweep-initial-ms=3600000","app.antimalware.retry-initial-ms=3600000","app.crew-eligibility.policy-review-enabled=false"
})
class PolicyActivationAndLegacyIntegrationTest {
 @Autowired CredentialPolicyActivationService activation; @Autowired CredentialPolicyService policies; @Autowired ProfessionalCredentialService credentials; @Autowired CredentialDocumentService documents; @Autowired LegacyDocumentService legacy;
 @Autowired CredentialPolicyRepository policyRepository; @Autowired CredentialDocumentRepository documentRepository; @Autowired ProfessionalCredentialRepository credentialRepository; @Autowired CrewQualificationRepository qualifications;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roleRepository; @Autowired UserRoleRepository userRoles; @Autowired CrewRoleRepository crewRoles; @Autowired FlightTypeRepository flightTypes;
 @Autowired PlatformTransactionManager transactionManager;
 @MockBean MalwareScanner scanner;
 private <T> T inTransaction(java.util.function.Supplier<T> work){return new TransactionTemplate(transactionManager).execute(s->work.get());}

 private static int seq; private static synchronized int next(){return ++seq;}
 private static User admin,reviewer; private User holder;
 private Role role(String code){return roleRepository.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roleRepository.save(r);});}
 private User user(String prefix,String roleCode){
  int n=next();Person p=new Person();p.setNombre(prefix);p.setApellido("T"+n);p.setDni(String.valueOf(60000000+n));persons.save(p);
  User u=new User();u.setUsername(prefix+n);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");users.save(u);userRoles.save(new UserRole(u,role(roleCode)));return users.findById(u.getId()).orElseThrow();
 }
 private static byte[] pdf() throws Exception {int n=next();return PdfInspectorTest.pdf(d->d.getDocumentInformation().setTitle("documento "+n));}
 private void scannerSays(MalwareScanner.Status status,String detail){when(scanner.scan(any())).thenReturn(new MalwareScanner.Result(status,"prueba",detail));}
 private ApiException failure(org.junit.jupiter.api.function.Executable e){return assertThrows(ApiException.class,e);}
 private static PolicyRow row(String role,String flightType,String category,String type){return new PolicyRow(role,flightType,category,type,false,false,null,null,null);}
 private static Proposal proposal(List<String> roles,PolicyRow... rows){return new Proposal("prueba",roles,List.of(rows),List.of());}
 private ActivationRequest approve(Proposal p,boolean acknowledge){return new ActivationRequest(p,CredentialPolicyActivationService.fingerprint(p),"Acta de prueba N° "+next(),acknowledge);}
 private long activeCount(String role){return policyRepository.findActiveByRole(role).size();}
 private void clearPolicies(String role){for(CredentialPolicy p:policyRepository.findActiveByRole(role))policies.deactivate(p.getId(),"preparación de prueba",admin.getId());}

 @BeforeEach void setUp(){
  if(admin==null){
   for(String code:List.of("COMANDANTE","COPILOTO","MEDICO","ENFERMERO"))crewRoles.findByCodigo(code).orElseGet(()->{CrewRole r=new CrewRole();r.setCodigo(code);r.setNombre(code);return crewRoles.save(r);});
   for(String code:List.of("SANITARIO","TRASLADO_OPERATIVO"))flightTypes.findByCodigoAndActivoTrue(code).orElseGet(()->{FlightType t=new FlightType();t.setCodigo(code);t.setNombre(code);t.setActivo(true);return flightTypes.save(t);});
   admin=user("adminA","ADMINISTRADOR");reviewer=user("adminB","ADMINISTRADOR");
  }
  holder=user("titular","ADMINISTRADOR");
  for(String r:List.of("COMANDANTE","COPILOTO","MEDICO","ENFERMERO"))clearPolicies(r);
  scannerSays(MalwareScanner.Status.CLEAN,null);
 }

 // ---------- política ----------
 @Test void simulationWritesNothingAndTheFingerprintIgnoresRowOrderButNotContent(){
  Proposal a=proposal(List.of("MEDICO"),row("MEDICO",null,null,"Tipo A"),row("MEDICO","SANITARIO",null,"Tipo B"));
  Proposal reordered=proposal(List.of("MEDICO"),row("MEDICO","SANITARIO",null,"Tipo B"),row("medico",null,null,"tipo a"));
  Proposal changed=proposal(List.of("MEDICO"),row("MEDICO",null,null,"Tipo A"),new PolicyRow("MEDICO","SANITARIO",null,"Tipo B",true,false,null,null,null));
  long before=policyRepository.count();
  Report report=activation.simulate(a);
  assertEquals(before,policyRepository.count());assertTrue(report.canActivate());assertEquals(CredentialPolicyActivationService.fingerprint(a),report.fingerprint());
  assertEquals(report.fingerprint(),CredentialPolicyActivationService.fingerprint(reordered));assertNotEquals(report.fingerprint(),CredentialPolicyActivationService.fingerprint(changed));
  assertEquals(2,report.plan().get(0).create());assertEquals(0,report.plan().get(0).retire());
 }
 @Test void invalidProposalsAreReportedAndCannotBeActivated(){
  Proposal bad=proposal(List.of("MEDICO"),row("MEDICO",null,null," "),row("MEDICO","INEXISTENTE",null,"Tipo A"),row("MEDICO",null,null,"Tipo C"),row("medico",null,null,"TIPO C"),row("ENFERMERO",null,null,"Tipo D"),
    new PolicyRow("MEDICO",null,null,"Tipo E",false,false,"FUENTE_OFICIAL_CITADA",null,null));
  Report report=activation.simulate(bad);
  Set<String> codes=new HashSet<>();report.issues().forEach(i->codes.add(i.code()));
  assertFalse(report.canActivate());
  assertTrue(codes.containsAll(Set.of("TIPO_HABILITACION_REQUERIDO","TIPO_VUELO_INVALIDO","FILA_DUPLICADA","FUNCION_FUERA_DE_ALCANCE","FUENTE_REQUERIDA")),codes.toString());
  assertEquals("PROPUESTA_INVALIDA",failure(()->activation.activate(approve(bad,true),admin.getId())).code());assertEquals(0,activeCount("MEDICO"));
  assertEquals("ALCANCE_REQUERIDO",failure(()->activation.simulate(new Proposal("x",List.of(),List.of(),List.of()))).code());
  assertTrue(activation.simulate(proposal(List.of("PILOTO_X"),row("PILOTO_X",null,null,"A"))).issues().stream().anyMatch(i->"FUNCION_INVALIDA".equals(i.code())));
 }
 @Test void aProposalMustMatchTheApprovedFingerprintAndNeedsAnApprovalReference(){
  Proposal approved=proposal(List.of("MEDICO"),row("MEDICO",null,null,"Tipo A"));Proposal tampered=proposal(List.of("MEDICO"),row("MEDICO",null,null,"Tipo A"),row("MEDICO",null,null,"Tipo Z"));
  var stale=new ActivationRequest(tampered,CredentialPolicyActivationService.fingerprint(approved),"Acta 1",true);
  assertEquals("HUELLA_NO_COINCIDE",failure(()->activation.activate(stale,admin.getId())).code());assertEquals(0,activeCount("MEDICO"));
  var noApproval=new ActivationRequest(approved,CredentialPolicyActivationService.fingerprint(approved)," ",true);
  assertEquals("APROBACION_REQUERIDA",failure(()->activation.activate(noApproval,admin.getId())).code());assertEquals(0,activeCount("MEDICO"));
 }
 @Test void activationIsAtomicIdempotentAndRecordsTheApprovalBatch(){
  Proposal first=proposal(List.of("MEDICO","ENFERMERO"),row("MEDICO",null,null,"Tipo A"),new PolicyRow("MEDICO","SANITARIO","Turbohélice","Tipo B",true,true,null,null,"nota"),row("ENFERMERO",null,null,"Tipo E"));
  var activated=activation.activate(approve(first,false),admin.getId());
  assertTrue(activated.changed());assertEquals(3,activated.created());assertEquals(0,activated.retired());assertEquals(2,activeCount("MEDICO"));assertEquals(1,activeCount("ENFERMERO"));
  CredentialPolicy created=policyRepository.findById(activated.createdIds().get(0)).orElseThrow();
  assertEquals(activated.batchId(),created.activationBatch);assertTrue(created.approvalReference.startsWith("Acta de prueba"));
  var again=activation.activate(approve(first,false),admin.getId());
  assertFalse(again.changed());assertEquals(0,again.created());assertEquals(0,again.retired());assertEquals(3,again.kept());assertEquals(3,activeCount("MEDICO")+activeCount("ENFERMERO"));
  // Modificar una política = baja de la anterior y alta de la nueva en el mismo paso; las demás se conservan.
  Proposal modified=proposal(List.of("MEDICO","ENFERMERO"),row("MEDICO",null,null,"Tipo A"),new PolicyRow("MEDICO","SANITARIO","Turbohélice","Tipo B",true,false,null,null,"nota"),row("ENFERMERO",null,null,"Tipo E"));
  var changed=activation.activate(approve(modified,false),admin.getId());
  assertEquals(1,changed.created());assertEquals(1,changed.retired());assertEquals(2,changed.kept());assertEquals(2,activeCount("MEDICO"));
  CredentialPolicy retired=policyRepository.findById(changed.retiredIds().get(0)).orElseThrow();
  assertFalse(retired.active);assertTrue(retired.retireReason.contains(changed.batchId()));assertNotNull(retired.retiredAt);
 }
 @Test void aRoleWithoutProposedPoliciesStaysNotEligibleAndIsReported(){
  activation.activate(approve(proposal(List.of("COPILOTO"),row("COPILOTO",null,null,"Tipo C")),false),admin.getId());assertEquals(1,activeCount("COPILOTO"));
  Proposal empty=new Proposal("vaciar",List.of("COPILOTO"),List.of(),List.of(new PendingDecision("COPILOTO","Requisitos del copiloto","Pendiente de definición normativa")));
  Report report=activation.simulate(empty);
  assertTrue(report.issues().stream().anyMatch(i->"FUNCION_SIN_POLITICA".equals(i.code())));assertTrue(report.issues().stream().anyMatch(i->"DECISION_PENDIENTE".equals(i.code())));assertFalse(report.plan().get(0).eligibleAfterActivation());
  var done=activation.activate(approve(empty,false),admin.getId());assertEquals(1,done.retired());assertEquals(0,activeCount("COPILOTO"));
  var assessment=inTransaction(()->credentials.assess(holder,"COPILOTO",null));assertEquals("HABILITACION_AUSENTE",assessment.code());
 }
 @Test void peopleAndOpenFlightImpactIsComputedWithTheSameRuleAsTheRealEligibility() throws Exception {
  activation.activate(approve(proposal(List.of("MEDICO"),row("MEDICO",null,null,"Médico")),false),admin.getId());
  User medic=user("medico","ADMINISTRADOR");CrewRole medicRole=crewRoles.findByCodigo("MEDICO").orElseThrow();CrewQualification q=new CrewQualification();q.setUser(medic);q.setRole(medicRole);q.setClassifier(admin);qualifications.saveAndFlush(q);
  var created=credentials.create(medic.getId(),new ProfessionalCredentialService.Input("MEDICO","Médico","MP-"+next(),"Colegio",LocalDate.now().minusYears(1),LocalDate.now().plusYears(1),false,null,null,null,null),admin.getId());
  documents.upload(created.id(),new MockMultipartFile("file","matricula.pdf","application/pdf",pdf()),"EVIDENCIA",null,admin.getId());
  assertEquals("VERIFICADA",credentials.decide(created.id(),"VERIFICADA",new ProfessionalCredentialService.Decision("ok",true,false),reviewer.getId()).status());
  assertTrue(inTransaction(()->credentials.assess(medic,"MEDICO",null)).eligible());
  Report same=activation.simulate(proposal(List.of("MEDICO"),row("MEDICO",null,null,"médico")));
  assertEquals(0,same.people().get(0).becomeIneligible());assertTrue(same.people().get(0).stayEligible()>=1);
  Report other=activation.simulate(proposal(List.of("MEDICO"),row("MEDICO",null,null,"Otro tipo")));
  assertTrue(other.people().get(0).becomeIneligible()>=1);assertTrue(other.issues().stream().anyMatch(i->"TIPOS_NO_RECONOCIDOS".equals(i.code())));
  assertTrue(inTransaction(()->credentials.assess(medic,"MEDICO",null)).eligible(),"la simulación no cambia la elegibilidad real");
 }
 @Test void broaderPoliciesMakeNarrowerOnesRedundantAndCategoriesWithoutAircraftAreReported(){
  Report report=activation.simulate(proposal(List.of("MEDICO"),row("MEDICO",null,null,"Tipo A"),row("MEDICO","SANITARIO",null,"Tipo A"),row("MEDICO","SANITARIO","Turbohélice","Tipo B")));
  Set<String> codes=new HashSet<>();report.issues().forEach(i->codes.add(i.code()));
  assertTrue(codes.contains("POLITICA_REDUNDANTE"));assertTrue(codes.contains("SIN_CATEGORIA_EXIGIDA"));assertTrue(codes.contains("SIN_AERONAVES"));assertTrue(report.canActivate(),"las advertencias no bloquean");
 }

 // ---------- documentos heredados ----------
 private CredentialDocument legacyDocument(ProfessionalCredentialService.View credential){
  CredentialDocument d=documentRepository.findById(credential.documents().get(0).id()).orElseThrow();
  d.origin=CredentialDocument.BEFORE_V59;d.scanStatus=CredentialDocument.LEGACY;d.sha256=null;d.hashMoment=null;d.sizeBytes=null;d.scannedAt=null;d.scanEngine=null;d.scanDetail="Cargado antes de V59 sin hash ni análisis antimalware";return documentRepository.saveAndFlush(d);
 }
 private ProfessionalCredentialService.View verifiedWithLegacyDocument() throws Exception {
  policies.create(new CredentialPolicyService.Input("MEDICO",null,null,"Médico",false,false,null,null,"prueba"),admin.getId());
  var created=credentials.create(holder.getId(),new ProfessionalCredentialService.Input("MEDICO","Médico","MP-"+next(),"Colegio",LocalDate.now().minusYears(1),LocalDate.now().plusYears(1),false,null,null,null,null),admin.getId());
  documents.upload(created.id(),new MockMultipartFile("file","matricula.pdf","application/pdf",pdf()),"EVIDENCIA",null,admin.getId());
  var verified=credentials.decide(created.id(),"VERIFICADA",new ProfessionalCredentialService.Decision("ok",true,false),reviewer.getId());legacyDocument(verified);return credentials.find(verified.id());
 }
 @Test void aLegacyDocumentIsRestrictedAndNeverTreatedAsCleanBecauseItWasUploadedBefore() throws Exception {
  var view=verifiedWithLegacyDocument();var doc=view.documents().get(0);
  assertEquals("LEGADO_SIN_ANALISIS",doc.scanStatus());assertEquals("ANTERIOR_V59",doc.origin());assertNull(doc.sha256());assertTrue(doc.restriction().contains("V59"));assertEquals("LEGADO_SIN_ANALISIS",view.documentStatus());
  assertEquals("DOCUMENTO_HEREDADO",failure(()->documents.rescan(doc.id(),admin.getId())).code(),"un heredado se regulariza, no se reanaliza a ciegas");
  var denied=failure(()->documents.download(doc.id(),admin.getId()));assertEquals("DOCUMENTO_NO_DISPONIBLE",denied.code());assertTrue(denied.getMessage().contains("V59"));
  // Una verificación nueva no puede apoyarse en un documento heredado sin analizar.
  var other=credentials.create(holder.getId(),new ProfessionalCredentialService.Input("MEDICO","Médico","MP-"+next(),"Colegio",LocalDate.now().minusYears(1),LocalDate.now().plusYears(1),false,null,null,null,null),admin.getId());
  legacyDocument(documents.upload(other.id(),new MockMultipartFile("file","otra.pdf","application/pdf",pdf()),"EVIDENCIA",null,admin.getId()));
  assertEquals("DOCUMENTACION_NO_LIMPIA",failure(()->credentials.decide(other.id(),"VERIFICADA",new ProfessionalCredentialService.Decision("x",true,false),reviewer.getId())).code());
 }
 @Test void regularizingWithARealCleanScanKeepsTheLegacyOriginAndLabelsTheLaterFingerprint() throws Exception {
  var doc=verifiedWithLegacyDocument().documents().get(0);
  var outcome=legacy.regularize(doc.id(),reviewer.getId());
  assertEquals("REGULARIZADO",outcome.result());
  CredentialDocument saved=documentRepository.findById(doc.id()).orElseThrow();
  assertEquals(CredentialDocument.CLEAN,saved.scanStatus);assertEquals(CredentialDocument.BEFORE_V59,saved.origin,"el origen heredado se conserva");assertEquals(64,saved.sha256.length());assertEquals(CredentialDocument.HASH_AT_REGULARIZATION,saved.hashMoment);
  assertEquals(reviewer.getId(),saved.regularizedBy.getId());assertNotNull(saved.regularizedAt);assertTrue(saved.scanDetail.contains("no prueba integridad desde la carga original"));
  assertNotNull(documents.download(doc.id(),admin.getId()));
  assertEquals("YA_RESUELTO",legacy.regularize(doc.id(),reviewer.getId()).result());
  assertTrue(credentials.decisions(saved.credential.getId()).stream().anyMatch(d->"ANALISIS_DOCUMENTO".equals(d.type())&&d.reason().contains("anterior a V59")));
 }
 @Test void anUnavailableScannerOrAMissingFileLeavesTheDocumentRestrictedWithAnExplanation() throws Exception {
  var doc=verifiedWithLegacyDocument().documents().get(0);
  scannerSays(MalwareScanner.Status.ERROR,"Analizador no disponible");
  var outcome=legacy.regularize(doc.id(),reviewer.getId());
  assertEquals("RESTRINGIDO",outcome.result());assertEquals("Analizador no disponible",outcome.detail());
  CredentialDocument saved=documentRepository.findById(doc.id()).orElseThrow();
  assertEquals(CredentialDocument.LEGACY,saved.scanStatus,"no se inventa un estado nuevo");assertEquals(CredentialDocument.HASH_AT_REGULARIZATION,saved.hashMoment,"la huella sí se registra, rotulada");assertTrue(saved.scanDetail.contains("Anterior a V59"));
  assertEquals("DOCUMENTO_NO_DISPONIBLE",failure(()->documents.download(doc.id(),admin.getId())).code());
  saved.key="no-existe.pdf";documentRepository.saveAndFlush(saved);
  var missing=legacy.regularize(doc.id(),reviewer.getId());assertEquals("RESTRINGIDO",missing.result());assertTrue(missing.detail().contains("no está disponible"));
  assertEquals(CredentialDocument.LEGACY,documentRepository.findById(doc.id()).orElseThrow().scanStatus);
 }
 @Test void aThreatFoundWhileRegularizingRejectsTheDocumentAndReturnsTheOnlySupportingCredentialToReview() throws Exception {
  var view=verifiedWithLegacyDocument();scannerSays(MalwareScanner.Status.INFECTED,"Eicar-Test-Signature");
  var outcome=legacy.regularize(view.documents().get(0).id(),reviewer.getId());
  assertEquals("RECHAZADO",outcome.result());
  var after=credentials.find(view.id());assertEquals("RECHAZADO",after.documents().get(0).scanStatus());assertEquals("PENDIENTE",after.status(),"la verificación que dependía de ese único documento vuelve a revisión");
  assertTrue(credentials.decisions(view.id()).stream().anyMatch(d->"MODIFICACION".equals(d.type())&&d.reason().contains("Revisión requerida")));
 }
 @Test void theOwnerCannotRegularizeTheirOwnDocumentsAndTheReportListsWhoIsAffected() throws Exception {
  var view=verifiedWithLegacyDocument();
  assertEquals("AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA",failure(()->legacy.regularize(view.documents().get(0).id(),holder.getId())).code());
  var report=legacy.report();
  assertTrue(report.legacyDocuments()>=1);assertTrue(report.pendingActive()>=1);assertTrue(report.withoutFingerprint()>=1);assertTrue(report.verifiedCredentialsSupportedOnlyByLegacy()>=1);
  assertTrue(report.credentials().stream().anyMatch(c->c.credentialId().equals(view.id())&&c.username().equals(holder.getUsername())));
  var batch=legacy.regularizePending(500,reviewer.getId());assertTrue(batch.examined()>=1);
  assertEquals("LIMITE_INVALIDO",failure(()->legacy.regularizePending(0,reviewer.getId())).code());
 }
}
