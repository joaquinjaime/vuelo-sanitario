package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

/**
 * Adjunto PDF de una versión de informe final. Valida extensión, tipo declarado, tamaño y estructura básica,
 * guarda el archivo en el almacenamiento privado (clave aleatoria, nunca el nombre recibido) y garantiza que un
 * rollback no deje archivos huérfanos. NO es un análisis antivirus: las comprobaciones de contenido son
 * heurísticas sobre la estructura visible del archivo y no detectan contenido malicioso comprimido u ofuscado.
 */
@Service public class ReportAttachmentService {
 public record Stored(String key,String originalName,long size,String sha256){}
 /** Nombres PDF con capacidad de ejecución o carga activa; su presencia en claro rechaza el archivo. */
 private static final Pattern ACTIVE_CONTENT=Pattern.compile("/(JavaScript|JS|Launch|EmbeddedFile|RichMedia)(?![A-Za-z0-9])");
 private static final Pattern HEADER=Pattern.compile("^%PDF-1\\.[0-7]");
 private final DocumentStorage storage;
 public ReportAttachmentService(DocumentStorage storage){this.storage=storage;}

 /** Valida y guarda; el archivo se elimina si la transacción en curso no confirma. */
 public Stored store(MultipartFile file){
  byte[] bytes=validate(file);
  String key=storage.storeValidatedPdfBytes(bytes);
  if(TransactionSynchronizationManager.isSynchronizationActive())TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCompletion(int status){if(status!=STATUS_COMMITTED)storage.deleteQuietly(key);}});
  return new Stored(key,safeName(file.getOriginalFilename()),bytes.length,sha256(bytes));
 }

 public byte[] read(String key){return storage.read(key).bytes();}
 public void discardQuietly(Stored stored){if(stored!=null)storage.deleteQuietly(stored.key());}

 byte[] validate(MultipartFile file){
  if(file==null||file.isEmpty())throw bad("Adjunte un archivo PDF");
  if(file.getSize()>storage.maxBytes())throw bad("El PDF supera el tamaño permitido");
  String name=file.getOriginalFilename();
  if(name==null||!name.toLowerCase(Locale.ROOT).endsWith(".pdf"))throw bad("El archivo debe tener extensión .pdf");
  if(file.getContentType()==null||!"application/pdf".equalsIgnoreCase(file.getContentType().trim()))throw bad("El tipo de contenido debe ser application/pdf");
  byte[] bytes;try{bytes=file.getBytes();}catch(IOException e){throw bad("No se pudo leer el archivo");}
  if(bytes.length<32||bytes.length>storage.maxBytes())throw bad("El PDF es demasiado pequeño o supera el tamaño permitido");
  String text=new String(bytes,StandardCharsets.ISO_8859_1);
  if(!HEADER.matcher(text).find())throw bad("El contenido no es un PDF válido");
  if(!text.substring(Math.max(0,text.length()-1024)).contains("%%EOF"))throw bad("El PDF está incompleto o dañado");
  if(ACTIVE_CONTENT.matcher(text).find())throw bad("El PDF contiene contenido activo (scripts, ejecución o archivos incrustados) y no se admite");
  return bytes;
 }

 /** Nombre para mostrar: sin rutas, sin caracteres de control ni separadores; nunca se usa para escribir en disco. */
 static String safeName(String original){
  String n=original==null?"":original;
  int slash=Math.max(n.lastIndexOf('/'),n.lastIndexOf('\\'));if(slash>=0)n=n.substring(slash+1);
  n=n.replaceAll("[^\\p{L}\\p{N} ._()\\-]","_").replaceAll("\\.{2,}",".").trim();
  if(n.startsWith("."))n="_"+n.substring(1);
  if(!n.toLowerCase(Locale.ROOT).endsWith(".pdf"))n=n+".pdf";
  if(n.length()>150)n=n.substring(0,146)+".pdf";
  return n.equals(".pdf")?"informe.pdf":n;
 }
 static String sha256(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 private ApiException bad(String m){return new ApiException(HttpStatus.BAD_REQUEST,m);}
}
