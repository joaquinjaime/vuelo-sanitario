/* Búsqueda y corrección de identidad sobre SQL Server aislado V48. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
 const { ROOT, BACKEND, DB_NAME, MARK, PASSWORD, sql, one, count, call, ok, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');

(async () => {
 const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
 const env = Object.fromEntries(info.Config.Env.filter(x => x.includes('=')).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
 assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'));
 assert.equal(one('SELECT DB_NAME()'), DB_NAME);
 assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 48);
 assert.equal(count("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.personas') AND name='version_identidad'"), 1);
 await waitHealthy();
 const dotenv = {};
 for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); }
 }
 const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
 const dts = await createUser(admin, 'DTS', 'directory');
 const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'directoryops');
 const alpha = MARK.replace(/[0-9]/g, digit => String.fromCharCode(97 + Number(digit)));
 const prefix = 'Directorio' + alpha;
 const surname = 'Busqueda' + alpha;
 const created = [];
 for (let i = 0; i < 23; i++) {
  const dni = String(65000000 + Math.floor(Math.random() * 20000000));
  created.push(await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: prefix + String(i).padStart(2, '0'), apellido: surname, dni, fechaNacimiento: '1987-05-06' } }));
 }
 const search = (page, size = 10) => `/patients/search?nombre=${encodeURIComponent(prefix)}&apellido=${encodeURIComponent(surname)}&page=${page}&size=${size}`;
 const pages = [await ok(search(0), { token: dts.token }), await ok(search(1), { token: dts.token }), await ok(search(2), { token: dts.token })];
 assert.equal((await ok('/patients/search?dni=999999999999', { token: dts.token })).items.length, 0);
 assert.deepEqual(pages.map(p => p.items.length), [10, 10, 3]);
 assert.deepEqual(pages.map(p => p.hasNext), [true, true, false]);
 assert.deepEqual(pages.flatMap(p => p.items.map(x => x.id)), created.map(x => x.id));
 assert.equal(new Set(pages.flatMap(p => p.items.map(x => x.id))).size, 23);
 assert.ok(pages[0].items.every(x => Object.keys(x).sort().join(',') === 'anioNacimiento,apellido,dniTerminacion,id,nombre' && x.dniTerminacion.startsWith('••••')));
 const patient = created[0];
 const dni = one(`SELECT dni FROM personas WHERE id_personas=${patient.personId}`);
 const exact = await ok(`/patients/search?dni=${dni}`, { token: dts.token });
 assert.equal(exact.items[0].id, patient.id);
 assert.equal(exact.items[0].dniTerminacion, '••••' + dni.slice(-4));
 for (const url of ['/patients/search', '/patients/search?nombre=Ana', '/patients/search?dni=12', '/patients/search?dni=12345678&apellido=Paz', search(0, 21), search(101, 10)]) await call(url, { token: dts.token, expect: [400] });
 await call(search(0), { token: ops.token, expect: [403] });
 await call(search(0), { expect: [401] });
 await call('/patients', { token: dts.token, expect: [405] });
 await call(`/patients/${patient.id}`, { token: dts.token, expect: [403] });
 await call(`/patients/${patient.id}/corrections`, { token: dts.token, expect: [403] });
 const province = (await ok('/catalogs/provinces', { token: dts.token }))[0];
 const localities = await ok(`/catalogs/localities?provinceId=${province.id}`, { token: dts.token });
 const request = { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: 'ALTA', motivoVuelo: 'Directorio ' + MARK, fechaSolicitada: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10) + 'T12:00:00', extremaUrgencia: false, medical: { diagnostico: 'DX-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } };
 const flight = await ok('/flights', { method: 'POST', token: dts.token, body: request });
 assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${flight.id} AND id_pacientes=${patient.id}`), 1);
 const beforeMedical = count(`SELECT COUNT(*) FROM informacion_medica_vuelo WHERE id_vuelos=${flight.id}`);
 const beforeDiagnosis = one(`SELECT diagnostico FROM informacion_medica_vuelo WHERE id_vuelos=${flight.id}`);
 const beforePersonCount = count(`SELECT COUNT(*) FROM personas WHERE dni='${dni}'`);
 const original = await ok(`/patients/${patient.id}`, { token: admin });
 assert.equal(original.dni, dni);
 const correction = { nombre: 'Corregida', apellido: surname, fechaNacimiento: '1986-04-03', version: original.version, motivo: 'Cotejo administrativo de identidad' };
 await call(`/patients/${patient.id}/identity`, { method: 'PUT', token: dts.token, body: correction, expect: [403] });
 await call(`/patients/${patient.id}/identity`, { method: 'PUT', token: admin, body: { ...correction, motivo: 'corto' }, expect: [400] });
 await call(`/patients/${patient.id}/identity`, { method: 'PUT', token: admin, body: { ...correction, dni: '99999999' }, expect: [400] });
 await call(`/patients/${patient.id}/identity`, { method: 'PUT', token: admin, body: { ...correction, fechaNacimiento: '2100-01-01' }, expect: [400] });
 assert.equal((await ok(`/patients/${patient.id}`, { token: admin })).version, original.version);
 const trigger = 'e2e_patient_audit_failure_' + patient.id;
 sql(`EXEC(N'CREATE TRIGGER dbo.${trigger} ON dbo.eventos_auditoria AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE tipo_entidad=N''PATIENT_IDENTITY'' AND entidad_id=${patient.id}) THROW 51000, N''Fallo de prueba'', 1; END');`);
 try {
  await call(`/patients/${patient.id}/identity`, { method: 'PUT', token: admin, body: correction, expect: [500] });
  assert.equal((await ok(`/patients/${patient.id}`, { token: admin })).version, original.version);
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad='PATIENT_IDENTITY' AND entidad_id=${patient.id}`), 0);
 } finally { sql(`DROP TRIGGER IF EXISTS dbo.${trigger}`); }
 assert.equal(count(`SELECT COUNT(*) FROM sys.triggers WHERE name=N'${trigger}'`), 0);
 const updated = await ok(`/patients/${patient.id}/identity`, { method: 'PUT', token: admin, body: correction });
 assert.equal(updated.nombre, 'Corregida'); assert.equal(updated.dni, dni); assert.equal(updated.version, original.version + 1);
 await call(`/patients/${patient.id}/identity`, { method: 'PUT', token: admin, body: correction, expect: [409] });
 const history = await ok(`/patients/${patient.id}/corrections`, { token: admin });
 assert.equal(history.items.length, 1);
 assert.equal(history.items[0].motivo, correction.motivo);
 assert.deepEqual(history.items[0].cambios.map(x => x.campo), ['nombre', 'fechaNacimiento']);
 assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad='PATIENT_IDENTITY' AND entidad_id=${patient.id} AND operacion='CORRECT' AND id_vuelos IS NULL`), 1);
 const concurrent = await Promise.all(['ConcurrenteA', 'ConcurrenteB'].map(nombre => call(`/patients/${patient.id}/identity`, { method: 'PUT', token: admin, body: { ...correction, nombre, motivo: 'Cotejo concurrente de identidad', version: updated.version }, expect: [200, 409] })));
 assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
 assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad='PATIENT_IDENTITY' AND entidad_id=${patient.id} AND operacion='CORRECT'`), 2);
 assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${flight.id} AND id_pacientes=${patient.id}`), 1);
 assert.equal(count(`SELECT COUNT(*) FROM informacion_medica_vuelo WHERE id_vuelos=${flight.id}`), beforeMedical);
 assert.equal(one(`SELECT diagnostico FROM informacion_medica_vuelo WHERE id_vuelos=${flight.id}`), beforeDiagnosis);
 assert.equal(count(`SELECT COUNT(*) FROM personas WHERE dni='${dni}'`), beforePersonCount);
 const linkedDni = one(`SELECT p.dni FROM personas p JOIN usuarios u ON u.id_personas=p.id_personas WHERE u.id_usuarios=${dts.id}`);
 const accountState = () => one(`SELECT CONCAT(nombre_usuario,'|',hash_contrasena,'|',estado_cuenta,'|',CAST(version_credenciales AS varchar)) FROM usuarios WHERE id_usuarios=${dts.id}`);
 const accountBefore = accountState();
 const rolesBefore = one(`SELECT STRING_AGG(r.codigo_rol, ',') WITHIN GROUP (ORDER BY r.codigo_rol) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=${dts.id}`);
 const linkedFlight = await ok('/flights/with-patient', { method: 'POST', token: dts.token, body: { ...request, patientId: undefined, patient: { nombre: 'E2E', apellido: 'directory', dni: linkedDni }, identidadConfirmada: true, fechaSolicitada: new Date(Date.now() + 22 * 86400000).toISOString().slice(0, 10) + 'T12:00:00' } });
 const linkedId = Number(one(`SELECT id_pacientes FROM vuelos_sanitarios WHERE id_vuelos=${linkedFlight.id}`));
 const linkedOriginal = await ok(`/patients/${linkedId}`, { token: admin });
 await ok(`/patients/${linkedId}/identity`, { method: 'PUT', token: admin, body: { nombre: 'CuentaCorregida', apellido: 'directory', fechaNacimiento: null, motivo: 'Cotejo de identidad de cuenta', version: linkedOriginal.version } });
 assert.equal(accountState(), accountBefore);
 assert.equal(one(`SELECT STRING_AGG(r.codigo_rol, ',') WITHIN GROUP (ORDER BY r.codigo_rol) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=${dts.id}`), rolesBefore);
 assert.equal((await ok('/auth/me', { token: dts.token })).id, dts.id);
 assert.equal(count(`SELECT COUNT(*) FROM personas WHERE dni='${linkedDni}'`), 1);
 assert.equal(count(`SELECT COUNT(*) FROM pacientes p JOIN personas x ON x.id_personas=p.id_personas WHERE x.dni='${linkedDni}'`), 1);
 console.log('PASS: búsqueda paginada y privada, selección DTS, corrección ADMIN, concurrencia, auditoría y vínculos históricos preservados');
})().catch(error => { console.error(error); process.exitCode = 1; });
