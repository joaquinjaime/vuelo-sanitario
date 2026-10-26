/* Identidad compartida: sólo usa SQL Server E2E. Nunca apunta a la base habitual. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { spawnSync }=require('node:child_process');
const { ROOT,BACKEND,DB_NAME,MARK,PASSWORD,sql,one,count,call,ok,createUser,waitHealthy }=require('./e2e-cierre-support.cjs');

(async()=>{
 const info=JSON.parse(spawnSync('docker',['inspect',BACKEND],{encoding:'utf8'}).stdout)[0];
 const env=Object.fromEntries(info.Config.Env.filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
 assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`)&&env.SPRING_PROFILES_ACTIVE.includes('e2e'));
 assert.equal(one('SELECT DB_NAME()'),DB_NAME);
 assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL'))>=48);
 await waitHealthy();
 const dotenv={};for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){if(line.includes('=')&&!line.trim().startsWith('#')){const i=line.indexOf('=');dotenv[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}}
 const admin=(await ok('/auth/login',{method:'POST',body:{username:dotenv.BOOTSTRAP_ADMIN_USERNAME,password:dotenv.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;
 const dts=await createUser(admin,'DTS','identity'),ops=await createUser(admin,'CENTRO_OPERACIONES','identityops');
 const province=(await ok('/catalogs/provinces',{token:dts.token}))[0];
 const localities=await ok(`/catalogs/localities?provinceId=${province.id}`,{token:dts.token});assert.ok(localities.length>=2);
 const date=new Date(Date.now()+12*86400000).toISOString().slice(0,10)+'T12:00:00';
 const flightBody=(patient,overrides={})=>({patient,identidadConfirmada:true,localidadOrigenId:localities[0].id,localidadDestinoId:localities[1].id,priorityCode:'ALTA',motivoVuelo:'Identidad '+MARK,fechaSolicitada:date,extremaUrgencia:false,medical:{diagnostico:'Control',condicionMedica:'ESTABLE',requiereEquipamientoEspecial:false},...overrides});
 const dniNoUser=String(70000000+Math.floor(Math.random()*20000000));
 const noUserSurname='SinCuenta'+MARK;
 sql(`INSERT INTO personas(nombre_persona,apellido_persona,dni,fecha_nacimiento,fecha_creacion,fecha_actualizacion) VALUES(N'Ana',N'${noUserSurname}','${dniNoUser}','1984-03-04',SYSUTCDATETIME(),SYSUTCDATETIME())`);
 const noUserPerson=Number(one(`SELECT id_personas FROM personas WHERE dni='${dniNoUser}'`));
 assert.equal(count(`SELECT COUNT(*) FROM pacientes WHERE id_personas=${noUserPerson}`),0);

 const dniUser=String(70000000+Math.floor(Math.random()*20000000));
 const username=MARK+'shareduser',userSurname='ConCuenta'+MARK;
 const activation=await ok('/auth/users',{method:'POST',token:admin,body:{nombre:'Beto',apellido:userSurname,dni:dniUser,roles:['DTS'],correos:[{direccion:username+'@example.test'}],telefonos:[{pais: 'AR', numero:'3815551234'}]}});
 await call('/auth/activar-cuenta',{method:'POST',body:{dni:dniUser,codigo:activation.codigo,username,password:PASSWORD,confirmacionPassword:PASSWORD},expect:[204]});
 const userPerson=Number(one(`SELECT id_personas FROM personas WHERE dni='${dniUser}'`));
 const userSnapshot=()=>one(`SELECT CONCAT(nombre_usuario,'|',hash_contrasena,'|',estado_cuenta,'|',CAST(esta_activo AS varchar),'|',CAST(version_credenciales AS varchar),'|',(SELECT STRING_AGG(r.codigo_rol,',') WITHIN GROUP(ORDER BY r.codigo_rol) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=u.id_usuarios)) FROM usuarios u WHERE id_personas=${userPerson}`);
 const beforeUser=userSnapshot();
 const personCount=()=>count(`SELECT COUNT(*) FROM personas WHERE dni IN ('${dniNoUser}','${dniUser}')`);
 assert.equal(personCount(),2);
 const pNoUser={nombre:'ÁNA',apellido:noUserSurname,dni:`${dniNoUser.slice(0,2)}.${dniNoUser.slice(2,5)}.${dniNoUser.slice(5)}`,fechaNacimiento:'1984-03-04'};
 const pUser={nombre:'Beto',apellido:userSurname,dni:dniUser};

 const noAttest1=await call('/flights/with-patient',{method:'POST',token:dts.token,body:flightBody(pNoUser,{identidadConfirmada:false}),expect:[409]});
 const noAttest2=await call('/flights/with-patient',{method:'POST',token:dts.token,body:flightBody(pUser,{identidadConfirmada:false}),expect:[409]});
 const dniProbe=String(70000000+Math.floor(Math.random()*20000000));
 const noAttestNew=await call('/flights/with-patient',{method:'POST',token:dts.token,body:flightBody({nombre:'No',apellido:'Existe',dni:dniProbe},{identidadConfirmada:false}),expect:[409]});
 assert.equal(noAttest1.data.error,noAttest2.data.error,'no revela si hay cuenta');
 assert.equal(noAttest1.data.error,noAttestNew.data.error,'sin cotejo no revela si existe una persona');
 assert.equal(count(`SELECT COUNT(*) FROM personas WHERE dni='${dniProbe}'`),0);
 assert.ok(!JSON.stringify(noAttest2.data).includes(username));
 await call('/flights/with-patient',{method:'POST',token:dts.token,body:flightBody({...pUser,nombre:'Otra'}),expect:[409]});
 await call('/flights/with-patient',{method:'POST',token:dts.token,body:flightBody({...pNoUser,fechaNacimiento:'1990-01-01'}),expect:[409]});
 await call('/flights/with-patient',{method:'POST',token:dts.token,body:flightBody({...pUser,personId:userPerson}),expect:[400]});
 await call('/patients',{method:'POST',token:dts.token,body:{personId:userPerson},expect:[400]});
 await call('/flights/with-patient',{method:'POST',token:ops.token,body:flightBody(pUser),expect:[403]});
 await call('/flights/with-patient',{method:'POST',body:flightBody(pUser),expect:[401]});
 assert.equal(count(`SELECT COUNT(*) FROM pacientes WHERE id_personas IN (${noUserPerson},${userPerson})`),0);

 await call('/flights/with-patient',{method:'POST',token:dts.token,body:flightBody(pNoUser,{localidadDestinoId:localities[0].id}),expect:[400]});
 assert.equal(count(`SELECT COUNT(*) FROM pacientes WHERE id_personas=${noUserPerson}`),0,'rollback de ficha si falla el vuelo');
 const noUserFlight=await ok('/flights/with-patient',{method:'POST',token:dts.token,body:flightBody(pNoUser)});
 const userFlight=await ok('/flights/with-patient',{method:'POST',token:dts.token,body:flightBody(pUser)});
 for(const [person,flight] of [[noUserPerson,noUserFlight],[userPerson,userFlight]]){
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios s JOIN pacientes p ON p.id_pacientes=s.id_pacientes WHERE s.id_vuelos=${flight.id} AND p.id_personas=${person}`),1);
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${flight.id} AND tipo_entidad='PATIENT' AND operacion='LINK_EXISTING_PERSON_WITH_REQUEST' AND valores_nuevos LIKE '%identityAttestedByDts%'`),1);
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${flight.id} AND tipo_entidad='PATIENT' AND (valores_nuevos LIKE '%${dniNoUser}%' OR valores_nuevos LIKE '%${dniUser}%' OR valores_nuevos LIKE '%hash_contrasena%')`),0);
 }
 assert.equal(personCount(),2,'no se duplican personas');
 assert.equal(userSnapshot(),beforeUser,'cuenta, credenciales y roles intactos');
 const patientId=Number(one(`SELECT id_pacientes FROM pacientes WHERE id_personas=${userPerson}`));
 await call('/flights/with-patient',{method:'POST',token:dts.token,body:flightBody(pUser),expect:[409]});
 const reused=await ok('/flights',{method:'POST',token:dts.token,body:{...flightBody(pUser),patient:undefined,identidadConfirmada:undefined,patientId}});
 assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_pacientes=${patientId} AND id_vuelos IN (${userFlight.id},${reused.id})`),2);

 const dniConcurrent=String(70000000+Math.floor(Math.random()*20000000));
 sql(`INSERT INTO personas(nombre_persona,apellido_persona,dni,fecha_creacion,fecha_actualizacion) VALUES(N'Concurrente',N'${MARK}','${dniConcurrent}',SYSUTCDATETIME(),SYSUTCDATETIME())`);
 const concurrent=flightBody({nombre:'Concurrente',apellido:MARK,dni:dniConcurrent});
 const results=await Promise.all([call('/flights/with-patient',{method:'POST',token:dts.token,body:concurrent,expect:[200,409]}),call('/flights/with-patient',{method:'POST',token:dts.token,body:concurrent,expect:[200,409]})]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 assert.equal(count(`SELECT COUNT(*) FROM pacientes p JOIN personas x ON x.id_personas=p.id_personas WHERE x.dni='${dniConcurrent}'`),1);
 console.log('PASS: enlace compartido con/sin cuenta, confirmación, rollback, permisos, ausencia de duplicados, preservación de cuenta y concurrencia');
})().catch(e=>{console.error(e);process.exitCode=1;});
