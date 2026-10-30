/* Verifica V49s+3s+2/ V50 (y V51) sobre una base DESCARTABLE creada y eliminada por este script en el SQL Server E2E:
   datos con la forma anterior a V49, incluidos casos ambiguos. No toca la base aislada de trabajo ni la habitual. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { spawnSync }=require('node:child_process');
const { ROOT,MARK,SQL_CONTAINER,sql }=require('./e2e-cierre-support.cjs');

const probe=`vs_probe_contactos_${MARK}`;
const migration=name=>fs.readFileSync(path.join(ROOT,'backend-java/src/main/resources/db/migration',name),'utf8');
const q=query=>sql(query,probe);
const lines=query=>q(query).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const one=query=>lines(query)[0];

(()=>{
 assert.ok(/e2e/.test(SQL_CONTAINER),'sólo el SQL Server aislado');
 sql(`CREATE DATABASE [${probe}]`,'master');
 try{
  // Forma de las tablas inmediatamente anterior a V49 (nombres posteriores a V24/V28).
  q(`CREATE TABLE dbo.personas(id_personas BIGINT IDENTITY(1,1) PRIMARY KEY, dni NVARCHAR(20) NULL);
CREATE TABLE dbo.usuarios(id_usuarios BIGINT IDENTITY(1,1) PRIMARY KEY);
CREATE TABLE dbo.vuelos_sanitarios(id_vuelos_sanitarios BIGINT IDENTITY(1,1) PRIMARY KEY, id_vuelos BIGINT NOT NULL CONSTRAINT uq_vuelos_sanitarios_id_vuelos UNIQUE);
CREATE TABLE dbo.eventos_auditoria(id_eventos_auditoria BIGINT IDENTITY(1,1) PRIMARY KEY, tipo_entidad NVARCHAR(60) NOT NULL, operacion NVARCHAR(60) NOT NULL, valores_anteriores NVARCHAR(MAX) NULL, valores_nuevos NVARCHAR(MAX) NULL, fecha_ocurrencia DATETIME2 NOT NULL, id_vuelos BIGINT NULL, id_usuario_actor BIGINT NULL, entidad_id BIGINT NULL);
CREATE TABLE dbo.flyway_schema_history(version NVARCHAR(50) NULL);
INSERT INTO dbo.flyway_schema_history(version) VALUES(N'48');
CREATE TABLE dbo.correos_electronicos(id_correos_electronicos BIGINT IDENTITY(1,1) PRIMARY KEY, id_personas BIGINT NOT NULL REFERENCES dbo.personas(id_personas), direccion NVARCHAR(150) NOT NULL, tipo_correo_electronico NVARCHAR(30) NOT NULL DEFAULT N'PERSONAL', es_principal BIT NOT NULL DEFAULT 0, fecha_creacion DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(), fecha_actualizacion DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(), CONSTRAINT ck_correos_electronicos_direccion CHECK (LEN(LTRIM(RTRIM(direccion))) > 2));
CREATE TABLE dbo.telefonos(id_telefonos BIGINT IDENTITY(1,1) PRIMARY KEY, id_personas BIGINT NOT NULL REFERENCES dbo.personas(id_personas), numero NVARCHAR(30) NOT NULL, tipo_telefono NVARCHAR(30) NOT NULL DEFAULT N'PERSONAL', es_principal BIT NOT NULL DEFAULT 0, fecha_creacion DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(), fecha_actualizacion DATETIME2(3) NOT NULL DEFAULT SYSDATETIME(), CONSTRAINT ck_telefonos_numero CHECK (LEN(LTRIM(RTRIM(numero))) > 2));
CREATE UNIQUE INDEX uq_correos_electronicos_principal_por_persona ON dbo.correos_electronicos(id_personas) WHERE es_principal=1;
CREATE UNIQUE INDEX uq_telefonos_principal_por_persona ON dbo.telefonos(id_personas) WHERE es_principal=1;`);
  q(`INSERT INTO dbo.personas(dni) VALUES (N'1'),(N'2'),(N'3'),(N'4'),(N'5'),(N'6'),(N'7'),(N'8'),(N'9');`);   // personas 1..9
  const mail=(p,v,t,main)=>`INSERT INTO dbo.correos_electronicos(id_personas,direccion,tipo_correo_electronico,es_principal) VALUES(${p},N'${v}',N'${t}',${main});`;
  const tel=(p,v,t,main)=>`INSERT INTO dbo.telefonos(id_personas,numero,tipo_telefono,es_principal) VALUES(${p},N'${v}',N'${t}',${main});`;
  q([
   // P1: duplicado con tipos distintos (ambiguo)s+3s+2/ un correo distinto
   mail(1,'Ana@X.com','PERSONAL',1),mail(1,'ana@x.com ','LABORAL',0),mail(1,'otra@x.com','PERSONAL',0),
   // P2: el principal es OTRO valor; el duplicado más antiguo se conserva
   mail(2,'dup@x.com','PERSONAL',0),mail(2,'main@x.com','PERSONAL',1),mail(2,'DUP@x.com','PERSONAL',0),
   // P3: contactos vigentes pero ninguno principal
   mail(3,'uno@x.com','PERSONAL',0),mail(3,'dos@x.com','PERSONAL',0),tel(3,'3815550001','PERSONAL',0),tel(3,'3815550002','PERSONAL',0),
   // P4: el duplicado posterior es el principal: debe conservarse el principal
   mail(4,'a@x.com','PERSONAL',0),mail(4,'A@x.com','PERSONAL',1),
   // P5: teléfonos equivalentes con separadores y uno distinto
   tel(5,'381 555-1234','PERSONAL',1),tel(5,'3815551234','LABORAL',0),tel(5,'+54 381 5551234','PERSONAL',0),
   // P6: valores que se normalizan a vacío
   tel(6,'---','PERSONAL',1),tel(6,'...','PERSONAL',0),
   // P7: formato antiguo inválido: se conserva
   tel(7,'abc123','PERSONAL',1),mail(7,'sin-formato','PERSONAL',1),
   // P9: un único contacto
   mail(9,'solo@x.com','PERSONAL',1),tel(9,'3815559999','PERSONAL',1)
  ].join('\n'));
  const total=table=>Number(one(`SELECT COUNT(*) FROM dbo.${table}`));
  const beforeMail=total('correos_electronicos'),beforeTel=total('telefonos');
  const untouchedHash=table=>one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT id_personas,${table==='telefonos'?'id_telefonos,numero,tipo_telefono':'id_correos_electronicos,direccion,tipo_correo_electronico'},es_principal,fecha_creacion,fecha_actualizacion FROM dbo.${table} WHERE id_personas IN (7,9) ORDER BY 2 FOR JSON PATH)),2)`);
  const hashBefore=[untouchedHash('correos_electronicos'),untouchedHash('telefonos')];

  // Diagnóstico previo (sólo lectura) sobre estos datos: debe anticipar los casos ambiguos y las bajas
  const diag=spawnSync('node',[path.join(ROOT,'scripts/diagnostico-contactos-previo-v49.cjs'),SQL_CONTAINER,probe],{encoding:'utf8'});
  assert.equal(diag.status,0,diag.stderr);
  assert.match(diag.stdout,/SE RETIRA \(DUPLICADO_MIGRACION\)/);assert.match(diag.stdout,/TIPOS_DISTINTOS/);
  assert.match(diag.stdout,/3\. Resumen de bajas previstas\s+3\s+2/,'3 correos y 2 teléfonos a retirar');
  assert.match(diag.stdout,/4\. Personas sin principal/);assert.match(diag.stdout,/5\. Correos con formato dudoso/);
  assert.equal(total('correos_electronicos'),beforeMail,'el diagnóstico no modifica nada');

  q(migration('V49__contactos_personales_baja_logica_y_unicidad.sql'));
  q(migration('V50__correccion_preventiva_contactos_v49.sql'));
  assert.equal(total('correos_electronicos'),beforeMail,'ningún borrado físico de correos');assert.equal(total('telefonos'),beforeTel,'ningún borrado físico de teléfonos');
  const retired=(table)=>Number(one(`SELECT COUNT(*) FROM dbo.${table} WHERE fecha_baja IS NOT NULL`));
  assert.equal(retired('correos_electronicos'),3);assert.equal(retired("telefonos"),2,"P5 retira 1 y P6 retira 1");
  // detalle por persona
  const state=(table,idc,val)=>lines(`SELECT CONCAT(id_personas,'|',${val},'|',es_principal,'|',CASE WHEN fecha_baja IS NULL THEN 'V' ELSE 'B:'+motivo_baja END) FROM dbo.${table} ORDER BY ${idc}`);
  const mails=state('correos_electronicos','id_correos_electronicos','direccion');
  assert.deepEqual(mails,[
   '1|Ana@X.com|1|V','1|ana@x.com |0|B:DUPLICADO_MIGRACION','1|otra@x.com|0|V',
   '2|dup@x.com|0|V','2|main@x.com|1|V','2|DUP@x.com|0|B:DUPLICADO_MIGRACION',
   '3|uno@x.com|1|V','3|dos@x.com|0|V',           // V50 promovió el más antiguo
   '4|a@x.com|0|B:DUPLICADO_MIGRACION','4|A@x.com|1|V',   // se conservó el principal
   '7|sin-formato|1|V','9|solo@x.com|1|V'].map(x=>x.trim()),'correos');
  const phones=state('telefonos','id_telefonos','numero');
  assert.deepEqual(phones,[
   '3|3815550001|1|V','3|3815550002|0|V',
   '5|381 555-1234|1|V','5|3815551234|0|B:DUPLICADO_MIGRACION','5|+54 381 5551234|0|V',
   '6|---|1|V','6|...|0|B:DUPLICADO_MIGRACION','7|abc123|1|V','9|3815559999|1|V'],'teléfonos');
  // coherencia general
  for(const [table,idc] of [['correos_electronicos','id_correos_electronicos'],['telefonos','id_telefonos']]){
   assert.equal(Number(one(`SELECT COUNT(*) FROM (SELECT id_personas FROM dbo.${table} GROUP BY id_personas HAVING SUM(CASE WHEN fecha_baja IS NULL THEN 1 ELSE 0 END)>0 AND SUM(CASE WHEN fecha_baja IS NULL AND es_principal=1 THEN 1 ELSE 0 END)<>1) x`)),0,'cada persona con contactos vigentes tiene un único principal');
   assert.equal(Number(one(`SELECT COUNT(*) FROM dbo.${table} WHERE fecha_baja IS NOT NULL AND (es_principal=1 OR motivo_baja<>N'DUPLICADO_MIGRACION' OR id_usuario_baja IS NOT NULL)`)),0);
  }
  assert.deepEqual([untouchedHash('correos_electronicos'),untouchedHash('telefonos')],hashBefore,'los contactos no involucrados quedan idénticos');
  const events=table=>Number(one(`SELECT COUNT(*) FROM dbo.eventos_auditoria WHERE tipo_entidad=N'${table}' AND operacion=N'REMOVE' AND valores_nuevos LIKE N'%DUPLICADO_MIGRACION%' AND id_usuario_actor IS NULL`));
  assert.equal(events('PERSON_EMAIL'),3);assert.equal(events("PERSON_PHONE"),2,'un evento de auditoría por cada baja de migración');
  // idempotencia de V50
  q(migration('V50__correccion_preventiva_contactos_v49.sql'));
  assert.equal(Number(one(`SELECT COUNT(*) FROM dbo.eventos_auditoria`)),5,'V50 repetida no duplica eventos');
  // las restricciones de V49 rigen sobre el resultado
  assert.throws(()=>q(`INSERT INTO dbo.correos_electronicos(id_personas,direccion,direccion_normalizada,tipo_correo_electronico,es_principal) VALUES(9,N'SOLO@x.com',N'solo@x.com',N'PERSONAL',0)`),'duplicado vigente rechazado');
  // V51 sobre el resultado
  q(migration('V51__contactos_coordinacion_traslado_sanitario.sql'));
  assert.equal(Number(one(`SELECT COUNT(*) FROM sys.tables WHERE name=N'contactos_coordinacion_traslado'`)),1);
  console.log('PASS: V49 y V50 sobre datos ambiguos (sin borrado físico, un principal por persona, bajas auditadas, idempotencia, contactos ajenos intactos), diagnóstico previo de sólo lectura y V51');
 }finally{
  sql(`ALTER DATABASE [${probe}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${probe}]`,'master');
 }
})();
