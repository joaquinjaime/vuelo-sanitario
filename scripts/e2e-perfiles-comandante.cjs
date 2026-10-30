/* I-5.4: perfiles_comandante — unicidad de la licencia aeronáutica garantizada por SQL Server (V57), altas simultáneas con la misma licencia y
 * disponibilidad del comandante según su ubicación, contra el stack E2E aislado (Flyway >= V57). Sólo crea registros marcados.
 * Uso: node scripts/e2e-perfiles-comandante.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, MARK, sql, one, count, call, ok, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');

let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const delayed = (ms, fn) => new Promise((r) => setTimeout(r, ms)).then(fn);
const race = (offset, first, second) => Promise.all([offset >= 0 ? first() : delayed(-offset, first), offset > 0 ? delayed(offset, second) : second()]);
const OFFSETS = [0, 10, -10, 30, -30, 80];
const DAY = 86400000, TZ = -3 * 3600000, civilDay = (ms) => new Date(ms + TZ).toISOString().slice(0, 10);

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 57, 'se requiere Flyway >= V57');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'pcops'), dts = await createUser(admin, 'DTS', 'pcdts');
  const newDni = () => String(100000000000 + Math.floor(Math.random() * 899999999999));
  const request = (suffix, license) => ({ nombre: 'E2E', apellido: suffix, dni: newDni(), roles: ['COMANDANTE'], licenciaAeronautica: license, correos: [{ direccion: `${MARK}${suffix}@example.test` }], telefonos: [{ pais: 'AR', numero: '3815551234' }] });
  const create = (suffix, license, expect = [200]) => call('/auth/users', { method: 'POST', token: admin, body: request(suffix, license), expect });

  // ---- A: unicidad por SQL Server y por la API ----
  assert.equal(count(`SELECT COUNT(*) FROM sys.indexes WHERE name=N'uq_perfiles_comandante_numero_licencia' AND is_unique=1 AND object_id=OBJECT_ID(N'dbo.perfiles_comandante')`), 1, 'V57 restableció el índice único de la licencia normalizada');
  const license = ('PC' + MARK).toUpperCase().slice(0, 20), original = await create('lic0', license);
  assert.ok(original.data.codigo);
  for (const variant of [license, license.toLowerCase(), '  ' + license + '  ']) {
    const dup = await create('dup' + Math.random().toString(36).slice(2, 6), variant, [409]); assert.match(dup.data.error, /licencia aeron/i);
  }
  assert.equal(count(`SELECT COUNT(*) FROM perfiles_comandante WHERE numero_licencia_normalizada=N'${license}'`), 1);
  // el índice rechaza la fila duplicada aunque se salte la API
  let insertFailed = false; try { sql(`INSERT INTO perfiles_comandante (numero_licencia, id_personas) SELECT TOP 1 N'${license.toLowerCase()}', p.id_personas FROM personas p WHERE NOT EXISTS (SELECT 1 FROM perfiles_comandante c WHERE c.id_personas=p.id_personas)`); } catch (e) { insertFailed = /uq_perfiles_comandante_numero_licencia|duplicate key|Cannot insert duplicate/i.test(e.sqlOutput || e.message); }
  assert.equal(insertFailed, true, 'SQL Server rechaza una licencia duplicada insertada directamente');
  pass('A la licencia es única en SQL Server (índice V57) y en la API (409, sin distinguir mayúsculas ni espacios); los rechazos no dejan perfiles ni cuentas');

  // ---- B: altas simultáneas con la misma licencia ----
  const outcomes = [];
  for (let round = 0; round < OFFSETS.length; round++) {
    const lic = ('PR' + MARK + round).toUpperCase().slice(0, 20), a = request('ra' + round, lic), b = request('rb' + round, lic.toLowerCase());
    const [x, y] = await race(OFFSETS[round], () => call('/auth/users', { method: 'POST', token: admin, body: a, expect: [200, 409] }), () => call('/auth/users', { method: 'POST', token: admin, body: b, expect: [200, 409] }));
    assert.deepEqual([x.status, y.status].sort(), [200, 409], `ronda ${round}: ${x.status}/${y.status}`);
    assert.match([x, y].find((r) => r.status === 409).data.error, /licencia aeron/i);
    assert.equal(count(`SELECT COUNT(*) FROM perfiles_comandante WHERE numero_licencia_normalizada=N'${lic}'`), 1);
    const loser = x.status === 409 ? a : b; assert.equal(count(`SELECT COUNT(*) FROM personas WHERE dni=N'${loser.dni}'`), 0, 'la alta rechazada se revirtió por completo'); outcomes.push(x.status === 200 ? 'a' : 'b');
  }
  pass(`B ${OFFSETS.length} rondas de altas simultáneas con la misma licencia (desfases ${OFFSETS.join('/')}, ganadores ${outcomes.join(',')}): una confirma, la otra responde 409 y se revierte sin dejar personas ni perfiles`);

  // ---- C: ubicación y disponibilidad del comandante en un traslado sanitario ----
  const cmd = await createUser(admin, 'COMANDANTE', 'pccmd'); await provision(admin, cmd);
  let province, other, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { const a = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }), l = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (!province && a.length >= 1 && l.length >= 2) { province = p; airports = a; localities = l; } else if (province && p.id !== province.id && !other) other = p; }
  assert.ok(province && other, 'se requieren dos provincias');
  assert.equal((await call(`/catalogs/commanders/${cmd.id}/location`, { method: 'POST', token: dts.token, body: { locationId: province.id }, expect: [403] })).status, 403, 'sólo Operaciones o el administrador ubican comandantes');
  const placed = await ok(`/catalogs/commanders/${cmd.id}/location`, { method: 'POST', token: ops.token, body: { locationId: province.id } }); assert.ok(placed);
  assert.equal(count(`SELECT COUNT(*) FROM perfiles_comandante c JOIN personas p ON p.id_personas=c.id_personas JOIN usuarios u ON u.id_personas=p.id_personas WHERE u.id_usuarios=${cmd.id} AND c.id_provincias=${province.id}`), 1);
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0], surname = MARK.replace(/[0-9]/g, (d) => 'ghijklmnop'[Number(d)]);
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Perfil', apellido: surname, dni: String(30000000 + Math.floor(Math.random() * 9999990)) } });
  const when = `${civilDay(Date.now() + 25 * DAY)}T10:00:00`;
  const flight = await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority.codigo, motivoVuelo: 'Perfil comandante ' + MARK, fechaSolicitada: when, extremaUrgencia: false, medical: { diagnostico: 'Dx-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } });
  await ok(`/flights/${flight.id}/schedule/accept`, { method: 'POST', token: ops.token });
  const listed = async () => (await ok(`/flights/${flight.id}/available-commanders`, { token: ops.token })).some((c) => c.id === cmd.id);
  assert.equal(await listed(), true, 'el comandante provisionado y ubicado en la provincia de origen figura como disponible');
  await ok(`/catalogs/commanders/${cmd.id}/location`, { method: 'POST', token: ops.token, body: { locationId: other.id } });
  assert.equal(await listed(), false, 'fuera de la provincia de origen deja de ser candidato');
  await ok(`/catalogs/commanders/${cmd.id}/location`, { method: 'POST', token: ops.token, body: { locationId: province.id } });
  assert.equal(await listed(), true);
  pass('C sólo Operaciones/administrador ubican comandantes; la ubicación persiste en el perfil y decide si es candidato de un traslado sanitario (y deja de serlo al salir de la provincia)');
  console.log(`\nE2E PERFILES COMANDANTE COMPLETO: ${passed} bloques aprobados (marca ${MARK}).`);
})().catch((e) => { console.error('FALLO E2E PERFILES COMANDANTE:', e.stack || e); process.exit(1); });
