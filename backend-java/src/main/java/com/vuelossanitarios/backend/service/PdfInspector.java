package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import java.io.IOException;
import java.util.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.*;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Análisis estructural de un PDF: debe poder interpretarse completo, no estar cifrado ni contener acciones o archivos embebidos.
 * Recorre todos los objetos (incluidos los de flujos de objetos comprimidos) buscando los nombres que habilitan contenido activo.
 * Los mensajes de error no revelan el contenido del archivo.
 */
@Component
public class PdfInspector {
 /** Nombres PDF que habilitan ejecución, apertura automática, envío de datos o archivos embebidos. */
 static final Set<String> ACTIVE_KEYS=Set.of("JS","JavaScript","EF","EmbeddedFile","EmbeddedFiles","RichMedia","XFA");
 static final Set<String> ACTIVE_ACTIONS=Set.of("JavaScript","Launch","SubmitForm","ImportData","GoToE","Movie","Sound","Rendition","RichMedia","FileAttachment","Screen","3D");
 static final int MAX_PAGES=500,MAX_DEPTH=64;
 public record Report(int pages){}
 public Report inspect(byte[] bytes){
  try(PDDocument doc=Loader.loadPDF(bytes)){
   if(doc.isEncrypted())throw reject("PDF_CIFRADO","El PDF está cifrado; cárguelo sin contraseña");
   int pages=doc.getNumberOfPages();if(pages<1)throw reject("PDF_INVALIDO","El PDF no contiene páginas");if(pages>MAX_PAGES)throw reject("PDF_INVALIDO","El PDF excede la cantidad de páginas admitida");
   COSDocument cos=doc.getDocument();Set<Object> seen=Collections.newSetFromMap(new IdentityHashMap<>());
   scan(cos.getTrailer(),seen,0);
   for(COSObjectKey key:new ArrayList<>(cos.getXrefTable().keySet())){COSObject object=cos.getObjectFromPool(key);if(object!=null)scan(object.getObject(),seen,0);}
   return new Report(pages);
  }catch(ApiException e){throw e;}
  catch(org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException e){throw reject("PDF_CIFRADO","El PDF está cifrado; cárguelo sin contraseña");}
  catch(IOException|RuntimeException e){throw reject("PDF_INVALIDO","El archivo no es un PDF válido o está dañado");}
 }
 private void scan(COSBase node,Set<Object> seen,int depth){
  if(node==null)return;if(depth>MAX_DEPTH)throw reject("PDF_INVALIDO","La estructura del PDF es demasiado profunda");
  if(node instanceof COSObject o){scan(o.getObject(),seen,depth);return;}
  if(!(node instanceof COSDictionary)&&!(node instanceof COSArray))return;
  if(!seen.add(node))return;
  if(node instanceof COSDictionary dictionary){
   for(Map.Entry<COSName,COSBase> entry:dictionary.entrySet()){
    String key=entry.getKey().getName();
    if(ACTIVE_KEYS.contains(key))throw reject("PDF_CONTENIDO_ACTIVO","El PDF contiene contenido activo o archivos embebidos y no se acepta");
    COSBase value=entry.getValue();
    if(value instanceof COSName name&&("S".equals(key)||"Subtype".equals(key))&&ACTIVE_ACTIONS.contains(name.getName()))throw reject("PDF_CONTENIDO_ACTIVO","El PDF contiene acciones no admitidas");
    scan(value,seen,depth+1);
   }
  }else for(COSBase item:(COSArray)node)scan(item,seen,depth+1);
 }
 private ApiException reject(String code,String message){return new ApiException(HttpStatus.BAD_REQUEST,code,message,Map.of());}
}
