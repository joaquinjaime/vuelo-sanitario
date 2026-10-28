package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;

/**
 * Ciclo de vida de habilitaciones, documentación y avisos de vencimiento sobre H2 (modo SQL Server). El analizador antimalware se reemplaza aquí
 * únicamente para ejercitar cómo reacciona el sistema a cada resultado; que un archivo real sea detectado lo prueba el E2E contra ClamAV (EICAR).
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:credentiallifecycle;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;LOCK_TIMEOUT=20000",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false","app.storage.documents-directory=target/test-credential-docs",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email=",
  "app.credential-expiry.sweep-initial-ms=3600000","app.antimalware.retry-initial-ms=3600000"
})
class CredentialLifecycleIntegrationTest {
 @Autowired ProfessionalCredentialService credentials; @Autowired CredentialDocumentService documents; @Autowired CredentialPolicyService policies; @Autowired CredentialExpiryNoticeService expiry;
 @Autowired ProfessionalCredentialRepository credentialRepository; @Autowired CredentialDocumentRepository documentRepository; @Autowired CredentialDecisionRepository decisionRepository;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roleRepository; @Autowired UserRoleRepository userRoles; @Autowired CrewRoleRepository crewRoles; @Autowired ProvinceRepository provinces;
 @Autowired NotificationRepository notifications; @Autowired CredentialPolicyRepository policyRepository;
 @MockBean MalwareScanner scanner;

 private static int seq; private static synchronized int next(){return ++seq;}
 private static User admin,reviewer; private User holder;
 private Role role(String code){return roleRepository.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roleRepository.save(r);});}
 private User user(String prefix,String roleCode){
  int n=next();Person p=new Person();p.setNombre(prefix);p.setApellido("T"+n);p.setDni(String.valueOf(70000000+n));persons.save(p);
  User u=new User();u.setUsername(prefix+n);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");users.save(u);userRoles.save(new UserRole(u,role(roleCode)));return users.findById(u.getId()).orElseThrow();
 }
 private static byte[] pdf() throws Exception {int n=next();return PdfInspectorTest.pdf(d->d.getDocumentInformation().setTitle("documento "+n));}
 private static MockMultipartFile file(byte[] bytes){return new MockMultipartFile("file","matricula.pdf","application/pdf",bytes);}
 private void scannerSays(MalwareScanner.Status status,String detail){when(scanner.scan(any())).thenReturn(new MalwareScanner.Result(status,"prueba",detail));}
 private ProfessionalCredentialService.Input input(LocalDate expires){return new ProfessionalCredentialService.Input("MEDICO","Médico","MP-"+next(),"Colegio Médico",LocalDate.now().minusYears(1),expires,false,null,null,null,null);}
 private ProfessionalCredentialService.Decision ok(String why){return new ProfessionalCredentialService.Decision(why,true,false);}
 /** Avisos de vencimiento de una habilitación recibidos por un usuario (la base es compartida entre pruebas y los administradores reciben los avisos de todas). */
 private long notices(User u,Long credentialId){return notifications.findByUserIdOrderByCreatedAtDesc(u.getId(),org.springframework.data.domain.PageRequest.of(0,500)).getContent().stream().filter(n->n.getClaveEvento()!=null&&n.getClaveEvento().startsWith("CRED_EXPIRY:"+credentialId+":")).count();}
 private ApiException failure(org.junit.jupiter.api.function.Executable e){return assertThrows(ApiException.class,e);}

 @BeforeEach void setUp(){
  if(admin==null){
   CrewRole medic=crewRoles.findByCodigo("MEDICO").orElseGet(()->{CrewRole r=new CrewRole();r.setCodigo("MEDICO");r.setNombre("Médico");return crewRoles.save(r);});
   Province p=new Province();p.setCodigoOficial("CR1");p.setNombre("Provincia credenciales");p.setActivo(true);provinces.save(p);
   admin=user("adminA","ADMINISTRADOR");reviewer=user("adminB","ADMINISTRADOR");
  }
  holder=user("titular","ADMINISTRADOR");
  for(CredentialPolicy existing:policyRepository.findActiveByRole("MEDICO"))policies.deactivate(existing.getId(),"preparación de prueba",admin.getId());
  policies.create(new CredentialPolicyService.Input("MEDICO",null,null,"Médico",false,false,null,null,"política de prueba"),admin.getId());
  scannerSays(MalwareScanner.Status.CLEAN,null);
 }
 private ProfessionalCredentialService.View verified(LocalDate expires) throws Exception {
  var created=credentials.create(holder.getId(),input(expires),admin.getId());
  documents.upload(created.id(),file(pdf()),"EVIDENCIA",null,admin.getId());
  return credentials.decide(created.id(),"VERIFICADA",ok("Documentación revisada"),reviewer.getId());
 }

 @Test void fullLifecycleRecordsActorReasonAndEvidenceAtEveryStep() throws Exception {
  var created=credentials.create(holder.getId(),input(LocalDate.now().plusYears(1)),admin.getId());
  assertEquals("PENDIENTE",created.status());assertEquals("SIN_DOCUMENTOS",created.documentStatus());assertFalse(created.eligibility().eligible());
  var uploaded=documents.upload(created.id(),file(pdf()),"EVIDENCIA",null,admin.getId());
  assertEquals("LIMPIO",uploaded.documentStatus());assertEquals(64,uploaded.documents().get(0).sha256().length());assertEquals("LIMPIO",uploaded.documents().get(0).scanStatus());
  var verified=credentials.decide(created.id(),"VERIFICADA",ok("Matrícula y título revisados"),reviewer.getId());
  assertEquals("VERIFICADA",verified.status());assertEquals("VIGENTE",verified.lifecycle());assertTrue(verified.eligibility().eligible());assertEquals(reviewer.getUsername(),verified.verifier());
  var history=credentials.decisions(created.id());
  assertEquals(List.of("VERIFICADA","ANALISIS_DOCUMENTO","DOCUMENTO","REGISTRO"),history.stream().map(ProfessionalCredentialService.DecisionView::type).toList());
  assertEquals("Matrícula y título revisados",history.get(0).reason());assertEquals(reviewer.getUsername(),history.get(0).actor());assertNotNull(history.get(0).at());
  assertNotNull(history.get(1).documentId());
 }
 @Test void theHolderCannotReviewOrRecordExternalChecksOnTheirOwnCredential() throws Exception {
  var created=credentials.create(holder.getId(),input(LocalDate.now().plusYears(1)),admin.getId());documents.upload(created.id(),file(pdf()),"EVIDENCIA",null,admin.getId());
  assertEquals("AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA",failure(()->credentials.decide(created.id(),"VERIFICADA",ok("propia"),holder.getId())).code());
  assertEquals("AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA",failure(()->credentials.recordExternalCheck(created.id(),new ProfessionalCredentialService.ExternalCheckInput("REFEPS_SISA",null,"datos","COINCIDE",null,null),holder.getId())).code());
  var doc=credentialRepository.findById(created.id()).map(c->documentRepository.findByCredentialIdOrderByIdDesc(c.getId()).get(0)).orElseThrow();
  assertEquals("AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA",failure(()->documents.retire(doc.getId(),"retiro propio",holder.getId())).code());
 }
 @Test void aScannerFailureLeavesTheDocumentInQuarantineAndBlocksApprovalUntilARealRescan() throws Exception {
  scannerSays(MalwareScanner.Status.ERROR,"Analizador no disponible");
  var created=credentials.create(holder.getId(),input(LocalDate.now().plusYears(1)),admin.getId());
  var uploaded=documents.upload(created.id(),file(pdf()),"EVIDENCIA",null,admin.getId());
  assertEquals("ERROR_ANALISIS",uploaded.documents().get(0).scanStatus());assertEquals("ERROR_ANALISIS",uploaded.documentStatus());
  assertEquals("DOCUMENTACION_SIN_ANALISIS_COMPLETO",failure(()->credentials.decide(created.id(),"VERIFICADA",ok("intento"),reviewer.getId())).code());
  assertEquals("DOCUMENTO_NO_DISPONIBLE",failure(()->documents.download(uploaded.documents().get(0).id(),admin.getId())).code());
  scannerSays(MalwareScanner.Status.CLEAN,null);
  var rescanned=documents.rescan(uploaded.documents().get(0).id(),admin.getId());
  assertEquals("LIMPIO",rescanned.documents().get(0).scanStatus());
  assertEquals("VERIFICADA",credentials.decide(created.id(),"VERIFICADA",ok("ahora sí"),reviewer.getId()).status());
 }
 @Test void aDetectedThreatRejectsTheDocumentForeverAndItNeverBecomesDownloadable() throws Exception {
  scannerSays(MalwareScanner.Status.INFECTED,"Eicar-Test-Signature");
  var created=credentials.create(holder.getId(),input(LocalDate.now().plusYears(1)),admin.getId());
  var uploaded=documents.upload(created.id(),file(pdf()),"EVIDENCIA",null,admin.getId());var doc=uploaded.documents().get(0);
  assertEquals("RECHAZADO",doc.scanStatus());assertEquals("RECHAZADO",uploaded.documentStatus());
  assertEquals("DOCUMENTACION_NO_LIMPIA",failure(()->credentials.decide(created.id(),"VERIFICADA",ok("intento"),reviewer.getId())).code());
  scannerSays(MalwareScanner.Status.CLEAN,null);
  assertEquals("RECHAZADO",documents.rescan(doc.id(),admin.getId()).documents().get(0).scanStatus());
  assertEquals("DOCUMENTO_NO_DISPONIBLE",failure(()->documents.download(doc.id(),admin.getId())).code());
 }
 @Test void invalidOrActivePdfsAreRejectedBeforeAnythingIsStoredOrScanned() throws Exception {
  var created=credentials.create(holder.getId(),input(LocalDate.now().plusYears(1)),admin.getId());
  assertEquals("PDF_INVALIDO",failure(()->documents.upload(created.id(),file("%PDF-1.4 truncado".getBytes()),"EVIDENCIA",null,admin.getId())).code());
  assertEquals("PDF_INVALIDO",failure(()->documents.upload(created.id(),new MockMultipartFile("file","a.exe","application/pdf",pdf()),"EVIDENCIA",null,admin.getId())).code());
  byte[] active=PdfInspectorTest.pdf(d->d.getDocumentCatalog().setOpenAction(new org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript("app.alert(1)")));
  assertEquals("PDF_CONTENIDO_ACTIVO",failure(()->documents.upload(created.id(),file(active),"EVIDENCIA",null,admin.getId())).code());
  assertEquals("PROPOSITO_INVALIDO",failure(()->documents.upload(created.id(),file(pdf()),"OTRO",null,admin.getId())).code());
  assertTrue(documentRepository.findByCredentialIdOrderByIdDesc(created.id()).isEmpty());
 }
 @Test void theSameFileCannotBeAttachedTwiceToTheSameCredential() throws Exception {
  var created=credentials.create(holder.getId(),input(LocalDate.now().plusYears(1)),admin.getId());byte[] bytes=pdf();
  documents.upload(created.id(),file(bytes),"EVIDENCIA",null,admin.getId());
  assertEquals("DOCUMENTO_DUPLICADO",failure(()->documents.upload(created.id(),file(bytes),"EVIDENCIA",null,admin.getId())).code());
 }
 @Test void replacingEvidenceKeepsEveryVersionAndReopensTheReview() throws Exception {
  var base=verified(LocalDate.now().plusYears(1));var first=base.documents().get(0);
  assertEquals("DOCUMENTO_SUSTENTA_VERIFICACION",failure(()->documents.retire(first.id(),"ya no sirve",admin.getId())).code());
  var replaced=documents.upload(base.id(),file(pdf()),"CORRECCION",first.id(),admin.getId());
  assertEquals("PENDIENTE",replaced.status());assertFalse(replaced.eligibility().eligible());
  var versions=replaced.documents();assertEquals(2,versions.size());
  var v1=versions.stream().filter(d->d.version()==1).findFirst().orElseThrow();var v2=versions.stream().filter(d->d.version()==2).findFirst().orElseThrow();
  assertTrue(v1.retired());assertEquals("Reemplazado por la versión 2",v1.retireReason());assertEquals(first.id(),v2.replacesId());assertFalse(v2.retired());
  assertEquals(first.sha256(),v1.sha256());
 }
 @Test void aRetentionHoldBlocksRetirementAndReplacementUntilItIsReleasedWithAReason() throws Exception {
  var created=credentials.create(holder.getId(),input(LocalDate.now().plusYears(1)),admin.getId());
  var doc=documents.upload(created.id(),file(pdf()),"EVIDENCIA",null,admin.getId()).documents().get(0);
  documents.hold(doc.id(),true,"Auditoría en curso",reviewer.getId());
  assertEquals("DOCUMENTO_BAJO_BLOQUEO_CONSERVACION",failure(()->documents.retire(doc.id(),"retiro",reviewer.getId())).code());
  assertEquals("DOCUMENTO_BAJO_BLOQUEO_CONSERVACION",failure(()->documents.upload(created.id(),file(pdf()),"CORRECCION",doc.id(),admin.getId())).code());
  assertEquals("MOTIVO_REQUERIDO",failure(()->documents.hold(doc.id(),false," ",reviewer.getId())).code());
  documents.hold(doc.id(),false,"Auditoría concluida",reviewer.getId());
  assertTrue(documents.retire(doc.id(),"Documento duplicado en papel",reviewer.getId()).documents().get(0).retired());
  assertEquals(1,documentRepository.findByCredentialIdOrderByIdDesc(created.id()).size());
 }
 @Test void aDataSuppressionRequestProtectsTheEvidenceInsteadOfDeletingIt() throws Exception {
  var created=credentials.create(holder.getId(),input(LocalDate.now().plusYears(1)),admin.getId());documents.upload(created.id(),file(pdf()),"EVIDENCIA",null,admin.getId());
  var after=documents.requestDataAction(created.id(),"SUPRESION","Solicitud del titular",admin.getId());
  assertTrue(after.documents().get(0).retentionHold());assertFalse(after.documents().get(0).retired());
  assertEquals("SOLICITUD_SUPRESION",credentials.decisions(created.id()).get(0).type());
  assertFalse(documents.retention().purgeEnabled());assertFalse(documents.retention().policyApproved());
 }
 @Test void rejectionAndCorrectionRequestsNeedAPendingReviewAndEditingReopensIt() throws Exception {
  var created=credentials.create(holder.getId(),input(LocalDate.now().plusYears(1)),admin.getId());documents.upload(created.id(),file(pdf()),"EVIDENCIA",null,admin.getId());
  var asked=credentials.decide(created.id(),"CORRECCION_SOLICITADA",new ProfessionalCredentialService.Decision("Falta la jurisdicción",false,false),reviewer.getId());
  assertEquals("CORRECCION_SOLICITADA",asked.status());assertEquals("HABILITACION_CORRECCION_PENDIENTE",asked.eligibility().code());
  assertEquals("ESTADO_HABILITACION_INCOMPATIBLE",failure(()->credentials.decide(created.id(),"RECHAZADA",ok("tarde"),reviewer.getId())).code());
  var edited=credentials.update(created.id(),new ProfessionalCredentialService.Input("MEDICO","Médico","MP-CORREGIDO","Colegio Médico",LocalDate.now().minusYears(1),LocalDate.now().plusYears(1),false,null,null,provinces.findAll().get(0).getId(),null),admin.getId());
  assertEquals("PENDIENTE",edited.status());assertEquals("Falta la jurisdicción",credentials.decisions(created.id()).stream().filter(d->d.type().equals("CORRECCION_SOLICITADA")).findFirst().orElseThrow().reason());
  assertEquals("RECHAZADA",credentials.decide(created.id(),"RECHAZADA",ok("No corresponde"),reviewer.getId()).status());
 }
 @Test void revocationIsImmediateAndFinalForTheCredential() throws Exception {
  var base=verified(LocalDate.now().plusYears(1));assertTrue(base.eligibility().eligible());
  var revoked=credentials.decide(base.id(),"REVOCADA",ok("Matrícula suspendida"),reviewer.getId());
  assertEquals("REVOCADA",revoked.status());assertEquals("HABILITACION_REVOCADA",revoked.eligibility().code());
  assertEquals("HABILITACION_REVOCADA_NO_EDITABLE",failure(()->credentials.update(base.id(),input(LocalDate.now().plusYears(1)),admin.getId())).code());
  assertEquals("HABILITACION_REVOCADA_NO_EDITABLE",failure(()->documents.upload(base.id(),file(pdf()),"EVIDENCIA",null,admin.getId())).code());
  assertEquals("ESTADO_HABILITACION_INCOMPATIBLE",failure(()->credentials.decide(base.id(),"VERIFICADA",ok("reintento"),reviewer.getId())).code());
 }
 @Test void aRestrictedCredentialNeedsTheReviewerToAcceptTheRestrictionsExplicitly() throws Exception {
  var in=new ProfessionalCredentialService.Input("MEDICO","Médico","MP-R"+next(),"Colegio",null,LocalDate.now().plusYears(1),false,null,null,null,"Sólo traslados diurnos");
  var created=credentials.create(holder.getId(),in,admin.getId());documents.upload(created.id(),file(pdf()),"EVIDENCIA",null,admin.getId());
  assertEquals("RESTRICCIONES_SIN_CONFIRMAR",failure(()->credentials.decide(created.id(),"VERIFICADA",ok("sin aceptar"),reviewer.getId())).code());
  var verified=credentials.decide(created.id(),"VERIFICADA",new ProfessionalCredentialService.Decision("Restricciones aceptadas",true,true),reviewer.getId());
  assertTrue(verified.eligibility().message().contains("Sólo traslados diurnos"));
 }
 @Test void renewalIsANewPendingCredentialAndTheOldOneIsKept() throws Exception {
  var base=verified(LocalDate.now().plusDays(20));
  var renewal=credentials.renew(base.id(),input(LocalDate.now().plusYears(2)),admin.getId());
  assertEquals("PENDIENTE",renewal.status());assertEquals(base.id(),renewal.renewsId());
  assertEquals("RENOVACION_EN_CURSO",failure(()->credentials.renew(base.id(),input(LocalDate.now().plusYears(3)),admin.getId())).code());
  assertEquals("VERIFICADA",credentials.find(base.id()).status());assertTrue(credentials.find(base.id()).eligibility().eligible());
  documents.upload(renewal.id(),file(pdf()),"RENOVACION",null,admin.getId());
  assertEquals("VERIFICADA",credentials.decide(renewal.id(),"VERIFICADA",ok("Renovación revisada"),reviewer.getId()).status());
  assertEquals(2,credentials.list(holder.getId()).size());
 }
 @Test void expiredCredentialsCannotBeVerifiedNorRenewedIntoThePast() throws Exception {
  var created=credentials.create(holder.getId(),input(LocalDate.now().minusDays(1)),admin.getId());documents.upload(created.id(),file(pdf()),"EVIDENCIA",null,admin.getId());
  assertEquals("HABILITACION_VENCIDA",failure(()->credentials.decide(created.id(),"VERIFICADA",ok("vencida"),reviewer.getId())).code());
 }
 @Test void externalChecksAreRecordedAsManualDeclarationsAndNeverChangeTheAdministrativeStatus() throws Exception {
  var base=verified(LocalDate.now().plusYears(1));
  assertEquals("REVISION_INTERNA_SIN_CONSULTA_EXTERNA",base.validationKind());
  var doc=base.documents().get(0);
  var after=credentials.recordExternalCheck(base.id(),new ProfessionalCredentialService.ExternalCheckInput("REFEPS_SISA",null,"Nombre y matrícula coinciden","COINCIDE","Consulta del día",doc.id()),reviewer.getId());
  assertEquals("VERIFICADA",after.status());assertEquals("REVISION_INTERNA_CON_CONSULTA_EXTERNA_MANUAL",after.validationKind());assertEquals(reviewer.getUsername(),after.externalCheck().responsible());
  assertTrue(after.externalCheck().authorityUrl().contains("buscador-nacional-de-profesionales-de-la-salud"));
  assertEquals("NO_COINCIDE",credentials.recordExternalCheck(base.id(),new ProfessionalCredentialService.ExternalCheckInput("REFEPS_SISA",null,"Matrícula distinta","NO_COINCIDE",null,null),reviewer.getId()).externalCheck().result());
  assertTrue(failure(()->credentials.recordExternalCheck(base.id(),new ProfessionalCredentialService.ExternalCheckInput("ANAC",null,"x","COINCIDE",null,null),reviewer.getId())).getMessage().contains("personal aeronáutico"));
 }
 @Test void deactivatingThePolicyImmediatelyRemovesEligibilityAndDuplicatesAreRejected() throws Exception {
  var base=verified(LocalDate.now().plusYears(1));assertTrue(base.eligibility().eligible());
  assertEquals("POLITICA_DUPLICADA",failure(()->policies.create(new CredentialPolicyService.Input("MEDICO",null,null,"médico",false,false,null,null,null),admin.getId())).code());
  assertEquals("FUENTE_REQUERIDA",failure(()->policies.create(new CredentialPolicyService.Input("ENFERMERO",null,null,"Enfermero",false,false,"FUENTE_OFICIAL_CITADA",null,null),admin.getId())).code());
  Long id=policyRepository.findActiveByRole("MEDICO").get(0).getId();
  assertEquals("MOTIVO_REQUERIDO",failure(()->policies.deactivate(id,"",admin.getId())).code());
  policies.deactivate(id,"Cambio de criterio interno",admin.getId());
  var after=credentials.find(base.id());assertFalse(after.eligibility().eligible());assertEquals("POLITICA_HABILITACION_NO_CONFIGURADA",after.eligibility().code());
  assertEquals("POLITICA_YA_INACTIVA",failure(()->policies.deactivate(id,"otra vez",admin.getId())).code());
 }
 @Test void expiryNoticesAreIssuedOncePerThresholdAndNeverDuplicatedWhenTheJobRunsAgain() throws Exception {
  LocalDate expires=LocalDate.now().plusDays(70);var base=verified(expires);Long id=base.id();
  expiry.runFor(LocalDate.now());                                              // 70 días: todavía no corresponde ningún umbral
  assertEquals(0,notices(holder,id));
  var first=expiry.runFor(expires.minusDays(60));assertTrue(first.notices()>=2);// titular + administradores
  assertEquals(1,notices(holder,id));assertEquals(1,notices(reviewer,id));
  expiry.runFor(expires.minusDays(60));                                        // reejecución: sin duplicados
  expiry.runFor(expires.minusDays(45));                                        // sigue dentro del mismo umbral
  assertEquals(1,notices(holder,id));assertEquals(1,notices(reviewer,id));
  expiry.runFor(expires.minusDays(30));assertEquals(2,notices(holder,id));
  expiry.runFor(expires.minusDays(7));assertEquals(3,notices(holder,id));
  expiry.runFor(expires);assertEquals(4,notices(holder,id));
  expiry.runFor(expires);expiry.runFor(expires.plusDays(1));                  // el aviso del vencimiento ya se emitió
  assertEquals(4,notices(holder,id));assertEquals(4,notices(admin,id));
  assertTrue(notifications.findByUserIdOrderByCreatedAtDesc(holder.getId(),org.springframework.data.domain.PageRequest.of(0,500)).getContent().stream().filter(n->n.getClaveEvento().startsWith("CRED_EXPIRY:"+id+":")).noneMatch(n->n.getMensaje().contains(base.number())),"el aviso al titular no revela el número de matrícula");
 }
 @Test void expiryCatchUpAfterAnOutageEmitsOnlyTheMostUrgentPendingThresholdAndNothingForLongExpiredOnes() throws Exception {
  LocalDate expires=LocalDate.now().plusDays(70);var base=verified(expires);Long id=base.id();
  expiry.runFor(expires.minusDays(5));                                         // el proceso estuvo caído: 60, 30 y 7 se omitieron
  assertEquals(1,notices(holder,id));
  assertTrue(notifications.findByUserIdOrderByCreatedAtDesc(holder.getId(),org.springframework.data.domain.PageRequest.of(0,500)).getContent().stream().anyMatch(n->n.getClaveEvento().startsWith("CRED_EXPIRY:"+id+":")&&n.getMensaje().contains("vence en 5 días")));
  expiry.runFor(expires.plusDays(200));                                        // vencida hace mucho: no se avisa retroactivamente
  assertEquals(1,notices(holder,id));
 }
 @Test void aRenewedCredentialWithAVerifiedSuccessorStopsReceivingExpiryNotices() throws Exception {
  LocalDate expires=LocalDate.now().plusDays(10);var base=verified(expires);
  var renewal=credentials.renew(base.id(),input(LocalDate.now().plusYears(2)),admin.getId());documents.upload(renewal.id(),file(pdf()),"RENOVACION",null,admin.getId());credentials.decide(renewal.id(),"VERIFICADA",ok("ok"),reviewer.getId());
  expiry.runFor(expires.minusDays(3));
  assertEquals(0,notices(holder,base.id()));
 }
 @Test void concurrentRunsDoNotDuplicateNotices() throws Exception {
  LocalDate expires=LocalDate.now().plusDays(3);var base=verified(expires);
  ExecutorService pool=Executors.newFixedThreadPool(4);List<Future<CredentialExpiryNoticeService.Summary>> runs=new ArrayList<>();
  for(int i=0;i<4;i++)runs.add(pool.submit(()->expiry.runFor(expires.minusDays(3))));
  for(var f:runs)f.get(60,TimeUnit.SECONDS);pool.shutdown();
  assertEquals(1,notices(holder,base.id()));assertEquals(1,notices(reviewer,base.id()));
 }
}
