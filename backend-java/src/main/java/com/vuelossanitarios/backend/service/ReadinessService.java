package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.repository.CredentialDocumentRepository;
import com.vuelossanitarios.backend.repository.CredentialPolicyRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lista de comprobación previa a operar: qué configuraciones obligatorias faltan. No cambia nada ni expone secretos (sólo dice si están presentes).
 * Los elementos obligatorios son los que, de faltar, impiden operar con seguridad (política de suficiencia, almacenamiento, secreto de sesión y, en
 * producción, antivirus con base de firmas acreditada); el resto informa decisiones de negocio o dependencias externas. Mientras falte una política la
 * elegibilidad responde "no configurada", de modo que no pueden asignarse ni iniciarse vuelos con tripulación sin haberla definido.
 */
@Service
public class ReadinessService {
 public record Item(String key,String label,String status,boolean mandatory,String detail){}
 public record Readiness(String environment,boolean readyForOperation,String flywayVersion,List<Item> items,List<String> pendingMandatory,String note){}
 private final CredentialPolicyRepository policies; private final CredentialDocumentRepository documents; private final CredentialDocumentService documentService; private final ObjectProvider<Flyway> flyway; private final ObjectProvider<org.springframework.jdbc.core.JdbcTemplate> jdbc;
 private final String environment,storageDirectory,jwtSecret,mailHost,bootstrapUser,expiryDays; private final boolean mailEnabled,expiryApproved,purgeEnabled;
 public ReadinessService(CredentialPolicyRepository p,CredentialDocumentRepository d,CredentialDocumentService ds,ObjectProvider<Flyway> flyway,ObjectProvider<org.springframework.jdbc.core.JdbcTemplate> jdbc,@Value("${app.environment:desarrollo}") String environment,
   @Value("${app.storage.documents-directory:./data/documents}") String storage,@Value("${app.jwt.secret:}") String jwt,@Value("${app.mail.host:}") String mailHost,@Value("${app.mail.enabled:false}") boolean mailEnabled,
   @Value("${app.bootstrap-admin.username:}") String bootstrapUser,@Value("${app.credential-expiry.notice-days:60,30,7,0}") String expiryDays,@Value("${app.credential-expiry.approved:false}") boolean expiryApproved,
   @Value("${app.retention.credential-documents.purge-enabled:false}") boolean purgeEnabled){
  policies=p;documents=d;documentService=ds;this.flyway=flyway;this.jdbc=jdbc;this.environment=environment.trim().toLowerCase(Locale.ROOT);storageDirectory=storage;jwtSecret=jwt;this.mailHost=mailHost;this.mailEnabled=mailEnabled;this.bootstrapUser=bootstrapUser;this.expiryDays=expiryDays;this.expiryApproved=expiryApproved;this.purgeEnabled=purgeEnabled;
 }
 @Transactional(readOnly=true) public Readiness check(){
  boolean production="produccion".equals(environment);List<Item> items=new ArrayList<>();
  String version="desconocida";Flyway f=flyway.getIfAvailable();
  if(f!=null){
   var current=f.info().current();int pending=f.info().pending().length;version=current==null?"sin migraciones":String.valueOf(current.getVersion());
   items.add(new Item("MIGRACION","Esquema de base de datos",pending==0?"OK":"PENDIENTE",true,"Versión "+version+(pending==0?"":"; migraciones pendientes: "+pending)));
  }else{
   // Con las migraciones automáticas deshabilitadas (producción: sólo las aplica el procedimiento controlado) se lee la versión aplicada del historial.
   var template=jdbc.getIfAvailable();
   if(template!=null)try{version=String.valueOf(template.queryForObject("SELECT TOP 1 version FROM flyway_schema_history WHERE success = 1 ORDER BY installed_rank DESC",String.class));
    items.add(new Item("MIGRACION","Esquema de base de datos","OK",true,"Versión "+version+" (migraciones automáticas deshabilitadas: las aplica el procedimiento controlado)"));}
   catch(RuntimeException e){items.add(new Item("MIGRACION","Esquema de base de datos","ERROR",true,"No se pudo leer la versión aplicada del esquema"));}
  }
  for(String role:List.of("COMANDANTE","COPILOTO","MEDICO","ENFERMERO")){
   int n=policies.findActiveByRole(role).size();
   items.add(new Item("POLITICA_"+role,"Política de suficiencia: "+role,n>0?"OK":"PENDIENTE",true,n>0?n+" política(s) activa(s)":"Sin política activa: nadie puede ser elegible para esta función hasta que se active una (decisión de negocio)"));
  }
  var am=documentService.antimalwareStatus();
  items.add(new Item("ANTIMALWARE","Análisis antimalware de documentos",am.configured()?"OK":"PENDIENTE",production,
   am.configured()?"Motor: "+am.engine()+(am.accreditedDatabaseRequired()?" (base de firmas acreditada)":" (el entorno no exige base completa)"):am.engine()==null?"Sin analizador disponible: los documentos permanecen en cuarentena":"Base de firmas no acreditada: "+am.signatureProblem()+". Los documentos permanecen en cuarentena"));
  long legacyPending=documents.findLegacyPendingKeys().size();
  items.add(new Item("DOCUMENTOS_HEREDADOS","Documentos anteriores a V59 sin analizar",legacyPending==0?"OK":"PENDIENTE",false,legacyPending==0?"Ninguno pendiente":legacyPending+" documento(s) restringidos hasta regularizarlos"));
  Path dir=Paths.get(storageDirectory).toAbsolutePath().normalize();boolean writable=Files.isDirectory(dir)&&Files.isWritable(dir);
  items.add(new Item("ALMACENAMIENTO","Directorio privado de documentos",writable?"OK":"ERROR",true,writable?"Existe y es escribible":"No existe o no es escribible"));
  items.add(new Item("SECRETO_JWT","Secreto de firma de sesiones",jwtSecret.length()>=32?"OK":"ERROR",true,jwtSecret.length()>=32?"Configurado (longitud suficiente)":"Ausente o demasiado corto (mínimo 32 caracteres)"));
  boolean mail=mailEnabled&&!mailHost.isBlank();
  items.add(new Item("CORREO","Servidor de correo saliente",mail?"OK":"PENDIENTE",false,mail?"Configurado":"No configurado: las verificaciones de correo informan 503 MAIL_NOT_CONFIGURED y los correos quedan sin verificar (decisión de infraestructura pendiente)"));
  items.add(new Item("AVISOS_VENCIMIENTO","Avisos de vencimiento de habilitaciones ("+expiryDays+" días)",expiryApproved?"OK":"PROPUESTA",false,expiryApproved?"Plazos aprobados":"Plazos propuestos por defecto, pendientes de aprobación (app.credential-expiry.approved=false)"));
  items.add(new Item("RETENCION","Retención documental",purgeEnabled?"ERROR":"PENDIENTE",false,purgeEnabled?"La purga está habilitada sin una política aprobada: deshabilítela":"Sin purga automática; los plazos de conservación están pendientes de decisión (no se eliminan documentos)"));
  items.add(new Item("ADMIN_INICIAL","Administrador de arranque",bootstrapUser.isBlank()?"OK":"ATENCION",false,bootstrapUser.isBlank()?"Sin credenciales de arranque en el entorno":"BOOTSTRAP_ADMIN_* sigue definido: retírelo del entorno después del primer inicio"));
  List<String> pending=items.stream().filter(i->i.mandatory()&&!"OK".equals(i.status())).map(Item::key).toList();
  return new Readiness(environment,pending.isEmpty(),version,items,pending,"Esta comprobación sólo detecta configuraciones obligatorias ausentes y no sustituye la aprobación de negocio. Un elemento no obligatorio en PENDIENTE es una decisión o dependencia externa documentada.");
 }
}
