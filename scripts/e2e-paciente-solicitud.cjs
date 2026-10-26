/* Alta atómica de paciente y solicitud, sólo sobre vuelos_sanitarios_e2e. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, DB_NAME, MARK, sql, count, call, ok, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');

(async () => {
 const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
 const env = Object.fromEntries(info.Config.Env.filter(x => x.includes('=')).map(x => [x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
 assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'));
 assert.equal(sql('SELECT DB_NAME()'), DB_NAME);
 assert.ok(Number(sql('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 48);
 const dotenv = {};
 for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){
  if(line.includes('=') && !line.trim().startsWith('#')){const i=line.indexOf('=');dotenv[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}
 }
 await waitHealthy();
 const admin=(await ok('/auth/login',{method:'POST',body:{username:dotenv.BOOTSTRAP_ADMIN_USERNAME,password:dotenv.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;
 const dts=await createUser(admin,'DTS','patient'),ops=await createUser(admin,'CENTRO_OPERACIONES','patientops');
 const province=(await ok('/catalogs/provinces',{token:dts.token}))[0];
 const localities=await ok(`/catalogs/localities?provinceId=${province.id}`,{token:dts.token});
 assert.ok(localities.length>=2);
 const date=new Date(Date.now()+5*86400000).toISOString().slice(0,10)+'T12:00:00';
 const dni=String(70000000+Math.floor(Math.random()*20000000));
 const patient={nombre:'Paciente',apellido:MARK,dni:`${dni.slice(0,2)}.${dni.slice(2,5)}.${dni.slice(5)}`,fechaNacimiento:'1990-01-02'};
 const body={patient,identidadConfirmada:true,localidadOrigenId:localities[0].id,localidadDestinoId:localities[1].id,priorityCode:'ALTA',motivoVuelo:'Traslado '+MARK,fechaSolicitada:date,extremaUrgencia:false,medical:{diagnostico:'Control',condicionMedica:'ESTABLE',requiereEquipamientoEspecial:false}};
 const persons=()=>count(`SELECT COUNT(*) FROM personas WHERE dni='${dni}'`);
 const before=persons();
 await call('/flights/with-patient',{method:'POST',body:{...body,localidadDestinoId:localities[0].id},token:dts.token,expect:[400]});
 await call('/flights/with-patient',{method:'POST',body:{...body,patient:{personId:1,nombre:'Paciente',apellido:MARK}},token:dts.token,expect:[400]});
 assert.equal(persons(),before,'el vuelo inválido no deja persona');
 await call('/flights/with-patient',{method:'POST',body,token:ops.token,expect:[403]});
 await call('/flights/with-patient',{method:'POST',body,expect:[401]});
 assert.equal(persons(),before,'las operaciones no autorizadas no dejan persona');
 const flight=await ok('/flights/with-patient',{method:'POST',body,token:dts.token});
 assert.equal(persons(),before+1);
 const row=sql(`SELECT CAST(s.id_pacientes AS varchar) FROM vuelos_sanitarios s WHERE s.id_vuelos=${flight.id}`);
 const patientId=Number(row);
 assert.ok(patientId>0);
 assert.equal(count(`SELECT COUNT(*) FROM pacientes p JOIN personas x ON x.id_personas=p.id_personas WHERE p.id_pacientes=${patientId} AND x.dni='${dni}' AND x.fecha_nacimiento='1990-01-02'`),1);
 assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${flight.id} AND tipo_entidad='PATIENT' AND entidad_id=${patientId} AND operacion='CREATE_WITH_SANITARY_REQUEST'`),1);
 assert.equal((await ok(`/flights/${flight.id}`,{token:dts.token})).paciente.dni,dni);
 assert.ok((await ok(`/patients/search?dni=${dni}`,{token:dts.token})).items.some(p=>p.id===patientId));
 await call('/flights/with-patient',{method:'POST',body,token:dts.token,expect:[409]});
 assert.equal(persons(),before+1,'la identidad no se duplica');
 // el contrato de /flights es estricto: un campo que sólo corresponde a /flights/with-patient se rechaza en lugar de ignorarse
 await call('/flights',{method:'POST',body:{...body,patient:undefined,patientId},token:dts.token,expect:[400]});
 const reused=await ok('/flights',{method:'POST',body:{...body,patient:undefined,identidadConfirmada:undefined,patientId},token:dts.token});
 assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_pacientes=${patientId} AND id_vuelos IN (${flight.id},${reused.id})`),2);
 console.log('PASS: rollback, autorización, identidad única, trazabilidad, consulta y reutilización del paciente en dos vuelos');
})().catch(e=>{console.error(e);process.exitCode=1;});
