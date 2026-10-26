/* I-3: API y SQL Server del stack aislado. Conserva los registros de prueba para auditoría. */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const {ROOT,BASE,BACKEND,DB_NAME,MARK,PDF,sql,one,count,call,ok,fmt,futureSlot,createUser,provision,waitHealthy,approveRoute}=require('./e2e-cierre-support.cjs');
let passed=0;const pass=m=>{passed++;console.log('PASS: '+m);};
async function qualified(admin,user,role,expires=null){
 await call(`/crew-qualifications/${user.id}/${role}`,{method:'PUT',token:admin,expect:[204]});
 const c=await ok(`/users/${user.id}/professional-credentials`,{method:'POST',token:admin,body:{roleCode:role,type:'Documento E2E',number:`I3-${MARK}-${user.id}`,issuer:'Organismo de prueba',expires,noExpiry:expires===null,notes:'Ensayo aislado'}});
 const body=new FormData();body.append('file',new Blob([PDF],{type:'application/pdf'}),'credencial.pdf');
 const upload=await fetch(`${BASE}/professional-credentials/${c.id}/documents`,{method:'POST',headers:{Authorization:'Bearer '+admin},body});assert.equal(upload.status,200);
 await call(`/professional-credentials/${c.id}/decision/VERIFICADA`,{method:'POST',token:admin,body:{notes:'Revisión manual E2E',confirmsSufficiency:true}});
 return c.id;
}
(async()=>{
 const info=JSON.parse(spawnSync('docker',['inspect',BACKEND],{encoding:'utf8'}).stdout)[0];
 const env=Object.fromEntries(info.Config.Env.filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
 assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`)&&env.SPRING_PROFILES_ACTIVE.includes('e2e'));
 assert.ok(Number(one("SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL"))>=54);
 await waitHealthy();
 const dotenv={};for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0&&!line.trim().startsWith('#'))dotenv[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}
 const admin=(await ok('/auth/login',{method:'POST',body:{username:dotenv.BOOTSTRAP_ADMIN_USERNAME,password:dotenv.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;
 const ops=await createUser(admin,'CENTRO_OPERACIONES','i3ops');
 const commander=await createUser(admin,'COMANDANTE','i3cmd');await provision(admin,commander);
 const first=await createUser(admin,'DTS','i3crew1'),replacement=await createUser(admin,'DTS','i3crew2');
 const credential=await qualified(admin,first,'COPILOTO');await qualified(admin,replacement,'COPILOTO');
 const provinces=await ok('/catalogs/provinces',{token:ops.token});let province,airports;
 for(const p of provinces){const rows=await ok(`/catalogs/airports?provinceId=${p.id}`,{token:ops.token});if(rows.length>=2){province=p;airports=rows;break;}}
 assert.ok(province);await call(`/catalogs/commanders/${commander.id}/location`,{method:'POST',token:ops.token,body:{locationId:province.id}});
 const plane=await ok('/catalogs/aircraft',{method:'POST',token:admin,body:{matricula:(MARK+'I3').toUpperCase(),modelo:'E2E',tipo:'PRUEBA',capacidadPacientes:1,capacidadTripulacion:3,aeropuertoActualId:airports[0].id,activo:true}});
 const departure=futureSlot(),arrival=new Date(departure.getTime()+2*3600000);
 const flight=await ok('/flights/operational',{method:'POST',token:ops.token,body:{tipoVueloCode:'REGRESO_BASE',motivoVuelo:'Elegibilidad I-3 '+MARK,aircraftId:plane.id,comandanteId:commander.id,destinoId:airports[1].id,salida:fmt(departure),llegada:fmt(arrival)}});
 await call(`/flights/${flight.id}/commander-assignment/response`,{method:'POST',token:commander.token,body:{aceptar:true}});
 await call(`/flights/${flight.id}/crew`,{method:'POST',token:ops.token,body:{userId:first.id,crewRoleCode:'COPILOTO'},expect:[204]});
 let crew=await ok(`/flights/${flight.id}/crew`,{token:ops.token});assert.equal(crew.find(x=>x.userId===first.id).elegibilidadCodigo,'ELEGIBLE');pass('asignación válida y estado inicial');
 await call(`/professional-credentials/${credential}/decision/REVOCADA`,{method:'POST',token:admin,body:{notes:'Revocación E2E I-3'}});
 crew=await ok(`/flights/${flight.id}/crew`,{token:ops.token});assert.equal(crew.find(x=>x.userId===first.id).elegibilidadCodigo,'HABILITACION_REVOCADA');
 const denied=await call(`/flights/${flight.id}/start`,{method:'POST',token:ops.token,expect:[409]});assert.equal(denied.data.code,'HABILITACION_REVOCADA');assert.equal(denied.data.userId,first.id);
 assert.equal(one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${flight.id}`),'PLANIFICADO');
 assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${flight.id} AND operacion='START_REJECTED_ELIGIBILITY'`),1);pass('revocación posterior visible y arranque rechazado con auditoría');
 const old=crew.find(x=>x.userId===first.id);await call(`/flights/${flight.id}/crew/${old.id}`,{method:'PUT',token:ops.token,body:{userId:replacement.id,crewRoleCode:'COPILOTO'},expect:[204]});
 const history=await ok(`/flights/${flight.id}/crew?history=true`,{token:ops.token});assert.equal(history.find(x=>x.id===old.id).vigente,false);assert.equal(history.find(x=>x.userId===replacement.id).elegibilidadCodigo,'ELEGIBLE');
 assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${flight.id} AND id_usuarios=${first.id} AND fecha_baja IS NOT NULL`),1);
 await approveRoute(flight.id,commander.token,ops.token);await call(`/flights/${flight.id}/start`,{method:'POST',token:ops.token});assert.equal(one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${flight.id}`),'EN_CURSO');
 pass('reemplazo histórico e inicio tras regularización');
 await call(`/flights/${flight.id}/finish`,{method:'POST',token:ops.token});pass('finalización de vuelo iniciado');
 const timeCrew=await createUser(admin,'DTS','i3time'),timeCommander=await createUser(admin,'COMANDANTE','i3cmd2');await provision(admin,timeCommander);
 await call(`/catalogs/commanders/${timeCommander.id}/location`,{method:'POST',token:ops.token,body:{locationId:province.id}});
 const secondDeparture=futureSlot();
 const timeCredential=await qualified(admin,timeCrew,'COPILOTO',fmt(new Date(secondDeparture.getTime()+86400000)).slice(0,10));
 const second=await ok('/flights/operational',{method:'POST',token:ops.token,body:{tipoVueloCode:'REGRESO_BASE',motivoVuelo:'Vencimiento I-3 '+MARK,aircraftId:plane.id,comandanteId:timeCommander.id,destinoId:airports[0].id,salida:fmt(secondDeparture),llegada:fmt(new Date(secondDeparture.getTime()+2*3600000))}});
 await call(`/flights/${second.id}/commander-assignment/response`,{method:'POST',token:timeCommander.token,body:{aceptar:true}});
 await call(`/flights/${second.id}/crew`,{method:'POST',token:ops.token,body:{userId:timeCrew.id,crewRoleCode:'COPILOTO'},expect:[204]});await approveRoute(second.id,timeCommander.token,ops.token);
 try{
  await call('/e2e/clock',{method:'PUT',token:admin,body:{instant:new Date(secondDeparture.getTime()+3*86400000).toISOString()}});
  await call(`/e2e/crew-eligibility/sweep/${second.id}`,{method:'POST',token:admin});
  const expired=(await ok(`/flights/${second.id}/crew`,{token:ops.token})).find(x=>x.userId===timeCrew.id);
  assert.equal(expired.elegibilidadCodigo,'HABILITACION_VENCIDA');
  assert.equal((await call(`/flights/${second.id}/start`,{method:'POST',token:ops.token,expect:[409]})).data.code,'HABILITACION_VENCIDA');
  assert.ok(count(`SELECT COUNT(*) FROM notificaciones WHERE id_vuelos=${second.id} AND tipo_notificacion='CREW_ELIGIBILITY_REVIEW'`)>=1);
  pass('vencimiento por reloj controlado, aviso único y bloqueo del inicio');
 }finally{await call('/e2e/clock',{method:'PUT',token:admin,body:{reset:true}});}
 const [revocation,racingStart]=await Promise.all([
  call(`/professional-credentials/${timeCredential}/decision/REVOCADA`,{method:'POST',token:admin,body:{notes:'Carrera controlada I-3'}}),
  call(`/flights/${second.id}/start`,{method:'POST',token:ops.token,expect:[200,409]})
 ]);
 assert.equal(revocation.status,200);
 const finalState=one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${second.id}`);
 if(racingStart.status===409){assert.equal(racingStart.data.code,'HABILITACION_REVOCADA');assert.equal(finalState,'PLANIFICADO');}
 else{assert.equal(finalState,'EN_CURSO');await call(`/flights/${second.id}/finish`,{method:'POST',token:ops.token});}
 pass('inicio y revocación concurrentes serializados sin estado incoherente');
 console.log(`${passed} bloques aprobados, vuelo ${flight.id}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
