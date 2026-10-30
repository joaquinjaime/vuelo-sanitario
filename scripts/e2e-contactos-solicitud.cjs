/* Contactos de coordinación de la solicitud sanitaria (V50/V51): sólo usa SQL Server E2E. Nunca apunta a la base habitual. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { spawnSync }=require('node:child_process');
const { ROOT,BACKEND,DB_NAME,MARK,sleep,sql,one,count,call,ok,createUser,waitHealthy }=require('./e2e-cierre-support.cjs');

const lines=(query)=>sql(query).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const sqlFails=(query)=>{try{sql(query);return false;}catch{return true;}};

(async()=>{
 const info=JSON.parse(spawnSync('docker',['inspect',BACKEND],{encoding:'utf8'}).stdout)[0];
 const env=Object.fromEntries(info.Config.Env.filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
 assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`)&&env.SPRING_PROFILES_ACTIVE.includes('e2e'),'sólo la base aislada');
 assert.equal(one('SELECT DB_NAME()'),DB_NAME);
 assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL'))>=51);
 await waitHealthy();
 const dotenv={};for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){if(line.includes('=')&&!line.trim().startsWith('#')){const i=line.indexOf('=');dotenv[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}}
 const admin=(await ok('/auth/login',{method:'POST',body:{username:dotenv.BOOTSTRAP_ADMIN_USERNAME,password:dotenv.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;

 // ---- A. Esquema y corrección de V49 ----
 const T='contactos_coordinacion_traslado';
 assert.equal(count(`SELECT COUNT(*) FROM sys.tables WHERE name=N'${T}'`),1);
 for(const c of ['ck_contactos_coordinacion_traslado_relacion','ck_contactos_coordinacion_traslado_nombre','ck_contactos_coordinacion_traslado_telefono','ck_contactos_coordinacion_traslado_baja'])assert.equal(count(`SELECT COUNT(*) FROM sys.check_constraints WHERE name=N'${c}'`),1,c);
 assert.equal(count(`SELECT COUNT(*) FROM sys.indexes WHERE name IN (N'uq_contactos_coordinacion_traslado_telefono_vigente',N'uq_contactos_coordinacion_traslado_principal_vigente') AND is_unique=1`),2);
 assert.equal(count(`SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID('${T}')`),3);
 for(const table of ['correos_electronicos','telefonos'])assert.equal(count(`SELECT COUNT(*) FROM (SELECT id_personas FROM ${table} WHERE fecha_baja IS NULL GROUP BY id_personas HAVING SUM(CAST(es_principal AS int))<>1) x`),0,'V50: ninguna persona con contactos vigentes sin principal');

 const dts=await createUser(admin,'DTS','solcontacto'),dts2=await createUser(admin,'DTS','solcontacto2'),ops=await createUser(admin,'CENTRO_OPERACIONES','solcontactoops'),cmd=await createUser(admin,'COMANDANTE','solcontactocmd');
 let province,localities;for(const p of await ok('/catalogs/provinces',{token:dts.token})){const l=await ok(`/catalogs/localities?provinceId=${p.id}`,{token:dts.token});if(l.length>=2){province=p;localities=l;break;}}
 const priority=(await ok('/catalogs/priorities',{token:dts.token}))[0];
 const day=new Date(Date.now()+12*86400000).toISOString().slice(0,10)+'T12:00:00';
 const body=(patient,extra={})=>({...patient,localidadOrigenId:localities[0].id,localidadDestinoId:localities[1].id,priorityCode:priority.codigo,motivoVuelo:'Contactos '+MARK,fechaSolicitada:day,extremaUrgencia:false,medical:{diagnostico:'Dx '+MARK,condicionMedica:'ESTABLE',requiereEquipamientoEspecial:false},...extra});
 const newPatient=(dni)=>({patient:{nombre:'Paciente',apellido:'Coordinado'+MARK,dni},identidadConfirmada:true});
 const rnd=()=>String(70000000+Math.floor(Math.random()*20000000));
 const identity=(userId)=>one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT u.hash_contrasena,u.estado_cuenta,u.esta_activo,u.version_credenciales,p.dni,p.nombre_persona,p.version_identidad,(SELECT STRING_AGG(r.codigo_rol,',') WITHIN GROUP(ORDER BY r.codigo_rol) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=u.id_usuarios) roles FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE u.id_usuarios=${userId} FOR JSON PATH)),2)`);
 const before={dts:identity(dts.id),ops:identity(ops.id)};
 const totals=()=>[count('SELECT COUNT(*) FROM personas'),count('SELECT COUNT(*) FROM pacientes'),count('SELECT COUNT(*) FROM vuelos'),count(`SELECT COUNT(*) FROM ${T}`),count('SELECT COUNT(*) FROM telefonos'),count('SELECT COUNT(*) FROM correos_electronicos')].join('|');
 const rows=(flightId)=>lines(`SELECT CONCAT(id_contactos_coordinacion_traslado,'|',relacion_contacto,'|',ISNULL(nombre_contacto,'-'),'|',telefono_contacto,'|',telefono_normalizado,'|',es_principal,'|',version_contacto,'|',ISNULL(CONVERT(varchar(30),fecha_baja,121),'-'),'|',ISNULL(CAST(id_usuario_baja AS varchar),'-')) FROM ${T} WHERE id_vuelos=${flightId} ORDER BY id_contactos_coordinacion_traslado`);
 const active=(flightId)=>count(`SELECT COUNT(*) FROM ${T} WHERE id_vuelos=${flightId} AND fecha_baja IS NULL`);
 const contactsUrl=(id)=>`/flights/${id}/transfer-contacts`;

 // ---- B. Paciente nuevo + contactos en una sola transacción ----
 const phonesBefore=count('SELECT COUNT(*) FROM telefonos'),emailsBefore=count('SELECT COUNT(*) FROM correos_electronicos');
 const dniB=rnd();
 const flightB=(await ok('/flights/with-patient',{method:'POST',token:dts.token,body:body(newPatient(dniB),{contactos:[{relacion:'PACIENTE',pais:'AR',telefono:'+54 381 555-0101'},{relacion:'FAMILIAR_RESPONSABLE',nombre:'Marta Coordinada',pais:'AR',telefono:'3815550102',observaciones:'Atiende de 8 a 20'}]})})).id;
 const rb=rows(flightB);assert.equal(rb.length,2);
 assert.match(rb[0],/\|PACIENTE\|-\|\+54 381 555-0101\|\+543815550101\|1\|0\|-\|-$/);assert.match(rb[1],/\|FAMILIAR_RESPONSABLE\|Marta Coordinada\|\+54 381 555-0102\|\+543815550102\|0\|0\|-\|-$/);
 assert.equal(count(`SELECT COUNT(*) FROM ${T} c JOIN vuelos_sanitarios s ON s.id_vuelos=c.id_vuelos JOIN pacientes p ON p.id_pacientes=s.id_pacientes JOIN personas x ON x.id_personas=p.id_personas WHERE c.id_vuelos=${flightB} AND x.dni='${dniB}' AND c.id_usuario_alta=${dts.id}`),2,'relacionados con la solicitud, su paciente y el DTS que los registró');
 assert.equal(count('SELECT COUNT(*) FROM telefonos'),phonesBefore,'el teléfono de la solicitud no entra en telefonos');assert.equal(count('SELECT COUNT(*) FROM correos_electronicos'),emailsBefore);
 assert.equal(count(`SELECT COUNT(*) FROM telefonos t JOIN personas p ON p.id_personas=t.id_personas WHERE p.dni='${dniB}'`),0,'la persona nueva no recibió contactos personales');

 // ---- C. Campos desconocidos y validaciones: nada se descarta en silencio, nada queda a medias ----
 const t0=totals();
 const unknownPatientPhone=await call('/flights/with-patient',{method:'POST',token:dts.token,body:body({patient:{nombre:'Pablo',apellido:'Ignorado'+MARK,dni:rnd(),telefono:'3815550301'},identidadConfirmada:true}),expect:[400]});
 assert.equal(unknownPatientPhone.data.error,'Campo no admitido: telefono');
 assert.equal((await call('/flights/with-patient',{method:'POST',token:dts.token,body:body(newPatient(rnd()),{telefonoPaciente:'3815550302'}),expect:[400]})).data.error,'Campo no admitido: telefonoPaciente');
 assert.equal((await call('/flights/with-patient',{method:'POST',token:dts.token,body:body(newPatient(rnd()),{contactos:[{relacion:'PACIENTE',pais:'AR',telefono:'3815550303',whatsapp:true}]}),expect:[400]})).data.error,'Campo no admitido: whatsapp');
 const patientForFlights=(await ok('/patients',{method:'POST',token:dts.token,body:{nombre:'Existente',apellido:'Coordinado'+MARK,dni:rnd()}}));
 const t1=totals();
 await call('/flights',{method:'POST',token:dts.token,body:body({patientId:patientForFlights.id},{telefono:'3815550304'}),expect:[400]});
 for(const invalid of [[{relacion:'PACIENTE',pais:'AR',telefono:'12345'}],[{relacion:'PACIENTE',pais:'AR',telefono:'abc'}],[{relacion:'FAMILIAR_RESPONSABLE',pais:'AR',telefono:'3815550305'}],[{relacion:'VECINO',nombre:'x',pais:'AR',telefono:'3815550305'}],
   [{relacion:'PACIENTE',pais:'AR',telefono:'3815550306'},{relacion:'OTRO',nombre:'Ana',pais:'AR',telefono:'381 555-0306'}],[{relacion:'PACIENTE',pais:'AR',telefono:'3815550306'},{relacion:'PACIENTE',pais:'AR',telefono:'3815550307'}],
   [1,2,3,4].map(n=>({relacion:'OTRO',nombre:'N'+n,pais:'AR',telefono:'381555032'+n}))])
  await call('/flights/with-patient',{method:'POST',token:dts.token,body:body(newPatient(rnd()),{contactos:invalid}),expect:[400]});
 assert.equal(totals(),t1,'los rechazos no dejan personas, pacientes, vuelos ni contactos');
 assert.notEqual(t0,t1,'sólo el paciente de comprobación se creó entre medias');
 // rollback tardío: la identidad ya se registró y falla la creación del vuelo (origen = destino)
 const t2=totals();
 await call('/flights/with-patient',{method:'POST',token:dts.token,body:{...body(newPatient(rnd()),{contactos:[{relacion:'PACIENTE',pais:'AR',telefono:'3815550308'}]}),localidadDestinoId:localities[0].id},expect:[400]});
 assert.equal(totals(),t2,'rollback completo de persona, ficha, vuelo y contactos');
 // y una falla de auditoría tampoco deja contactos huérfanos: contacto aceptado + solicitud completa o nada (el rollback tardío ya lo demuestra); sin contactos sigue siendo válido
 const noContacts=(await ok('/flights/with-patient',{method:'POST',token:dts.token,body:body(newPatient(rnd()))})).id;assert.equal(active(noContacts),0);

 // ---- D. Persona preexistente con cuenta y contactos personales propios ----
 const dniOwner=rnd(),ownerName=MARK+'dueniosol';
 const activation=await ok('/auth/users',{method:'POST',token:admin,body:{nombre:'Dueña',apellido:'Cuenta'+MARK,dni:dniOwner,roles:['DTS'],correos:[{direccion:ownerName+'@example.test'}],telefonos:[{pais: 'AR', numero:'3815550910'}]}});
 await call('/auth/activar-cuenta',{method:'POST',body:{dni:dniOwner,codigo:activation.codigo,username:ownerName,password:require('./e2e-cierre-support.cjs').PASSWORD,confirmacionPassword:require('./e2e-cierre-support.cjs').PASSWORD},expect:[204]});
 const ownerPerson=Number(one(`SELECT id_personas FROM personas WHERE dni='${dniOwner}'`)),ownerUser=Number(one(`SELECT id_usuarios FROM usuarios WHERE id_personas=${ownerPerson}`));
 const personal=()=>one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT (SELECT id_telefonos,numero,es_principal,version_contacto,fecha_baja FROM telefonos WHERE id_personas=${ownerPerson} ORDER BY 1 FOR JSON PATH) t,(SELECT id_correos_electronicos,direccion,es_principal,version_contacto,fecha_baja FROM correos_electronicos WHERE id_personas=${ownerPerson} ORDER BY 1 FOR JSON PATH) c FOR JSON PATH)),2)`);
 const ownerBefore=[personal(),identity(ownerUser)];
 const flightD=(await ok('/flights/with-patient',{method:'POST',token:dts.token,body:body({patient:{nombre:'Dueña',apellido:'Cuenta'+MARK,dni:dniOwner},identidadConfirmada:true},{contactos:[{relacion:'PACIENTE',pais:'AR',telefono:'3815550911'}]})})).id;
 assert.equal(active(flightD),1);assert.equal(count(`SELECT COUNT(*) FROM pacientes WHERE id_personas=${ownerPerson}`),1);
 assert.deepEqual([personal(),identity(ownerUser)],ownerBefore,'ni los contactos personales ni la cuenta de la persona vinculada cambiaron');
 const patientIdOwner=Number(one(`SELECT id_pacientes FROM pacientes WHERE id_personas=${ownerPerson}`));
 const flightE=(await ok('/flights',{method:'POST',token:dts.token,body:body({patientId:patientIdOwner},{contactos:[{relacion:'ESTABLECIMIENTO_ORIGEN',nombre:'Hospital E2E',pais:'AR',telefono:'3815550912'}]})})).id;
 assert.equal(active(flightE),1);assert.equal(active(flightD),1,'cada solicitud conserva su contacto');assert.deepEqual([personal(),identity(ownerUser)],ownerBefore);

 // ---- E. Quién consulta y cómo ----
 const list=await ok(contactsUrl(flightB),{token:ops.token});
 assert.equal(list.disponible,true);assert.equal(list.puedeEditar,false);assert.equal(list.items.length,2);assert.equal(list.items[1].telefono,'+54 381 555-0102');assert.equal(list.items[1].nombre,'Marta Coordinada');
 await ok(contactsUrl(flightB),{token:ops.token});
 const ownList=await ok(contactsUrl(flightB),{token:dts.token});assert.equal(ownList.puedeEditar,true);assert.equal(ownList.items.length,2);
 const views=lines(`SELECT CONCAT(operacion,'|',id_usuario_actor,'|',id_vuelos,'|',valores_nuevos) FROM eventos_auditoria WHERE tipo_entidad=N'TRANSFER_CONTACT' AND operacion=N'VIEW' AND id_vuelos=${flightB}`);
 assert.equal(views.length,2,'cada consulta de Operaciones deja un evento y la del solicitante no');assert.ok(views.every(v=>v===`VIEW|${ops.id}|${flightB}|{"cantidad":2}`));
 for(const [name,user] of [['otro DTS',dts2],['comandante',cmd]])await call(contactsUrl(flightB),{token:user.token,expect:[403]});
 await call(contactsUrl(flightB),{token:admin,expect:[403]});await call(contactsUrl(flightB),{expect:[401]});
 const firstId=Number(one(`SELECT TOP 1 id_contactos_coordinacion_traslado FROM ${T} WHERE id_vuelos=${flightB} ORDER BY 1`));
 const snapshotB=rows(flightB);
 for(const [method,p,b] of [['POST',contactsUrl(flightB),{relacion:'OTRO',nombre:'Intruso',pais:'AR',telefono:'3815550777'}],['PUT',`${contactsUrl(flightB)}/${firstId}`,{relacion:'OTRO',nombre:'Intruso',pais:'AR',telefono:'3815550777',version:0}],['DELETE',`${contactsUrl(flightB)}/${firstId}`],['POST',`${contactsUrl(flightB)}/${firstId}/principal`]])
  for(const [who,user] of [['Operaciones',ops],['otro DTS',dts2],['comandante',cmd],['administrador',{token:admin}]])assert.ok([403].includes((await call(p,{method,token:user.token,body:b,expect:[403]})).status),`${who} no escribe`);
 assert.deepEqual(rows(flightB),snapshotB,'ninguna escritura no autorizada modificó los contactos');
 // identificadores manipulados: contacto de otra solicitud por la ruta de ésta, y vuelo inexistente
 const foreignId=Number(one(`SELECT TOP 1 id_contactos_coordinacion_traslado FROM ${T} WHERE id_vuelos=${flightD}`));
 await call(`${contactsUrl(flightB)}/${foreignId}`,{method:'DELETE',token:dts.token,expect:[404]});await call(`/flights/987654321/transfer-contacts/${firstId}`,{method:'DELETE',token:dts.token,expect:[404]});
 assert.equal(active(flightD),1);assert.deepEqual(rows(flightB),snapshotB);
 // los listados y el detalle general no llevan teléfonos
 for(const p of [`/flights/${flightB}`,'/flights'])for(const user of [ops,dts]){const text=JSON.stringify(await ok(p,{token:user.token}));for(const n of ['3815550101','3815550102','Marta Coordinada','Atiende de 8'])assert.ok(!text.includes(n),`${p} no expone ${n}`);}

 // ---- F. Mantenimiento del solicitante, con SQL real y concurrencia real ----
 const flightF=(await ok('/flights',{method:'POST',token:dts.token,body:body({patientId:patientForFlights.id},{contactos:[{relacion:'PACIENTE',pais:'AR',telefono:'3815550401'}]})})).id;
 const base=contactsUrl(flightF);const one0=Number(one(`SELECT TOP 1 id_contactos_coordinacion_traslado FROM ${T} WHERE id_vuelos=${flightF}`));
 const second=await ok(base,{method:'POST',token:dts.token,body:{relacion:'ESTABLECIMIENTO_DESTINO',nombre:'Hospital Destino',pais:'AR',telefono:'3815550402'}});assert.equal(second.principal,false);
 assert.equal((await call(base,{method:'POST',token:dts.token,body:{relacion:'OTRO',nombre:'Repetido',pais:'AR',telefono:'381-555-0402'},expect:[400]})).data.code,'CONTACT_AMBIGUOUS');
 const edited=await ok(`${base}/${second.id}`,{method:'PUT',token:dts.token,body:{relacion:'ESTABLECIMIENTO_DESTINO',nombre:'Hospital Destino',pais:'AR',telefono:'3815550499',version:0}});assert.equal(edited.version,1);
 assert.equal((await call(`${base}/${second.id}`,{method:'PUT',token:dts.token,body:{relacion:'OTRO',nombre:'x',pais:'AR',telefono:'3815550498',version:0},expect:[409]})).data.code,'CONTACT_VERSION_CONFLICT');
 assert.equal(one(`SELECT telefono_contacto FROM ${T} WHERE id_contactos_coordinacion_traslado=${second.id}`),'+54 381 555-0499');
 await call(`${base}/${second.id}/principal`,{method:'POST',token:dts.token});assert.equal(count(`SELECT COUNT(*) FROM ${T} WHERE id_vuelos=${flightF} AND es_principal=1 AND fecha_baja IS NULL`),1);
 await call(`${base}/${second.id}`,{method:'DELETE',token:dts.token});
 const retired=rows(flightF).find(r=>r.startsWith(`${second.id}|`)).split('|');assert.notEqual(retired[7],'-');assert.equal(retired[8],String(dts.id));assert.equal(retired[5],'0');
 assert.equal(count(`SELECT es_principal FROM ${T} WHERE id_contactos_coordinacion_traslado=${one0}`),1,'se promueve el contacto restante');
 // SQL Server rechaza lo que la aplicación jamás generaría
 assert.ok(sqlFails(`INSERT INTO ${T}(id_vuelos,relacion_contacto,nombre_contacto,telefono_contacto,telefono_normalizado,es_principal,id_usuario_alta,fecha_alta,fecha_actualizacion) VALUES(${flightF},N'OTRO',N'Dup',N'+54 381 555-0401',N'+543815550401',0,${dts.id},SYSUTCDATETIME(),SYSUTCDATETIME())`),'teléfono vigente duplicado');
 assert.ok(sqlFails(`INSERT INTO ${T}(id_vuelos,relacion_contacto,nombre_contacto,telefono_contacto,telefono_normalizado,es_principal,id_usuario_alta,fecha_alta,fecha_actualizacion) VALUES(${flightF},N'OTRO',N'Otro principal',N'3815550450',N'3815550450',1,${dts.id},SYSUTCDATETIME(),SYSUTCDATETIME())`),'dos principales vigentes');
 assert.ok(sqlFails(`INSERT INTO ${T}(id_vuelos,relacion_contacto,nombre_contacto,telefono_contacto,telefono_normalizado,es_principal,id_usuario_alta,fecha_alta,fecha_actualizacion) VALUES(${flightF},N'OTRO',NULL,N'3815550451',N'3815550451',0,${dts.id},SYSUTCDATETIME(),SYSUTCDATETIME())`),'sólo el paciente puede omitir el nombre');
 assert.ok(sqlFails(`INSERT INTO ${T}(id_vuelos,relacion_contacto,nombre_contacto,telefono_contacto,telefono_normalizado,es_principal,id_usuario_alta,fecha_alta,fecha_actualizacion) VALUES(${operationalFlightId()},N'PACIENTE',NULL,N'3815550452',N'3815550452',0,${dts.id},SYSUTCDATETIME(),SYSUTCDATETIME())`),'sólo solicitudes sanitarias');
 function operationalFlightId(){return Number(one(`SELECT TOP 1 v.id_vuelos FROM vuelos v WHERE NOT EXISTS (SELECT 1 FROM vuelos_sanitarios s WHERE s.id_vuelos=v.id_vuelos)`)||0);}
 assert.ok(sqlFails(`UPDATE ${T} SET fecha_baja=SYSUTCDATETIME() WHERE id_contactos_coordinacion_traslado=${one0}`),'la baja exige responsable y motivo');
 // carreras reales
 const same=await Promise.all(Array.from({length:8},()=>call(base,{method:'POST',token:dts.token,body:{relacion:'OTRO',nombre:'Mismo',pais:'AR',telefono:'3815550601'},expect:[200,400,409]})));
 assert.equal(same.filter(x=>x.status===200).length,1);assert.equal(count(`SELECT COUNT(*) FROM ${T} WHERE id_vuelos=${flightF} AND telefono_normalizado='+543815550601' AND fecha_baja IS NULL`),1);
 const distinct=await Promise.all(Array.from({length:6},(_,i)=>call(base,{method:'POST',token:dts.token,body:{relacion:'OTRO',nombre:'N'+i,pais:'AR',telefono:'381555070'+i},expect:[200,409]})));
 assert.equal(active(flightF),3,'nunca más de 3 contactos vigentes');assert.equal(count(`SELECT COUNT(*) FROM ${T} WHERE id_vuelos=${flightF} AND es_principal=1 AND fecha_baja IS NULL`),1);
 assert.ok(distinct.filter(x=>x.status===200).length<=1);

 // ---- G. Coordinación cerrada: se conserva y deja de mostrarse ----
 const reasons=await ok('/catalogs/cancellation-reasons',{token:dts.token});const reason=reasons.find(r=>r.codigo!=='OTRO');
 const flightG=(await ok('/flights',{method:'POST',token:dts.token,body:body({patientId:patientForFlights.id},{contactos:[{relacion:'PACIENTE',pais:'AR',telefono:'3815550801'}]})})).id;
 await ok(`/flights/${flightG}/cancel`,{method:'POST',token:dts.token,body:{motivoCancelacionId:reason.id}});
 for(const user of [ops,dts]){const closed=await ok(contactsUrl(flightG),{token:user.token});assert.equal(closed.disponible,false);assert.equal(closed.items.length,0);assert.ok(closed.motivoNoDisponible);}
 assert.equal((await call(contactsUrl(flightG),{method:'POST',token:dts.token,body:{relacion:'OTRO',nombre:'Tarde',pais:'AR',telefono:'3815550802'},expect:[409]})).data.code,'TRANSFER_CONTACTS_CLOSED');
 assert.equal(active(flightG),1,'el contacto se conserva como historia');
 assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'TRANSFER_CONTACT' AND operacion=N'VIEW' AND id_vuelos=${flightG}`),0,'sin números mostrados no hay consulta que auditar');

 // ---- H. Auditoría ----
 const audit=lines(`SELECT CONCAT(ISNULL(valores_anteriores,''),ISNULL(valores_nuevos,'')) FROM eventos_auditoria WHERE tipo_entidad=N'TRANSFER_CONTACT'`).join('\n');
 for(const secret of ['3815550101','3815550102','3815550499','3815550601','+54 381','Marta','Hospital','Atiende de'])assert.ok(!audit.includes(secret),'la auditoría no guarda datos completos: '+secret);
 const ops_=new Set(lines(`SELECT DISTINCT operacion FROM eventos_auditoria WHERE tipo_entidad=N'TRANSFER_CONTACT'`));for(const o of ['CREATE','UPDATE','REMOVE','SET_PRIMARY','VIEW'])assert.ok(ops_.has(o),'evento '+o);
 assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'TRANSFER_CONTACT' AND operacion=N'CREATE' AND id_vuelos=${flightB} AND id_usuario_actor=${dts.id}`),2);
 const page=await ok('/audit?entityType=TRANSFER_CONTACT&size=50',{token:admin});assert.ok(page.total>=10);assert.ok(JSON.stringify(page).includes('***'));
 for(const user of [dts,ops,cmd])await call('/audit',{token:user.token,expect:[403]});

 // ---- I. Preservación e integridad ----
 assert.equal(identity(dts.id),before.dts);assert.equal(identity(ops.id),before.ops);
 assert.equal(sql(`DBCC CHECKCONSTRAINTS('${T}') WITH NO_INFOMSGS`).replace(/\s/g,''),'');
 assert.equal(count(`SELECT COUNT(*) FROM ${T} c LEFT JOIN vuelos_sanitarios s ON s.id_vuelos=c.id_vuelos WHERE s.id_vuelos IS NULL`),0);
 await ok('/auth/me',{token:dts.token});

 // ---- J. Persistencia tras reiniciar ----
 const listing=await ok(contactsUrl(flightF),{token:dts.token});
 const restart=spawnSync('docker',['restart',BACKEND],{encoding:'utf8'});assert.equal(restart.status,0,restart.stderr);await sleep(3000);await waitHealthy();
 assert.deepEqual(await ok(contactsUrl(flightF),{token:dts.token}),listing);
 console.log('PASS: V50/V51, alta atómica con contactos (paciente nuevo, persona preexistente con cuenta, paciente existente), campos desconocidos y datos ambiguos rechazados, rollback, consulta de Operaciones con auditoría, autorización e identificadores manipulados, mantenimiento con versión y concurrencia real, cierre de la coordinación, preservación de cuentas y persistencia');
})().catch(e=>{console.error(e);process.exitCode=1;});
