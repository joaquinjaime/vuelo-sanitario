package com.vuelossanitarios.backend.service;

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
 * Los elementos obligatorios son los que, de faltar, impiden operar con seguridad (esquema, almacenamiento, secreto de sesión, privilegios mínimos de la cuenta de
 * la base); el resto informa decisiones de negocio o dependencias externas.
 */
@Service
public class ReadinessService {
 public record Item(String key,String label,String status,boolean mandatory,String detail){}
 public record Readiness(String environment,boolean readyForOperation,String flywayVersion,List<Item> items,List<String> pendingMandatory,String note){}
 private final ObjectProvider<Flyway> flyway; private final ObjectProvider<org.springframework.jdbc.core.JdbcTemplate> jdbc;
 private final String environment,storageDirectory,jwtSecret,mailHost,bootstrapUser; private final boolean mailEnabled;
 public ReadinessService(ObjectProvider<Flyway> flyway,ObjectProvider<org.springframework.jdbc.core.JdbcTemplate> jdbc,@Value("${app.environment:desarrollo}") String environment,
   @Value("${app.storage.documents-directory:./data/documents}") String storage,@Value("${app.jwt.secret:}") String jwt,@Value("${app.mail.host:}") String mailHost,@Value("${app.mail.enabled:false}") boolean mailEnabled,
   @Value("${app.bootstrap-admin.username:}") String bootstrapUser){
  this.flyway=flyway;this.jdbc=jdbc;this.environment=environment.trim().toLowerCase(Locale.ROOT);storageDirectory=storage;jwtSecret=jwt;this.mailHost=mailHost;this.mailEnabled=mailEnabled;this.bootstrapUser=bootstrapUser;
 }
 /**
  * La cuenta con la que opera la aplicación no debe poder alterar el esquema (mínimo privilegio): db_owner/db_ddladmin o permiso para crear tablas la reprueban.
  * Las migraciones las aplica una cuenta distinta (docker/sqlserver/apply-db-permissions.sql). Sólo evalúa SQL Server; con otro motor (pruebas H2) informa que no es verificable.
  */
 private Item databasePrivileges(boolean production){
  var template=jdbc.getIfAvailable();
  if(template==null) return new Item("PRIVILEGIOS_BD","Privilegios de la cuenta de la aplicación","ERROR",production,"No hay acceso JDBC para comprobar los privilegios");
  try{
   var row=template.queryForMap("SELECT CAST(ISNULL(IS_MEMBER('db_owner'),0) AS int) AS owner, CAST(ISNULL(IS_MEMBER('db_ddladmin'),0) AS int) AS ddl, CAST(ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE'),0) AS int) AS create_table, CAST(ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','ALTER ANY USER'),0) AS int) AS alter_user, CAST(ISNULL(HAS_PERMS_BY_NAME('dbo.flyway_schema_history','OBJECT','UPDATE'),0) AS int) AS history_write");
   boolean ownerOrDdl=((Number)row.get("owner")).intValue()==1||((Number)row.get("ddl")).intValue()==1;
   boolean canChangeSchema=((Number)row.get("create_table")).intValue()==1||((Number)row.get("alter_user")).intValue()==1;
   boolean canEditHistory=((Number)row.get("history_write")).intValue()==1;
   if(ownerOrDdl||canChangeSchema) return new Item("PRIVILEGIOS_BD","Privilegios de la cuenta de la aplicación","ERROR",production,"La cuenta de la aplicación puede alterar el esquema (db_owner/db_ddladmin o permiso DDL): aplique docker/sqlserver/apply-db-permissions.sql con la cuenta de migraciones separada");
   if(canEditHistory) return new Item("PRIVILEGIOS_BD","Privilegios de la cuenta de la aplicación","ERROR",production,"La cuenta de la aplicación puede modificar flyway_schema_history: vuelva a aplicar docker/sqlserver/apply-db-permissions.sql después de migrar");
   return new Item("PRIVILEGIOS_BD","Privilegios de la cuenta de la aplicación","OK",production,"Sólo lectura y escritura de datos; sin DDL ni escritura en el historial de migraciones");
  }catch(RuntimeException e){
   return new Item("PRIVILEGIOS_BD","Privilegios de la cuenta de la aplicación","NO_VERIFICABLE",production,"No se pudieron comprobar los privilegios del motor de base de datos actual");
  }
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
  Path dir=Paths.get(storageDirectory).toAbsolutePath().normalize();boolean writable=Files.isDirectory(dir)&&Files.isWritable(dir);
  items.add(new Item("ALMACENAMIENTO","Directorio privado de documentos",writable?"OK":"ERROR",true,writable?"Existe y es escribible":"No existe o no es escribible"));
  items.add(databasePrivileges(production));
  items.add(new Item("SECRETO_JWT","Secreto de firma de sesiones",jwtSecret.length()>=32?"OK":"ERROR",true,jwtSecret.length()>=32?"Configurado (longitud suficiente)":"Ausente o demasiado corto (mínimo 32 caracteres)"));
  boolean mail=mailEnabled&&!mailHost.isBlank();
  items.add(new Item("CORREO","Servidor de correo saliente",mail?"OK":"PENDIENTE",false,mail?"Configurado":"No configurado: las verificaciones de correo informan 503 MAIL_NOT_CONFIGURED y los correos quedan sin verificar (decisión de infraestructura pendiente)"));
  items.add(new Item("ADMIN_INICIAL","Administrador de arranque",bootstrapUser.isBlank()?"OK":"ATENCION",false,bootstrapUser.isBlank()?"Sin credenciales de arranque en el entorno":"BOOTSTRAP_ADMIN_* sigue definido: retírelo del entorno después del primer inicio"));
  List<String> pending=items.stream().filter(i->i.mandatory()&&!"OK".equals(i.status())).map(Item::key).toList();
  return new Readiness(environment,pending.isEmpty(),version,items,pending,"Esta comprobación sólo detecta configuraciones obligatorias ausentes y no sustituye la aprobación de negocio. Un elemento no obligatorio en PENDIENTE es una decisión o dependencia externa documentada.");
 }
}
