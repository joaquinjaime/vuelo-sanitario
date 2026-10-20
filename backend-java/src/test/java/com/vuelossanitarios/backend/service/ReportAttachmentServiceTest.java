package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;

import com.vuelossanitarios.backend.api.ApiException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.stream.Stream;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.*;

/** Validación y almacenamiento del PDF de un informe: heurísticas de estructura, no un análisis antivirus. */
class ReportAttachmentServiceTest {
 @TempDir Path dir; private ReportAttachmentService service; private DocumentStorage storage;
 @BeforeEach void setUp(){storage=new DocumentStorage(dir.toString(),4096);service=new ReportAttachmentService(storage);}
 @AfterEach void cleanSync(){if(TransactionSynchronizationManager.isSynchronizationActive())TransactionSynchronizationManager.clearSynchronization();}

 private static String pdf(String body){return "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"+body+"\ntrailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n";}
 private static MockMultipartFile file(String name,String type,String content){return new MockMultipartFile("file",name,type,content.getBytes(StandardCharsets.ISO_8859_1));}
 private long files()throws Exception{try(Stream<Path> s=Files.list(dir)){return s.count();}}

 @Test void aValidPdfIsStoredPrivatelyWithARandomKeyHashAndSanitizedDisplayName()throws Exception{
  var stored=service.store(file("../../Informe vuelo <1>.PDF","application/pdf",pdf("")));
  assertTrue(stored.key().matches("[0-9a-f-]{36}\\.pdf"),"la clave no deriva del nombre recibido"); assertEquals("Informe vuelo _1_.PDF",stored.originalName()); assertEquals(64,stored.sha256().length()); assertEquals(stored.size(),Files.size(dir.resolve(stored.key())));
  assertArrayEquals(pdf("").getBytes(StandardCharsets.ISO_8859_1),service.read(stored.key())); assertEquals(1,files());
 }
 @Test void theSameContentAlwaysHasTheSameHashAndDifferentStorageKeys(){
  var a=service.store(file("a.pdf","application/pdf",pdf("A"))); var b=service.store(file("a.pdf","application/pdf",pdf("A")));
  assertEquals(a.sha256(),b.sha256()); assertNotEquals(a.key(),b.key());
 }
 @Test void invalidFilesAreRejectedWithoutLeavingAnythingOnDisk()throws Exception{
  String ok=pdf("");
  assertThrows(ApiException.class,()->service.store(null)); assertThrows(ApiException.class,()->service.store(file("a.pdf","application/pdf","")));
  assertThrows(ApiException.class,()->service.store(file("informe.docx","application/pdf",ok)),"extensión"); assertThrows(ApiException.class,()->service.store(file("informe.pdf.exe","application/pdf",ok)));
  assertThrows(ApiException.class,()->service.store(file("informe.pdf","text/plain",ok)),"tipo declarado"); assertThrows(ApiException.class,()->service.store(file("informe.pdf",null,ok)));
  assertThrows(ApiException.class,()->service.store(file("informe.pdf","application/pdf","MZ"+"x".repeat(100)+"%%EOF")),"no es PDF");
  assertThrows(ApiException.class,()->service.store(file("informe.pdf","application/pdf",ok.replace("%%EOF","fin"))),"sin EOF");
  assertThrows(ApiException.class,()->service.store(file("informe.pdf","application/pdf",pdf("x".repeat(5000)))),"tamaño");
  assertThrows(ApiException.class,()->service.store(file("informe.pdf","application/pdf","%PDF-9.9\n"+"x".repeat(40)+"\n%%EOF")),"versión inexistente");
  assertEquals(0,files());
 }
 @Test void pdfsWithVisibleActiveContentAreRejected(){
  for(String active:new String[]{"<< /S /JavaScript /JS (app.alert(1)) >>","<< /Type /Action /S /Launch /F (cmd.exe) >>","<< /Type /EmbeddedFile >>","<< /Subtype /RichMedia >>","/AA << /JS 5 0 R >>"})
   assertThrows(ApiException.class,()->service.store(file("informe.pdf","application/pdf",pdf(active))),active);
  assertDoesNotThrow(()->service.store(file("informe.pdf","application/pdf",pdf("<< /Type /Annot /Subtype /Link /Dest [3 0 R /Fit] /OpenAction [3 0 R /Fit] >> JSON /Jsx"))),"nombres que sólo empiezan igual no se rechazan");
 }
 @Test void displayNamesNeverCarryPathsControlCharactersOrDoubleDots(){
  assertEquals("passwd.pdf",ReportAttachmentService.safeName("/etc/passwd")); assertEquals("x.pdf",ReportAttachmentService.safeName("C:\\temp\\x.pdf")); assertEquals("a_b.pdf",ReportAttachmentService.safeName("a\u0000b.pdf"));
  assertEquals("informe.pdf",ReportAttachmentService.safeName(null)); assertEquals("informe.pdf",ReportAttachmentService.safeName("")); assertTrue(ReportAttachmentService.safeName("é".repeat(400)+".pdf").length()<=150);
  assertEquals("_hidden.pdf",ReportAttachmentService.safeName(".hidden.pdf")); assertEquals("a.b.pdf",ReportAttachmentService.safeName("a....b.pdf")); assertFalse(ReportAttachmentService.safeName("a\r\nb: c.pdf").contains("\n"));
 }
 @Test void aRolledBackTransactionRemovesTheStoredFileAndACommittedOneKeepsIt()throws Exception{
  TransactionSynchronizationManager.initSynchronization();
  var kept=service.store(file("a.pdf","application/pdf",pdf("1"))); var lost=service.store(file("b.pdf","application/pdf",pdf("2"))); assertEquals(2,files());
  var syncs=TransactionSynchronizationManager.getSynchronizations();
  assertEquals(2,syncs.size()); syncs.get(0).afterCompletion(TransactionSynchronization.STATUS_COMMITTED); syncs.get(1).afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
  assertTrue(Files.exists(dir.resolve(kept.key()))); assertFalse(Files.exists(dir.resolve(lost.key()))); assertEquals(1,files());
 }
 @Test void discardRemovesTheFileExplicitly()throws Exception{var s=service.store(file("a.pdf","application/pdf",pdf("1")));service.discardQuietly(s);service.discardQuietly(null);assertEquals(0,files());}
}
