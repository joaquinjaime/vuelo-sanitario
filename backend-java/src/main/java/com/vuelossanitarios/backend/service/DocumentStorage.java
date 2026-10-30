package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.io.*;import java.nio.file.*;import java.util.UUID;
@Service public class DocumentStorage {
 private final Path root; private final long max;
 public DocumentStorage(@Value("${app.storage.documents-directory}") String directory,@Value("${app.storage.max-pdf-bytes}") long max){root=Paths.get(directory).toAbsolutePath().normalize();this.max=max;}
 public String storePdf(MultipartFile file){
  if(file==null||file.isEmpty()||file.getSize()>max||!isPdfContentType(file.getContentType())||!hasPdfExtension(file.getOriginalFilename()))throw new ApiException(HttpStatus.BAD_REQUEST,"Se requiere un archivo PDF válido dentro del tamaño permitido");
  try{byte[] bytes=file.getBytes();if(bytes.length<5||bytes[0]!='%'||bytes[1]!='P'||bytes[2]!='D'||bytes[3]!='F'||bytes[4]!='-')throw new ApiException(HttpStatus.BAD_REQUEST,"El contenido no es un PDF");Files.createDirectories(root);String key=UUID.randomUUID()+".pdf";Path target=root.resolve(key).normalize();if(!target.getParent().equals(root))throw new IllegalStateException("Ubicación de almacenamiento inválida");Path temporary=Files.createTempFile(root,"upload-",".tmp");try{Files.write(temporary,bytes,StandardOpenOption.TRUNCATE_EXISTING);Files.move(temporary,target,StandardCopyOption.ATOMIC_MOVE);return key;}finally{Files.deleteIfExists(temporary);}}catch(IOException e){throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,"No se pudo guardar el documento");}}
 private boolean isPdfContentType(String value){return value!=null&&value.trim().equalsIgnoreCase("application/pdf");}
 private boolean hasPdfExtension(String value){return value!=null&&value.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf");}
 /** Valida tamaño, tipo declarado, extensión y cabecera de la subida y devuelve sus bytes, sin escribir nada. */
 public byte[] validatedPdfBytes(MultipartFile file){
  if(file==null||file.isEmpty()||file.getSize()>max||!isPdfContentType(file.getContentType())||!hasPdfExtension(file.getOriginalFilename()))throw new ApiException(HttpStatus.BAD_REQUEST,"PDF_INVALIDO","Se requiere un archivo PDF válido dentro del tamaño permitido",java.util.Map.of());
  try{byte[] bytes=file.getBytes();if(bytes.length<5||bytes[0]!='%'||bytes[1]!='P'||bytes[2]!='D'||bytes[3]!='F'||bytes[4]!='-')throw new ApiException(HttpStatus.BAD_REQUEST,"PDF_INVALIDO","El contenido no es un PDF",java.util.Map.of());return bytes;}catch(IOException e){throw new ApiException(HttpStatus.BAD_REQUEST,"PDF_INVALIDO","No se pudo leer el archivo",java.util.Map.of());}
 }
 /** Almacena bytes ya validados por el llamador (p. ej. adjuntos de informes) con clave aleatoria en el directorio privado. */
 public String storeValidatedPdfBytes(byte[] bytes){
  try{Files.createDirectories(root);String key=UUID.randomUUID()+".pdf";Path target=root.resolve(key).normalize();if(!target.getParent().equals(root))throw new IllegalStateException("Ubicación de almacenamiento inválida");Path temporary=Files.createTempFile(root,"upload-",".tmp");try{Files.write(temporary,bytes,StandardOpenOption.TRUNCATE_EXISTING);Files.move(temporary,target,StandardCopyOption.ATOMIC_MOVE);return key;}finally{Files.deleteIfExists(temporary);}}catch(IOException e){throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,"No se pudo guardar el documento");}}
 public long maxBytes(){return max;}
 public boolean exists(String key){try{Path path=root.resolve(key).normalize();return path.getParent().equals(root)&&Files.isRegularFile(path);}catch(RuntimeException e){return false;}}
 public ResourceData read(String key){try{Path path=root.resolve(key).normalize();if(!path.getParent().equals(root)||!Files.isRegularFile(path))throw new ApiException(HttpStatus.NOT_FOUND,"Archivo inexistente");return new ResourceData(Files.readAllBytes(path));}catch(IOException e){throw new ApiException(HttpStatus.NOT_FOUND,"Archivo inexistente");}}
 public void deleteQuietly(String key){if(key==null)return;try{Path p=root.resolve(key).normalize();if(p.getParent().equals(root))Files.deleteIfExists(p);}catch(IOException ignored){}}
 public record ResourceData(byte[] bytes){}
}
