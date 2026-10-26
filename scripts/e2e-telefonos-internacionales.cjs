/* Teléfonos internacionales (V54): API real y SQL Server real sobre el stack aislado. El servidor valida con libphonenumber el número contra el país
 * elegido y guarda E.164 + formato internacional + país; lo rechazado nunca se persiste aunque la petición se haga directo a la API. Cubre el
 * autoservicio, el alta administrativa y los contactos de coordinación del traslado, los datos anteriores sin país (se conservan intactos),
 * la unicidad sobre la forma normalizada (también bajo concurrencia) y las restricciones de SQL Server. Sólo toca el stack aislado.
 * Uso: node scripts/e2e-telefonos-internacionales.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, DB_NAME, MARK, sql, one, count, call, ok, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const lines = (q) => sql(q).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const sqlFails = (q) => { try { sql(q); return false; } catch { return true; } };

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'), 'sólo la base aislada');
  assert.equal(one('SELECT DB_NAME()'), DB_NAME);
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 54);
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const personOf = (u) => Number(one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${u.id}`));
  const phoneRows = (personId) => lines(`SELECT CONCAT(id_telefonos,'|',numero,'|',numero_normalizado,'|',ISNULL(codigo_pais,'-'),'|',tipo_telefono,'|',es_principal,'|',version_contacto) FROM telefonos WHERE id_personas=${personId} AND fecha_baja IS NULL ORDER BY id_telefonos`).map((r) => { const [id, shown, e164, country, type, main, version] = r.split('|'); return { id: Number(id), shown, e164, country, type, main: main === '1', version: Number(version) }; });
  const addPhone = (u, country, number, extra = {}, expect = [200]) => call('/auth/me/telefonos', { method: 'POST', token: u.token, body: { ...(country === undefined ? {} : { pais: country }), numero: number, ...extra }, expect });

  // ---------- A. Esquema y análisis de los datos anteriores ----------
  const legacyHash = () => one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT id_telefonos,id_personas,numero,numero_normalizado,tipo_telefono,es_principal,version_contacto,fecha_baja FROM telefonos WHERE codigo_pais IS NULL ORDER BY id_telefonos FOR JSON PATH)),2)`);
  const legacyBefore = legacyHash(), legacyCount = count('SELECT COUNT(*) FROM telefonos WHERE codigo_pais IS NULL');
  console.log('Análisis de teléfonos anteriores sin país (base aislada):');
  const profile = lines(`SELECT CONCAT(CASE WHEN numero_normalizado LIKE N'+%' THEN N'con + ' ELSE N'sin + ' END,LEN(numero_normalizado),' caracteres: ',COUNT(*),' filas, ',COUNT(DISTINCT numero_normalizado),' distintos') FROM telefonos WHERE codigo_pais IS NULL AND fecha_baja IS NULL GROUP BY CASE WHEN numero_normalizado LIKE N'+%' THEN N'con + ' ELSE N'sin + ' END,LEN(numero_normalizado)`);
  for (const row of profile) console.log('  ' + row);
  assert.equal(count("SELECT COUNT(*) FROM sys.check_constraints WHERE name='ck_telefonos_validacion_internacional'"), 1);
  pass(`V54 aplicada; ${legacyCount} teléfonos anteriores sin país se conservan como están (ninguno se adivina)`);

  // ---------- B. Autoservicio ----------
  const u1 = await createUser(admin, 'DTS', 'tel1'), u2 = await createUser(admin, 'DTS', 'tel2');
  const p1 = personOf(u1);
  const valid = [
    ['AR', '0381 15 555-1234', '+5493815551234', 'AR'], ['AR', '+54 11 5555-1234', '+541155551234', 'AR'], ['CL', '9 8765 4321', '+56987654321', 'CL'], ['BR', '(11) 98765-4321', '+5511987654321', 'BR'],
    ['ES', '612 34 56 78', '+34612345678', 'ES'], ['US', '(202) 555-0123', '+12025550123', 'US'], ['CA', '416 555 0123', '+14165550123', 'CA'], ['UY', '099 123 456', '+59899123456', 'UY'], ['GB', '020 7946 0958', '+442079460958', 'GB'],
  ];
  for (const [country, input, e164] of valid) {
    const res = (await addPhone(u1, country, input)).data;
    assert.equal(res.pais, country, input); assert.ok(res.valor.startsWith('+'), 'se guarda en formato internacional legible');
    const row = phoneRows(p1).find((r) => r.id === res.id); assert.equal(row.e164, e164, input); assert.equal(row.country, country); assert.equal(row.shown, res.valor);
  }
  assert.equal(phoneRows(p1).filter((r) => r.main).length, 1);
  // +1 compartido: la región elegida decide
  assert.equal((await addPhone(u2, 'US', '+1 416 555 0123', {}, [400])).data.motivo, 'PHONE_INVALID');
  assert.equal((await addPhone(u2, 'CA', '202 555 0123', {}, [400])).data.motivo, 'PHONE_INVALID');
  const before = phoneRows(p1).length;
  const bad = [
    [undefined, '0381 555-1234', 'PHONE_COUNTRY_REQUIRED'], ['', '0381 555-1234', 'PHONE_COUNTRY_REQUIRED'], ['ZZ', '0381 555-1234', 'PHONE_COUNTRY_INVALID'], ['AR', '+56 9 8765 4321', 'PHONE_COUNTRY_MISMATCH'],
    ['AR', '+54 54 381 555 1234', 'PHONE_TOO_LONG'], ['AR', '12345', 'PHONE_TOO_SHORT'], ['AR', '381 555 1234 5678 9012', 'PHONE_TOO_LONG'], ['AR', '0000 000 0000', 'PHONE_INVALID'], ['AR', '381-555-12$4', 'PHONE_CHARS_INVALID'],
    ['AR', '0381 555-1234 ext. 12', 'PHONE_EXTENSION_UNSUPPORTED'], ['CL', '381 555 1234', 'PHONE_INVALID'], ['AR', '54+3815551234', 'PHONE_CHARS_INVALID'], ['AR', '', 'PHONE_REQUIRED'],
  ];
  for (const [country, input, reason] of bad) {
    const r = await call('/auth/me/telefonos', { method: 'POST', token: u1.token, body: { ...(country === undefined ? {} : { pais: country }), numero: input }, expect: [400] });
    if (input.trim()) assert.equal(r.data.motivo, reason, `${country}/${input}`);
  }
  // la petición directa no puede declarar validez ni imponer lo que se guarda
  for (const extra of [{ valido: true }, { numeroNormalizado: '+999999' }, { codigoPais: 'CL' }]) assert.equal((await call('/auth/me/telefonos', { method: 'POST', token: u1.token, body: { pais: 'AR', numero: '0381 555-9876', ...extra }, expect: [400] })).status, 400);
  await call('/auth/me/telefonos', { method: 'POST', token: u1.token, body: { pais: 'ARG', numero: '0381 555-9876' }, expect: [400] });
  await call('/auth/me/telefonos', { method: 'POST', body: { pais: 'AR', numero: '0381 555-9876' }, expect: [401] });
  assert.equal(phoneRows(p1).length, before, 'nada de lo rechazado se persiste');
  pass('autoservicio: nueve países válidos a E.164 + país en SQL; faltante/ inexistente/ prefijo ajeno/ corto/ largo/ caracteres/ extensión/ +1 compartido rechazados sin residuos');

  // ---------- C. Equivalencias y concurrencia ----------
  const dupFixed = phoneRows(p1).find((r) => r.e164 === '+5493815551234'); assert.ok(dupFixed);
  for (const same of ['0381 15 555-1234', '+54 9 381 555 1234', '(0381) 15-555.1234', '0054 9 381 5551234']) assert.equal((await addPhone(u1, 'AR', same, {}, [409])).data.code, 'CONTACT_DUPLICATE', same);
  const racers = await Promise.all(['0381 555-4321', '381 555 4321', '+54 381 555-4321', '(0381) 555 4321', '0054 381 5554321', '381.555.4321', '03815554321', '+543815554321'].map((n) => addPhone(u2, 'AR', n, {}, [200, 409])));
  assert.equal(racers.filter((r) => r.status === 200).length, 1, 'una sola alta entre ocho grafías del mismo número'); assert.equal(racers.filter((r) => r.status === 409).length, 7);
  assert.equal(phoneRows(personOf(u2)).filter((r) => r.e164 === '+543815554321').length, 1);
  assert.equal(count(`SELECT COUNT(*) FROM (SELECT id_personas,numero_normalizado FROM telefonos WHERE fecha_baja IS NULL GROUP BY id_personas,numero_normalizado HAVING COUNT(*)>1) x`), 0);
  pass('ocho grafías simultáneas del mismo número → una sola fila vigente; las equivalentes se detectan como duplicado');

  // ---------- D. Edición, versión y datos anteriores ----------
  const target = phoneRows(p1).find((r) => r.e164 === '+56987654321');
  assert.equal((await call(`/auth/me/telefonos/${target.id}`, { method: 'PUT', token: u1.token, body: { numero: '9 8765 4321', version: target.version }, expect: [400] })).data.motivo, 'PHONE_COUNTRY_REQUIRED');
  assert.equal((await call(`/auth/me/telefonos/${target.id}`, { method: 'PUT', token: u1.token, body: { pais: 'AR', numero: '0381 15 555-1234', version: target.version }, expect: [409] })).data.code, 'CONTACT_DUPLICATE');
  const edited = (await ok(`/auth/me/telefonos/${target.id}`, { method: 'PUT', token: u1.token, body: { pais: 'PE', numero: '987 654 321', tipo: 'LABORAL', version: target.version } })).valor;
  assert.equal(edited, '+51 987 654 321'); assert.equal(phoneRows(p1).find((r) => r.id === target.id).country, 'PE');
  assert.equal((await call(`/auth/me/telefonos/${target.id}`, { method: 'PUT', token: u1.token, body: { pais: 'PE', numero: '987 654 321', tipo: 'LABORAL', version: target.version }, expect: [409] })).data.code, 'CONTACT_VERSION_CONFLICT');
  // un dato anterior sin país (se inserta como lo dejaría una versión previa) se conserva, se marca y sólo su titular lo valida
  const u3 = await createUser(admin, 'DTS', 'tel3'); const p3 = personOf(u3);
  sql(`INSERT INTO telefonos(id_personas,numero,numero_normalizado,tipo_telefono,es_principal,fecha_creacion,fecha_actualizacion) VALUES(${p3},N'381 444-5566',N'3814445566',N'LABORAL',0,SYSUTCDATETIME(),SYSUTCDATETIME())`);
  const legacy = (await ok('/auth/me', { token: u3.token })).telefonos.find((t) => t.valor === '381 444-5566'); assert.ok(legacy); assert.equal(legacy.pais ?? null, null);
  assert.equal((await addPhone(u3, 'AR', '0381 444-5566', {}, [409])).data.code, 'CONTACT_DUPLICATE', 'no se duplica un dato anterior sin validar');
  assert.equal((await addPhone(u3, 'AR', '+54 381 444 5566', {}, [409])).status, 409);
  const hashBeforeValidate = legacyHash();
  await ok(`/auth/me/telefonos/${legacy.id}`, { method: 'PUT', token: u3.token, body: { pais: 'AR', numero: '381 444-5566', tipo: 'LABORAL', version: legacy.version } });
  const fixed = phoneRows(p3).find((r) => r.id === legacy.id); assert.equal(fixed.e164, '+543814445566'); assert.equal(fixed.country, 'AR');
  assert.notEqual(legacyHash(), hashBeforeValidate, 'sólo cambió el dato que su titular validó');
  assert.equal(count('SELECT COUNT(*) FROM telefonos WHERE codigo_pais IS NULL'), legacyCount, 'los demás datos anteriores no se tocaron');
  pass('edición con país y versión; un dato anterior sin país se conserva, no se duplica y lo valida su titular');

  // ---------- E. Alta administrativa ----------
  const people = count('SELECT COUNT(*) FROM personas');
  const dniBad = String(70000000 + Math.floor(Math.random() * 20000000)), dniOk = String(70000000 + Math.floor(Math.random() * 20000000));
  const adminBody = (dni, phones) => ({ nombre: 'Alta', apellido: 'Tel' + MARK, dni, roles: ['DTS'], correos: [{ direccion: `alta.${dni}@example.test` }], telefonos: phones });
  for (const phones of [[{ numero: '0381 555-1234' }], [{ pais: 'AR', numero: '12345' }], [{ pais: 'AR', numero: '+56 9 8765 4321' }], [{ pais: 'XX', numero: '0381 555-1234' }]])
    assert.equal((await call('/auth/users', { method: 'POST', token: admin, body: adminBody(dniBad, phones), expect: [400] })).data.code, 'CONTACT_INVALID');
  assert.equal(count('SELECT COUNT(*) FROM personas'), people, 'un alta rechazada no deja persona ni cuenta ni contactos');
  await ok('/auth/users', { method: 'POST', token: admin, body: adminBody(dniOk, [{ pais: 'AR', numero: '0381 15 555-1234' }, { pais: 'AR', numero: '+54 9 381 555 1234' }, { pais: 'CL', numero: '9 8765 4321', tipo: 'LABORAL' }]) });
  const created = phoneRows(Number(one(`SELECT id_personas FROM personas WHERE dni='${dniOk}'`)));
  assert.deepEqual(created.map((r) => r.e164), ['+5493815551234', '+56987654321']); assert.equal(created[0].main, true); assert.equal(created[1].type, 'LABORAL');
  pass('alta administrativa: mismas reglas, equivalentes unificados y nada persistido cuando se rechaza');

  // ---------- F. Contactos de coordinación del traslado ----------
  const dts = await createUser(admin, 'DTS', 'tel4'), ops = await createUser(admin, 'CENTRO_OPERACIONES', 'tel4ops');
  let province, localities;
  for (const p of await ok('/catalogs/provinces', { token: dts.token })) { const l = await ok(`/catalogs/localities?provinceId=${p.id}`, { token: dts.token }); if (l.length >= 2) { province = p; localities = l; break; } }
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0];
  const day = new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10) + 'T12:00:00';
  const rnd = () => String(70000000 + Math.floor(Math.random() * 20000000));
  const request = (contactos, expect = [200]) => call('/flights/with-patient', { method: 'POST', token: dts.token, expect, body: { patient: { nombre: 'Paciente', apellido: 'Tel' + MARK, dni: rnd() }, identidadConfirmada: true, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority.codigo, motivoVuelo: 'Teléfonos ' + MARK, fechaSolicitada: day, extremaUrgencia: false, medical: { diagnostico: 'Dx ' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false }, contactos } });
  const totals = () => [count('SELECT COUNT(*) FROM personas'), count('SELECT COUNT(*) FROM pacientes'), count('SELECT COUNT(*) FROM vuelos'), count('SELECT COUNT(*) FROM contactos_coordinacion_traslado'), count('SELECT COUNT(*) FROM telefonos')].join('/');
  const t0 = totals();
  for (const invalid of [[{ relacion: 'PACIENTE', telefono: '3815550101' }], [{ relacion: 'PACIENTE', pais: 'ZZ', telefono: '3815550101' }], [{ relacion: 'PACIENTE', pais: 'AR', telefono: '+56 9 8765 4321' }], [{ relacion: 'PACIENTE', pais: 'AR', telefono: '0381 555-0101 ext 4' }], [{ relacion: 'PACIENTE', pais: 'CL', telefono: '381 555 0101' }]]) {
    const r = await request(invalid, [400]); assert.equal(r.data.code, 'TRANSFER_CONTACT_INVALID'); assert.equal(r.data.campo, 'telefono');
  }
  assert.equal(totals(), t0, 'los rechazos no dejan persona, paciente, vuelo ni contactos');
  const flight = (await request([{ relacion: 'PACIENTE', pais: 'CL', telefono: '9 8765 4321' }, { relacion: 'FAMILIAR_RESPONSABLE', nombre: 'Marta', pais: 'US', telefono: '(202) 555-0123' }])).data.id;
  const rows = lines(`SELECT CONCAT(id_contactos_coordinacion_traslado,'|',telefono_contacto,'|',telefono_normalizado,'|',ISNULL(codigo_pais,'-')) FROM contactos_coordinacion_traslado WHERE id_vuelos=${flight} AND fecha_baja IS NULL ORDER BY 1`).map((r) => r.split('|'));
  assert.deepEqual(rows.map((r) => r.slice(2)), [['+56987654321', 'CL'], ['+12025550123', 'US']]);
  const phonesBefore = count('SELECT COUNT(*) FROM telefonos');
  const base = `/flights/${flight}/transfer-contacts`;
  assert.equal((await call(base, { method: 'POST', token: dts.token, body: { relacion: 'OTRO', nombre: 'Repetido', pais: 'CL', telefono: '+56 9 8765-4321' }, expect: [400] })).data.code, 'CONTACT_AMBIGUOUS');
  assert.equal((await call(base, { method: 'POST', token: dts.token, body: { relacion: 'OTRO', nombre: 'Ajeno', pais: 'AR', telefono: '+56 9 8765 4321' }, expect: [400] })).data.motivo, 'PHONE_COUNTRY_MISMATCH');
  // un contacto anterior sin país se conserva y exige elegir el país al editarlo
  const legacyContact = Number(one(`SELECT TOP 1 id_contactos_coordinacion_traslado FROM contactos_coordinacion_traslado WHERE id_vuelos=${flight} AND es_principal=0 AND fecha_baja IS NULL`));
  sql(`UPDATE contactos_coordinacion_traslado SET codigo_pais=NULL,telefono_contacto=N'2025550123',telefono_normalizado=N'2025550123' WHERE id_contactos_coordinacion_traslado=${legacyContact}`);
  const listing = await ok(base, { token: dts.token }); const legacyView = listing.items.find((c) => c.id === legacyContact); assert.equal(legacyView.telefono, '2025550123'); assert.equal(legacyView.pais ?? null, null);
  assert.equal((await call(`${base}/${legacyContact}`, { method: 'PUT', token: dts.token, body: { relacion: 'FAMILIAR_RESPONSABLE', nombre: 'Marta', telefono: '2025550123', version: legacyView.version }, expect: [400] })).data.motivo, 'PHONE_COUNTRY_REQUIRED');
  await ok(`${base}/${legacyContact}`, { method: 'PUT', token: dts.token, body: { relacion: 'FAMILIAR_RESPONSABLE', nombre: 'Marta', pais: 'US', telefono: '2025550123', version: legacyView.version } });
  assert.equal(one(`SELECT telefono_normalizado FROM contactos_coordinacion_traslado WHERE id_contactos_coordinacion_traslado=${legacyContact}`), '+12025550123');
  assert.equal(count('SELECT COUNT(*) FROM telefonos'), phonesBefore, 'un teléfono de coordinación jamás pasa a ser un contacto personal');
  assert.ok(sqlFails(`UPDATE contactos_coordinacion_traslado SET codigo_pais=N'us' WHERE id_contactos_coordinacion_traslado=${legacyContact}`), 'país en minúsculas');
  assert.ok(sqlFails(`UPDATE contactos_coordinacion_traslado SET telefono_normalizado=N'12025550123' WHERE id_contactos_coordinacion_traslado=${legacyContact}`), 'país informado sin E.164');
  pass('contactos de coordinación: mismas reglas por país, E.164 + país en SQL, equivalentes ambiguos, dato anterior editable sólo con país y sin tocar telefonos');

  // ---------- G. SQL Server rechaza lo que la aplicación no generaría ----------
  const row = phoneRows(p1)[0];
  assert.ok(sqlFails(`UPDATE telefonos SET codigo_pais=N'ar' WHERE id_telefonos=${row.id}`), 'país en minúsculas');
  assert.ok(sqlFails(`UPDATE telefonos SET codigo_pais=N'A1' WHERE id_telefonos=${row.id}`), 'país no alfabético');
  assert.ok(sqlFails(`UPDATE telefonos SET numero_normalizado=N'3815551234' WHERE id_telefonos=${row.id}`), 'país informado con número sin E.164');
  assert.ok(sqlFails(`UPDATE telefonos SET numero_normalizado=N'+0123456789' WHERE id_telefonos=${row.id}`), 'E.164 no puede empezar con 0');
  assert.ok(sqlFails(`UPDATE telefonos SET numero_normalizado=N'+54381555123456789' WHERE id_telefonos=${row.id}`), 'E.164 demasiado largo');
  assert.ok(sqlFails(`UPDATE telefonos SET numero_normalizado=N'+54 381 5551234' WHERE id_telefonos=${row.id}`), 'E.164 sin separadores');
  assert.ok(sqlFails(`INSERT INTO telefonos(id_personas,numero,numero_normalizado,codigo_pais,tipo_telefono,es_principal,fecha_creacion,fecha_actualizacion) VALUES(${p1},N'x',N'${row.e164}',N'${row.country}',N'PERSONAL',0,SYSUTCDATETIME(),SYSUTCDATETIME())`), 'el índice único vigente rechaza el mismo E.164');
  pass('SQL Server rechaza país en minúsculas o no alfabético, números que no son E.164 y el mismo E.164 vigente dos veces');

  // ---------- H. Auditoría e integridad ----------
  const values = lines(`SELECT CONCAT(ISNULL(valores_anteriores,''),ISNULL(valores_nuevos,'')) FROM eventos_auditoria WHERE tipo_entidad=N'PERSON_PHONE' AND id_usuario_actor IN (${u1.id},${u2.id},${u3.id})`).join('\n');
  assert.ok(/"pais":"AR"/.test(values) && /"pais":"PE"/.test(values), 'la auditoría registra el país');
  for (const full of ['+5493815551234', '5493815551234', '+56987654321', '987654321', '+12025550123', '2025550123', '3814445566', '+543814445566']) assert.ok(!values.includes(full), 'auditoría sin el número completo: ' + full);
  assert.equal(sql("DBCC CHECKCONSTRAINTS('telefonos') WITH NO_INFOMSGS").replace(/\s/g, ''), ''); assert.equal(sql("DBCC CHECKCONSTRAINTS('contactos_coordinacion_traslado') WITH NO_INFOMSGS").replace(/\s/g, ''), '');
  assert.equal(count('SELECT COUNT(*) FROM telefonos WHERE codigo_pais IS NULL'), legacyCount, 'los teléfonos anteriores siguen conservados');
  pass('auditoría con país y números enmascarados; restricciones válidas; datos anteriores conservados');
  console.log(`\nOK: ${passed} bloques aprobados`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
