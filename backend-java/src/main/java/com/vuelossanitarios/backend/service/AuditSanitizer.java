package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Convierte los valores JSON de un evento en campos planos seguros. Se aplica siempre en el servidor, antes de armar el DTO:
 * descarta lo que el perfil no puede ver (lista blanca del perfil), oculta claves sensibles en cualquier perfil y acota el tamaño.
 */
final class AuditSanitizer {
 private AuditSanitizer(){}
 static final String HIDDEN="[oculto]";
 static final int MAX_FIELDS=60, MAX_TEXT=400, MAX_DEPTH=4;
 /** Claves cuyo contenido nunca se muestra: credenciales, secretos, datos clínicos y almacenamiento interno de archivos. */
 private static final Pattern SENSITIVE=Pattern.compile("(?i).*(pass(word)?|passwd|contrase|token|secret|jwt|hash|clave|apikey|api_key|storage|almacen|diagn|clinic|medic(al|a)?$|paciente|patient|dni|cuil|cuit|temporar|credencial(es)?valor).*");
 /** Clave que se muestra enmascarada parcialmente (se conservan los últimos caracteres para poder identificarla). */
 private static final Set<String> PARTIAL=Set.of("PROFESSIONAL_CREDENTIAL.number");

 record Field(String path,Object value,boolean masked){}
 record Result(List<Field> fields,boolean dropped,boolean unreadable,boolean truncated){
  boolean empty(){return fields.isEmpty();}
  boolean anyMasked(){return fields.stream().anyMatch(Field::masked);}
 }
 static final Result NONE=new Result(List.of(),false,false,false);

 /** @param allowed claves de primer nivel visibles para el perfil; {@code null} = todas (los datos sensibles se ocultan igualmente). */
 static Result flatten(ObjectMapper mapper,String json,String entityType,Set<String> allowed){
  if(json==null||json.isBlank())return NONE;
  JsonNode root;
  try{root=mapper.readTree(json);}catch(Exception e){return new Result(List.of(),false,true,false);}
  if(root==null||root.isNull())return NONE;
  List<Field> out=new ArrayList<>();boolean[] flags=new boolean[2]; // 0 = descartado por perfil, 1 = truncado
  if(root.isObject()){
   root.fields().forEachRemaining(e->{
    if(allowed!=null&&!allowed.contains(e.getKey())){flags[0]=true;return;}
    walk(e.getKey(),e.getValue(),entityType,out,flags,1);
   });
  }else if(allowed==null)walk("valor",root,entityType,out,flags,1);
  else flags[0]=true;
  return new Result(List.copyOf(out),flags[0],false,flags[1]);
 }

 private static void walk(String path,JsonNode node,String entityType,List<Field> out,boolean[] flags,int depth){
  if(out.size()>=MAX_FIELDS){flags[1]=true;return;}
  if(node.isObject()&&depth<MAX_DEPTH){
   if(node.isEmpty())return;
   node.fields().forEachRemaining(e->walk(path+"."+e.getKey(),e.getValue(),entityType,out,flags,depth+1));
   return;
  }
  if(node.isArray()&&node.size()>0&&node.size()<=20&&java.util.stream.StreamSupport.stream(node.spliterator(),false).allMatch(JsonNode::isTextual)){ // listas de textos (p. ej. roles) se muestran separadas por comas
   String joined=String.join(", ",java.util.stream.StreamSupport.stream(node.spliterator(),false).map(JsonNode::asText).toList());
   out.add(isSensitive(path)?new Field(path,HIDDEN,true):new Field(path,joined,false));return;
  }
  Object value=node.isNull()?null:node.isBoolean()?(Object)node.booleanValue():node.isIntegralNumber()?(Object)node.longValue():node.isNumber()?(Object)node.doubleValue():node.isTextual()?node.asText():node.toString();
  boolean boolFlag=value instanceof Boolean;
  if(!boolFlag&&value!=null&&isSensitive(path)){out.add(new Field(path,HIDDEN,true));return;}
  if(PARTIAL.contains(entityType+"."+path)&&value!=null){out.add(new Field(path,partial(String.valueOf(value)),true));return;}
  if(value instanceof String s&&s.length()>MAX_TEXT){value=s.substring(0,MAX_TEXT)+"…";flags[1]=true;}
  out.add(new Field(path,value,false));
 }

 static boolean isSensitive(String path){
  for(String segment:path.split("\\."))if(SENSITIVE.matcher(segment).matches())return true;
  return false;
 }
 private static String partial(String v){return v.length()<=4?"••••":"••••"+v.substring(v.length()-4);}

 static Map<String,Object> asMap(Result r){
  Map<String,Object> m=new LinkedHashMap<>();for(Field f:r.fields())m.put(f.path(),f.value());return m;
 }
}
