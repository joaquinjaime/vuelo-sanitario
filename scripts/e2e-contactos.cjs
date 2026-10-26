/* Contactos compartidos de la persona (V49): sólo usa SQL Server E2E. Nunca apunta a la base habitual. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { spawnSync }=require('node:child_process');
const { ROOT,BACKEND,DB_NAME,MARK,PASSWORD,sleep,sql,one,count,call,ok,createUser,waitHealthy,confirmEmail }=require('./e2e-cierre-support.cjs');

const sqlFails=(query)=>{try{sql(query);return false;}catch{return true;}};
const lines=(query)=>sql(query).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);

(async()=>{
 const info=JSON.parse(spawnSync('docker',['inspect',BACKEND],{encoding:'utf8'}).stdout)[0];
 const env=Object.fromEntries(info.Config.Env.filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
 assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`)&&env.SPRING_PROFILES_ACTIVE.includes('e2e'),'sólo la base aislada');
 assert.equal(one('SELECT DB_NAME()'),DB_NAME);
 assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL'))>=49);
 await waitHealthy();
 const dotenv={};for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){if(line.includes('=')&&!line.trim().startsWith('#')){const i=line.indexOf('=');dotenv[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}}
 const adminLogin=async()=>(await ok('/auth/login',{method:'POST',body:{username:dotenv.BOOTSTRAP_ADMIN_USERNAME,password:dotenv.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;
 let admin=await adminLogin();

 // ---- A. Esquema V49 y datos anteriores ----
 for(const table of ['correos_electronicos','telefonos']){
  for(const column of ['fecha_baja','id_usuario_baja','motivo_baja','version_contacto'])assert.equal(count(`SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('${table}') AND name='${column}'`),1,`${table}.${column}`);
  assert.equal(count(`SELECT COUNT(*) FROM ${table} WHERE ${table==='telefonos'?'numero_normalizado':'direccion_normalizada'} IS NULL OR version_contacto IS NULL`),0);
 }
 assert.equal(count(`SELECT COUNT(*) FROM sys.indexes WHERE name IN ('uq_correos_electronicos_vigente_por_persona','uq_telefonos_vigente_por_persona') AND is_unique=1 AND filter_definition LIKE '%fecha_baja%IS NULL%'`),2);
 assert.equal(count(`SELECT COUNT(*) FROM sys.check_constraints WHERE name IN ('ck_correos_electronicos_baja','ck_telefonos_baja')`),2);
 assert.equal(count(`SELECT COUNT(*) FROM (SELECT id_personas,direccion_normalizada FROM correos_electronicos WHERE fecha_baja IS NULL GROUP BY id_personas,direccion_normalizada HAVING COUNT(*)>1) x`),0);
 assert.equal(count(`SELECT COUNT(*) FROM (SELECT id_personas FROM telefonos WHERE fecha_baja IS NULL GROUP BY id_personas HAVING SUM(CAST(es_principal AS int))<>1) x`),0,'cada persona con teléfonos vigentes tiene un solo principal');
 assert.equal(count(`SELECT COUNT(*) FROM (SELECT id_personas FROM correos_electronicos WHERE fecha_baja IS NULL GROUP BY id_personas HAVING SUM(CAST(es_principal AS int))<>1) x`),0);

 // ---- usuarios de prueba (persona nueva, una de ellas también paciente) ----
 const ana=await createUser(admin,'DTS','contacto'),ops=await createUser(admin,'CENTRO_OPERACIONES','contactoops'),cmd=await createUser(admin,'COMANDANTE','contactocmd');
 const person=(userId)=>Number(one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${userId}`));
 const anaPerson=person(ana.id),opsPerson=person(ops.id);
 sql(`INSERT INTO pacientes(id_personas,fecha_creacion,fecha_actualizacion) VALUES(${anaPerson},SYSUTCDATETIME(),SYSUTCDATETIME())`);   // la misma persona consta como paciente
 const identity=(userId)=>one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT u.nombre_usuario,u.hash_contrasena,u.estado_cuenta,u.esta_activo,u.version_credenciales,u.debe_cambiar_contrasena,p.dni,p.nombre_persona,p.apellido_persona,p.version_identidad,(SELECT STRING_AGG(r.codigo_rol,',') WITHIN GROUP(ORDER BY r.codigo_rol) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=u.id_usuarios) roles,(SELECT COUNT(*) FROM pacientes x WHERE x.id_personas=p.id_personas) fichas,(SELECT MAX(fecha_actualizacion) FROM pacientes x WHERE x.id_personas=p.id_personas) ficha FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE u.id_usuarios=${userId} FOR JSON PATH)),2)`);
 const anaIdentityBefore=identity(ana.id),opsIdentityBefore=identity(ops.id);
 const flightsBefore=count('SELECT COUNT(*) FROM vuelos'),flightsHash=one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT STRING_AGG(CAST(CONCAT(id_vuelos,'|',id_estados_vuelo) AS varchar(max)),',') WITHIN GROUP(ORDER BY id_vuelos) FROM vuelos)),2)`);

 const contactRows=(table,personId)=>lines(`SELECT CONCAT(id_${table},'|',${table==='telefonos'?'numero':'direccion'},'|',tipo_${table==='telefonos'?'telefono':'correo_electronico'},'|',es_principal,'|',version_contacto,'|',ISNULL(CONVERT(varchar(30),fecha_baja,121),'-'),'|',ISNULL(CAST(id_usuario_baja AS varchar),'-'),'|',ISNULL(motivo_baja,'-')) FROM ${table} WHERE id_personas=${personId} ORDER BY id_${table}`);
 const mainCount=(table,personId)=>count(`SELECT COUNT(*) FROM ${table} WHERE id_personas=${personId} AND es_principal=1 AND fecha_baja IS NULL`);
 const activeCount=(table,personId)=>count(`SELECT COUNT(*) FROM ${table} WHERE id_personas=${personId} AND fecha_baja IS NULL`);
 const me=async(user)=>ok('/auth/me',{token:user.token});

 // ---- B. Flujo del titular: correos ----
 const base=await me(ana);
 assert.equal(base.correos.length,1);assert.equal(base.correos[0].principal,true);assert.equal(base.correos[0].version,0);
 const firstMail=base.correos[0];
 assert.equal(firstMail.verificacion,'SIN_VERIFICAR','el correo cargado por la administración nace sin verificar');
 await confirmEmail(ana,firstMail.id,firstMail.valor);   // el titular lo confirma con el código recibido en la bandeja de pruebas
 assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_correos_electronicos=${firstMail.id} AND fecha_verificacion IS NOT NULL`),1);
 const second=await ok('/auth/me/correos',{method:'POST',token:ana.token,body:{direccion:`Segundo.${MARK}@Example.Test`,tipo:'LABORAL'}});
 assert.equal(second.principal,false);assert.equal(second.tipo,'LABORAL');assert.equal(second.version,0);
 assert.equal(one(`SELECT direccion_normalizada FROM correos_electronicos WHERE id_correos_electronicos=${second.id}`),`segundo.${MARK}@example.test`);
 const dup=await call('/auth/me/correos',{method:'POST',token:ana.token,body:{direccion:` SEGUNDO.${MARK}@example.test `},expect:[409]});assert.equal(dup.data.code,'CONTACT_DUPLICATE');
 for(const bad of ['sin-arroba','a@b','a b@example.test'])await call('/auth/me/correos',{method:'POST',token:ana.token,body:{direccion:bad},expect:[400]});
 await call('/auth/me/correos',{method:'POST',token:ana.token,body:{direccion:'ok@example.test',tipo:'SECRETO'},expect:[400]});
 assert.equal(activeCount('correos_electronicos',anaPerson),2,'sin residuos de intentos inválidos');
 const edited=await ok(`/auth/me/correos/${second.id}`,{method:'PUT',token:ana.token,body:{direccion:`corregido.${MARK}@example.test`,tipo:'PERSONAL',version:0}});
 assert.equal(edited.version,1);
 assert.equal((await call(`/auth/me/correos/${second.id}`,{method:'PUT',token:ana.token,body:{direccion:`pisado.${MARK}@example.test`,tipo:'PERSONAL',version:0},expect:[409]})).data.code,'CONTACT_VERSION_CONFLICT');
 assert.equal(one(`SELECT direccion FROM correos_electronicos WHERE id_correos_electronicos=${second.id}`),`corregido.${MARK}@example.test`);
 assert.equal((await call(`/auth/me/correos/${second.id}`,{method:'PUT',token:ana.token,body:{direccion:firstMail.valor.toUpperCase(),tipo:'PERSONAL',version:1},expect:[409]})).data.code,'CONTACT_DUPLICATE');
 assert.equal((await call(`/auth/me/correos/${second.id}/principal`,{method:'POST',token:ana.token,expect:[409]})).data.code,'EMAIL_NOT_VERIFIED','un correo sin verificar no puede ser el principal');
 await confirmEmail(ana,second.id,`corregido.${MARK}@example.test`);
 await call(`/auth/me/correos/${second.id}/principal`,{method:'POST',token:ana.token});
 assert.equal(mainCount('correos_electronicos',anaPerson),1);assert.equal(count(`SELECT es_principal FROM correos_electronicos WHERE id_correos_electronicos=${second.id}`),1);
 await call(`/auth/me/correos/${second.id}/principal`,{method:'POST',token:ana.token});   // ya era principal: sin efecto
 await call(`/auth/me/correos/${second.id}`,{method:'DELETE',token:ana.token});          // retirar el principal promueve al otro
 assert.equal(mainCount('correos_electronicos',anaPerson),1);assert.equal(count(`SELECT es_principal FROM correos_electronicos WHERE id_correos_electronicos=${firstMail.id}`),1);
 const removedRow=contactRows('correos_electronicos',anaPerson).find(r=>r.startsWith(`${second.id}|`)).split('|');
 assert.equal(removedRow[3],'0');assert.notEqual(removedRow[5],'-');assert.equal(removedRow[6],String(ana.id));assert.equal(removedRow[7],'RETIRO');
 assert.equal((await call(`/auth/me/correos/${firstMail.id}`,{method:'DELETE',token:ana.token,expect:[409]})).data.code,'LAST_CONTACT_REQUIRED');
 await call(`/auth/me/correos/${second.id}`,{method:'DELETE',token:ana.token,expect:[404]});   // ya retirado
 assert.equal((await me(ana)).correos.length,1,'el retirado no aparece');
 const again=await ok('/auth/me/correos',{method:'POST',token:ana.token,body:{direccion:`corregido.${MARK}@example.test`}});   // el mismo valor vuelve como contacto nuevo
 assert.notEqual(again.id,second.id);assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${anaPerson} AND direccion_normalizada='corregido.${MARK}@example.test'`),2,'el retirado se conserva');

 // ---- B2. Teléfonos ----
 const phone0=(await me(ana)).telefonos[0];
 const ph=await ok('/auth/me/telefonos',{method:'POST',token:ana.token,body:{pais:'AR',numero:'+54 (381) 555-0199'}});
 assert.equal(one(`SELECT numero_normalizado FROM telefonos WHERE id_telefonos=${ph.id}`),'+543815550199');
 assert.equal((await call('/auth/me/telefonos',{method:'POST',token:ana.token,body:{pais:'AR',numero:'+543815550199'},expect:[409]})).data.code,'CONTACT_DUPLICATE');
 for(const bad of ['12345','abc','38155512ab','1234567890123456'])await call('/auth/me/telefonos',{method:'POST',token:ana.token,body:{pais:'AR',numero:bad},expect:[400]});
 await ok(`/auth/me/telefonos/${ph.id}`,{method:'PUT',token:ana.token,body:{pais:'AR',numero:'3815550200',tipo:'LABORAL',version:0}});
 await call(`/auth/me/telefonos/${ph.id}/principal`,{method:'POST',token:ana.token});
 assert.equal(mainCount('telefonos',anaPerson),1);
 await call(`/auth/me/telefonos/${ph.id}`,{method:'DELETE',token:ana.token});
 assert.equal(count(`SELECT es_principal FROM telefonos WHERE id_telefonos=${phone0.id}`),1,'se promueve el teléfono restante');
 assert.equal((await call(`/auth/me/telefonos/${phone0.id}`,{method:'DELETE',token:ana.token,expect:[409]})).data.code,'LAST_CONTACT_REQUIRED');
 // un teléfono puede compartirse entre personas (ya ocurre con el de prueba) y la respuesta no revela si otro ya lo usa
 assert.ok(count(`SELECT COUNT(DISTINCT id_personas) FROM telefonos WHERE numero_normalizado=N'+543815551234' AND fecha_baja IS NULL`)>=2);
 const shared=await call('/auth/me/telefonos',{method:'POST',token:ops.token,body:{pais:'AR',numero:'3815550200'},expect:[200]});assert.equal(shared.data.principal,false);   // número que otra persona retiró

 // ---- C. SQL Server rechaza lo que la aplicación jamás generaría ----
 const dupRow=lines(`SELECT TOP 1 id_correos_electronicos FROM correos_electronicos WHERE id_personas=${anaPerson} AND fecha_baja IS NULL`)[0];
 assert.ok(sqlFails(`INSERT INTO correos_electronicos(id_personas,direccion,direccion_normalizada,tipo_correo_electronico,es_principal,fecha_creacion,fecha_actualizacion) SELECT id_personas,direccion,direccion_normalizada,tipo_correo_electronico,0,SYSDATETIME(),SYSDATETIME() FROM correos_electronicos WHERE id_correos_electronicos=${dupRow}`),'el índice único rechaza un duplicado vigente');
 assert.ok(sqlFails(`UPDATE correos_electronicos SET fecha_baja=SYSUTCDATETIME() WHERE id_correos_electronicos=${dupRow}`),'la baja exige responsable y motivo');
 assert.ok(sqlFails(`UPDATE telefonos SET fecha_baja=SYSUTCDATETIME(),motivo_baja=N'RETIRO',id_usuario_baja=${ana.id} WHERE id_telefonos=${phone0.id}`),'una baja no puede conservar el principal');
 assert.ok(sqlFails(`UPDATE telefonos SET motivo_baja=N'INVENTADO' WHERE id_telefonos=${phone0.id}`));

 // ---- D. Concurrencia real ----
 const concurrentMail=`concurrente.${MARK}@example.test`;
 const adds=await Promise.all(Array.from({length:8},()=>call('/auth/me/correos',{method:'POST',token:ana.token,body:{direccion:concurrentMail},expect:[200,409]})));
 assert.equal(adds.filter(x=>x.status===200).length,1);assert.equal(adds.filter(x=>x.status===409).length,7);
 assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${anaPerson} AND direccion_normalizada='${concurrentMail}' AND fecha_baja IS NULL`),1);
 const target=adds.find(x=>x.status===200).data;
 const edits=await Promise.all(Array.from({length:6},(_,i)=>call(`/auth/me/correos/${target.id}`,{method:'PUT',token:ana.token,body:{direccion:`edit${i}.${MARK}@example.test`,tipo:'PERSONAL',version:target.version},expect:[200,409]})));
 assert.equal(edits.filter(x=>x.status===200).length,1,'una sola edición por versión');assert.equal(edits.filter(x=>x.status===409).length,5);
 assert.equal(count(`SELECT version_contacto FROM correos_electronicos WHERE id_correos_electronicos=${target.id}`),target.version+1);
 // dos retiros simultáneos con sólo dos contactos vigentes: uno prospera y siempre queda uno
 const winner=edits.find(x=>x.status===200).data;
 await confirmEmail(ana,winner.id,winner.valor);   // para retirar el correo verificado antes hay que confirmar otro
 await call(`/auth/me/correos/${firstMail.id}`,{method:'DELETE',token:ana.token});   // quedan dos
 const pair=lines(`SELECT id_correos_electronicos FROM correos_electronicos WHERE id_personas=${anaPerson} AND fecha_baja IS NULL ORDER BY id_correos_electronicos`).map(Number);
 assert.equal(pair.length,2);
 const removes=await Promise.all(pair.map(id=>call(`/auth/me/correos/${id}`,{method:'DELETE',token:ana.token,expect:[200,409]})));
 assert.deepEqual(removes.map(x=>x.status).sort(),[200,409]);assert.equal(activeCount('correos_electronicos',anaPerson),1);assert.equal(mainCount('correos_electronicos',anaPerson),1);
 // cambios simultáneos de principal
 const extra=[];for(let i=0;i<3;i++){const added=await ok('/auth/me/correos',{method:'POST',token:ana.token,body:{direccion:`principal${i}.${MARK}@example.test`}});await confirmEmail(ana,added.id,`principal${i}.${MARK}@example.test`);extra.push(added.id);}
 await Promise.all(extra.map(id=>call(`/auth/me/correos/${id}/principal`,{method:'POST',token:ana.token})));
 assert.equal(mainCount('correos_electronicos',anaPerson),1,'un único principal tras cambios simultáneos');

 // ---- E. Autorización: ninguna otra persona, ni siquiera un administrador ----
 const owner=(await me(ops)),opsMail=owner.correos[0],opsPhone=owner.telefonos[0];
 const opsBefore=[contactRows('correos_electronicos',opsPerson),contactRows('telefonos',opsPerson)];
 for(const [name,actor] of [['DTS',ana.token],['COMANDANTE',cmd.token],['ADMINISTRADOR',admin]]){
  for(const [m,p,b] of [['PUT',`/auth/me/correos/${opsMail.id}`,{direccion:'robado@example.test',tipo:'PERSONAL',version:0}],['DELETE',`/auth/me/correos/${opsMail.id}`],['POST',`/auth/me/correos/${opsMail.id}/principal`],['PUT',`/auth/me/telefonos/${opsPhone.id}`,{pais:'AR',numero:'3815559999',tipo:'PERSONAL',version:0}],['DELETE',`/auth/me/telefonos/${opsPhone.id}`],['POST',`/auth/me/telefonos/${opsPhone.id}/principal`]])
   assert.equal((await call(p,{method:m,token:actor,body:b,expect:[404]})).status,404,`${name} ${m} ${p}`);
 }
 const foreign=await call(`/auth/me/correos/${opsMail.id}`,{method:'DELETE',token:ana.token,expect:[404]}),missing=await call('/auth/me/correos/987654321',{method:'DELETE',token:ana.token,expect:[404]});
 assert.deepEqual(foreign.data,missing.data,'ajeno e inexistente son indistinguibles');
 await call('/auth/me/correos',{method:'POST',body:{direccion:'anonimo@example.test'},expect:[401]});
 assert.deepEqual([contactRows('correos_electronicos',opsPerson),contactRows('telefonos',opsPerson)],opsBefore,'los contactos de otra persona no cambiaron');
 // el administrador gestiona los suyos y sólo los suyos
 const adminMe=await me({token:admin});const adminPersonId=person(adminMe.id);
 const adminMail=await ok('/auth/me/correos',{method:'POST',token:admin,body:{direccion:`admin.${MARK}@example.test`}});await call(`/auth/me/correos/${adminMail.id}`,{method:'DELETE',token:admin});
 assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${adminPersonId} AND id_correos_electronicos=${adminMail.id} AND fecha_baja IS NOT NULL`),1);

 // ---- F. Alta administrativa con las mismas reglas ----
 const personsBefore=count('SELECT COUNT(*) FROM personas'),dniNew=String(70000000+Math.floor(Math.random()*20000000));
 await call('/auth/users',{method:'POST',token:admin,body:{nombre:'Mala',apellido:MARK,dni:dniNew,roles:['DTS'],correos:[{direccion:`mala.${MARK}@example.test`}],telefonos:[{pais: 'AR', numero:'abc123'}]},expect:[400]});
 assert.equal(count('SELECT COUNT(*) FROM personas'),personsBefore,'una alta rechazada no deja persona');
 const dniOk=String(70000000+Math.floor(Math.random()*20000000));
 await ok('/auth/users',{method:'POST',token:admin,body:{nombre:'Dedup',apellido:MARK,dni:dniOk,roles:['DTS'],correos:[{direccion:`Dedup.${MARK}@Example.test`},{direccion:`dedup.${MARK}@example.test`}],telefonos:[{pais: 'AR', numero:'381 555-0100'},{pais: 'AR', numero:'3815550100'}]}});
 const dedupPerson=Number(one(`SELECT id_personas FROM personas WHERE dni='${dniOk}'`));
 assert.equal(activeCount('correos_electronicos',dedupPerson),1);assert.equal(activeCount('telefonos',dedupPerson),1);

 // ---- G. Auditoría ----
 const eventRows=lines(`SELECT CONCAT(tipo_entidad,'|',operacion,'|',id_usuario_actor,'|',ISNULL(CAST(id_vuelos AS varchar),'-'),'|',entidad_id) FROM eventos_auditoria WHERE tipo_entidad IN (N'PERSON_EMAIL',N'PERSON_PHONE') AND id_usuario_actor=${ana.id} ORDER BY id_eventos_auditoria`);
 const ops_=new Set(eventRows.map(r=>r.split('|').slice(0,2).join(':')));
 for(const k of ['PERSON_EMAIL:CREATE','PERSON_EMAIL:UPDATE','PERSON_EMAIL:REMOVE','PERSON_EMAIL:SET_PRIMARY','PERSON_PHONE:CREATE','PERSON_PHONE:UPDATE','PERSON_PHONE:REMOVE','PERSON_PHONE:SET_PRIMARY'])assert.ok(ops_.has(k),'evento '+k);
 assert.ok(eventRows.every(r=>r.split('|')[3]==='-'),'los eventos de contacto no pertenecen a un vuelo');
 assert.equal(eventRows.filter(r=>r.startsWith(`PERSON_EMAIL|SET_PRIMARY|`)).length>=2,true);
 const allValues=lines(`SELECT CONCAT(ISNULL(valores_anteriores,''),ISNULL(valores_nuevos,'')) FROM eventos_auditoria WHERE tipo_entidad IN (N'PERSON_EMAIL',N'PERSON_PHONE')`).join('\n');
 for(const secret of [MARK.toLowerCase()+'@','corregido.'+MARK,concurrentMail,'3815550199','3815550200',base.correos[0].valor,'$2a$','hash','password'])assert.ok(!allValues.toLowerCase().includes(secret.toLowerCase()),'la auditoría no guarda el valor completo: '+secret);
 const page=await ok('/audit?entityType=PERSON_EMAIL&size=50',{token:admin});
 assert.ok(page.total>=4);assert.ok(page.items.every(e=>e.entityType==='PERSON_EMAIL'));
 const created=page.items.find(e=>e.operation==='CREATE');assert.ok(created,'consulta administrativa de la auditoría');
 assert.ok(JSON.stringify(page).includes('***'),'valores parcialmente ocultos');
 for(const user of [ana,ops,cmd])await call('/audit',{token:user.token,expect:[403]});
 // consistencia: cada cambio efectivo dejó exactamente un evento
 assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'PERSON_EMAIL' AND operacion=N'CREATE' AND id_usuario_actor=${ana.id}`),count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${anaPerson} AND id_correos_electronicos>${firstMail.id}`),'un evento CREATE por cada correo agregado');

 // ---- H. Preservación de cuentas, vuelos e integridad ----
 assert.equal(identity(ana.id),anaIdentityBefore,'credenciales, roles, identidad y ficha de paciente intactos');
 assert.equal(identity(ops.id),opsIdentityBefore);
 assert.equal(count('SELECT COUNT(*) FROM vuelos'),flightsBefore);
 assert.equal(one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT STRING_AGG(CAST(CONCAT(id_vuelos,'|',id_estados_vuelo) AS varchar(max)),',') WITHIN GROUP(ORDER BY id_vuelos) FROM vuelos)),2)`),flightsHash,'los vuelos no se alteraron');
 await ok('/auth/me',{token:ana.token});   // la sesión sigue vigente: no cambió la versión de credenciales
 assert.equal(sql(`DBCC CHECKCONSTRAINTS('correos_electronicos') WITH NO_INFOMSGS`).replace(/\s/g,''),'','sin violaciones referenciales/constraints en correos');
 assert.equal(sql(`DBCC CHECKCONSTRAINTS('telefonos') WITH NO_INFOMSGS`).replace(/\s/g,''),'');
 assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos c LEFT JOIN personas p ON p.id_personas=c.id_personas WHERE p.id_personas IS NULL`),0);

 // ---- I. Persistencia tras reiniciar ----
 const listing=await me(ana);
 const restart=spawnSync('docker',['restart',BACKEND],{encoding:'utf8'});assert.equal(restart.status,0,restart.stderr);await sleep(3000);await waitHealthy();
 const after=await ok('/auth/me',{token:ana.token});
 assert.deepEqual(after.correos,listing.correos);assert.deepEqual(after.telefonos,listing.telefonos);
 console.log('PASS: V49, flujo del titular (correos y teléfonos), baja lógica, duplicados, versión, principal único, índices SQL, concurrencia real, aislamiento entre personas, alta administrativa, auditoría enmascarada, preservación de cuentas/vuelos y persistencia');
})().catch(e=>{console.error(e);process.exitCode=1;});
