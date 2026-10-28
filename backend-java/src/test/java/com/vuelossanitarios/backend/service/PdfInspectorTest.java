package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import com.vuelossanitarios.backend.api.ApiException;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.junit.jupiter.api.Test;

class PdfInspectorTest {
 private final PdfInspector inspector=new PdfInspector();
 static byte[] pdf(java.util.function.Consumer<PDDocument> customize) throws Exception {
  try(PDDocument d=new PDDocument()){d.addPage(new PDPage());customize.accept(d);ByteArrayOutputStream out=new ByteArrayOutputStream();d.save(out);return out.toByteArray();}
 }
 private String codeOf(byte[] bytes){return assertThrows(ApiException.class,()->inspector.inspect(bytes)).code();}

 @Test void acceptsAPlainPdf() throws Exception { assertEquals(1,inspector.inspect(pdf(d->{})).pages()); }
 @Test void rejectsTruncatedOrNonPdfContent(){
  assertEquals("PDF_INVALIDO",codeOf("%PDF-1.4\nesto no es un pdf completo".getBytes(StandardCharsets.ISO_8859_1)));
  assertEquals("PDF_INVALIDO",codeOf(new byte[]{'%','P','D','F','-'}));
 }
 @Test void rejectsDocumentLevelJavaScriptOpenAction() throws Exception {
  byte[] bytes=pdf(d->d.getDocumentCatalog().setOpenAction(new PDActionJavaScript("app.alert('x');")));
  assertEquals("PDF_CONTENIDO_ACTIVO",codeOf(bytes));
 }
 @Test void rejectsJavaScriptHiddenInAnAdditionalAction() throws Exception {
  byte[] bytes=pdf(d->{PDActionJavaScript js=new PDActionJavaScript("app.alert('x');");d.getPage(0).getCOSObject().setItem(COSName.AA,new org.apache.pdfbox.cos.COSDictionary());((org.apache.pdfbox.cos.COSDictionary)d.getPage(0).getCOSObject().getDictionaryObject(COSName.AA)).setItem(COSName.getPDFName("O"),js.getCOSObject());});
  assertEquals("PDF_CONTENIDO_ACTIVO",codeOf(bytes));
 }
 @Test void rejectsEmbeddedFiles() throws Exception {
  byte[] bytes=pdf(d->{var names=new org.apache.pdfbox.pdmodel.PDDocumentNameDictionary(d.getDocumentCatalog());var ef=new org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode();names.setEmbeddedFiles(ef);d.getDocumentCatalog().setNames(names);});
  assertEquals("PDF_CONTENIDO_ACTIVO",codeOf(bytes));
 }
 @Test void rejectsEncryptedPdfs() throws Exception {
  byte[] bytes=pdf(d->{try{StandardProtectionPolicy policy=new StandardProtectionPolicy("owner","user",new AccessPermission());policy.setEncryptionKeyLength(128);d.protect(policy);}catch(Exception e){throw new IllegalStateException(e);}});
  assertEquals("PDF_CIFRADO",codeOf(bytes));
 }
}
