/* Siembra de datos con el contrato V47 en la RESTAURACIÓN aislada del ensayo de migración V47 -> V55.
 * Se ejecuta contra un backend V47 (imagen release-v47) conectado únicamente a la base `vuelos_sanitarios_ensayo_v47` de la instancia E2E:
 * así los datos tienen la forma real de V47 (rutas con contexto, hangar, coordinaciones, documentos, bitácora, tripulación, vuelos iniciados
 * y finalizados) y la migración se prueba sobre ellos. Nunca apunta a la base habitual. Variables: E2E_BASE, E2E_DB_NAME, E2E_SQL_CONTAINER,
 * E2E_BACKEND_CONTAINER, E2E_FIXED_MARK y E2E_FIXED_PASSWORD (para volver a entrar con las mismas cuentas). Escribe el inventario en ENSAYO_STATE. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, MARK, PASSWORD, PDF, DB_NAME, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');

assert.equal(DB_NAME, 'vuelos_sanitarios_ensayo_v47', 'La siembra sólo corre sobre la restauración del ensayo');
assert.ok(process.env.E2E_BASE && process.env.E2E_BASE.includes(':18090'), 'E2E_BASE debe apuntar al backend V47 del ensayo (:18090)');
const STATE = process.env.ENSAYO_STATE;
const stateOf = (id) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);

(async () => {
  assert.equal(Number(one("SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL")), 47, 'la restauración debe estar en V47');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'sops'), ops2 = await createUser(admin, 'OPERACIONES', 'sops2'), dts = await createUser(admin, 'DTS', 'sdts');
  const names = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'], cmd = {};
  for (const n of names) { cmd[n] = await createUser(admin, 'COMANDANTE', 's' + n); await provision(admin, cmd[n]); }
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) {
    airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token });
    if (airports.length >= 3 && localities.length >= 2) { province = p; break; }
  }
  assert.ok(province, 'se requiere una provincia con tres aeropuertos y dos localidades');
  for (const n of names) await call(`/catalogs/commanders/${cmd[n].id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  let seq = 0;
  const plane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'S' + (++seq)).toUpperCase(), modelo: 'ENSAYO', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const at = (d, h) => fmt(new Date(d.getTime() + h * 3600000));
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const docType = (await ok('/catalogs/document-types', { token: ops.token }))[0].codigo;
  const flights = {};

  async function operational(key, commander) {
    const p = await plane(), when = futureSlot();
    const f = await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: `Ensayo ${key} ${MARK}`, aircraftId: p.id, comandanteId: commander.id, destinoId: airports[1].id, salida: fmt(when), llegada: at(when, 2) } });
    await call(`/flights/${f.id}/commander-assignment/response`, { method: 'POST', token: commander.token, body: { aceptar: true } });
    flights[key] = { id: f.id, kind: 'OPERATIVO', commander: commander.name, plane: p.id, when: fmt(when) };
    return f.id;
  }
  async function sanitary(key, commander) {
    const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Ensayo', apellido: key + MARK } });
    const when = futureSlot(), p = await plane();
    const id = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: `Ensayo sanitario ${key} ${MARK}`, fechaSolicitada: fmt(when), extremaUrgencia: false, medical: { diagnostico: 'Prueba', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
    await call(`/flights/${id}/schedule/accept`, { method: 'POST', token: ops.token });
    await call(`/flights/${id}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: p.id, comandanteId: commander.id } });
    await call(`/flights/${id}/operational-planning`, { method: 'POST', token: commander.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: at(when, 2) } });
    flights[key] = { id, kind: 'SANITARIO', commander: commander.name, plane: p.id, when: fmt(when) };
    return id;
  }
  const route = (id, who, body) => call(`/flights/${id}/route`, { method: 'PUT', token: who.token, body });

  // PLANIFICADOS con distintos estados de ruta (contrato V47: la ruta sólo se versiona, no se revisa)
  const P1 = await operational('P1_ruta_dos_versiones', cmd.c1); await route(P1, cmd.c1, { version: 0, recorrido: 'TUC - COR - AEP', altitudPies: 9000, distanciaNm: 640.5, tiempoEstimadoMinutos: 95, observaciones: 'Versión 1' }); await route(P1, cmd.c1, { version: 1, recorrido: 'TUC - COR - AEP (v2)', alternativoId: airports[2].id, altitudPies: 9500, distanciaNm: 640.5, tiempoEstimadoMinutos: 90 });
  const P2 = await operational('P2_sin_ruta', cmd.c2);
  const P3 = await sanitary('P3_sanitario_ruta_vigente', cmd.c3); await route(P3, cmd.c3, { version: 0, recorrido: 'Ruta sanitaria directa' });
  const P4 = await sanitary('P4_sanitario_ruta_desactualizada', cmd.c4); await route(P4, cmd.c4, { version: 0, recorrido: 'Ruta sanitaria previa al cambio' });
  await call(`/flights/${P4}/operational-planning`, { method: 'POST', token: cmd.c4.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: at(new Date(flights.P4_sanitario_ruta_desactualizada.when), 3) } }); // el contexto de la ruta queda desactualizado (REQUIERE_REVISION en V47)
  const P5 = await operational('P5_ruta_historica_sin_contexto', cmd.c5); await route(P5, cmd.c5, { version: 0, recorrido: 'Ruta anterior a V37' });
  // La ruta histórica de P5 se deja como las anteriores a V37: sin recorrido planificado, alternativo ni contexto operativo
  sql(`UPDATE rutas_vuelo SET recorrido_planificado=NULL, id_aeropuerto_alternativo=NULL, contexto_operativo=NULL WHERE id_vuelos=${P5}`);
  // información administrativa del vuelo P1: hangar, coordinación AA2000, clima, bitácora, tripulación adicional y documento
  await call(`/flights/${P1}/hangar`, { method: 'PUT', token: ops.token, body: { version: 0, requiereHangar: true, preparacionCompleta: false, observaciones: 'Hangar ensayo' } });
  await call(`/flights/${P1}/airport-coordinations`, { method: 'POST', token: ops.token, body: { version: 0, aeropuertoId: airports[0].id, finalidad: 'Despegue', descripcion: 'Coordinación de ensayo', estado: 'PENDIENTE' } });
  await call(`/flights/${P1}/weather`, { method: 'POST', token: cmd.c1.token, body: { condiciones: 'Despejado', favorable: true } });
  await call(`/flights/${P1}/log`, { method: 'POST', token: ops.token, body: { tipo: 'PREPARACION', descripcion: 'Preparación de ensayo ' + MARK, ocurrido: new Date(Date.now() - 60000).toISOString(), importancia: 'NORMAL' } });
  const form = new FormData(); form.append('documentTypeCode', docType); form.append('nombreDocumento', 'Documento ensayo ' + MARK); form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'ensayo.pdf');
  const up = await fetch(`${process.env.E2E_BASE}/flights/${P1}/documents/pdf`, { method: 'POST', headers: { Authorization: 'Bearer ' + ops.token }, body: form }); assert.equal(up.status, 200, 'carga de documento');

  // INICIADO y FINALIZADO (V47 no exige ruta para iniciar), con y sin ruta
  const E1 = await operational('E1_en_curso_con_ruta', cmd.c6); await route(E1, cmd.c6, { version: 0, recorrido: 'Ruta del vuelo en curso' }); await call(`/flights/${E1}/start`, { method: 'POST', token: ops.token });
  const E2 = await operational('E2_en_curso_ruta_historica', cmd.c7); await route(E2, cmd.c7, { version: 0, recorrido: 'Ruta histórica en curso' }); sql(`UPDATE rutas_vuelo SET recorrido_planificado=NULL, id_aeropuerto_alternativo=NULL, contexto_operativo=NULL WHERE id_vuelos=${E2}`);
  await call(`/flights/${E2}/start`, { method: 'POST', token: ops.token });
  const F1 = await operational('F1_finalizado_con_ruta', cmd.c8); await route(F1, cmd.c8, { version: 0, recorrido: 'Ruta del vuelo finalizado' }); await call(`/flights/${F1}/start`, { method: 'POST', token: ops.token }); await call(`/flights/${F1}/finish`, { method: 'POST', token: ops.token });
  // solicitud pendiente y cancelado
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Ensayo', apellido: 'Solicitud' + MARK } });
  const S1 = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Ensayo solicitud ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Prueba', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id; flights.S1_solicitado = { id: S1, kind: 'SANITARIO' };
  const X1 = await operational('X1_cancelado_con_ruta', cmd.c1); await route(X1, cmd.c1, { version: 0, recorrido: 'Ruta del vuelo cancelado' });
  const reason = (await ok('/catalogs/cancellation-reasons', { token: ops.token })).find((r) => r.codigo !== 'OTRO'); await call(`/flights/${X1}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id } });

  // contactos como los permitía V47 (V11): un correo y un teléfono duplicados por otra grafía y una persona con contactos pero sin ninguno principal
  // (se insertan por SQL porque la API de V47 ya los impide); ejercitan V49 (baja DUPLICADO_MIGRACION) y V50 (auditoría y promoción de principal)
  const personOf = (user) => one(`SELECT id_personas FROM usuarios WHERE nombre_usuario=N'${user.name}'`);
  const dupPerson = personOf(dts), noMainPerson = personOf(ops2);
  sql(`INSERT INTO correos_electronicos (direccion,tipo_correo_electronico,es_principal,fecha_creacion,fecha_actualizacion,id_personas) SELECT TOP 1 UPPER(direccion),tipo_correo_electronico,0,SYSDATETIME(),SYSDATETIME(),id_personas FROM correos_electronicos WHERE id_personas=${dupPerson} ORDER BY id_correos_electronicos`);
  sql(`INSERT INTO telefonos (numero,tipo_telefono,es_principal,fecha_creacion,fecha_actualizacion,id_personas) SELECT TOP 1 CONCAT(LEFT(numero,3),N' ',SUBSTRING(numero,4,30)),tipo_telefono,0,SYSDATETIME(),SYSDATETIME(),id_personas FROM telefonos WHERE id_personas=${dupPerson} ORDER BY id_telefonos`);
  sql(`UPDATE correos_electronicos SET es_principal=0 WHERE id_personas=${noMainPerson}; UPDATE telefonos SET es_principal=0 WHERE id_personas=${noMainPerson}`);
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${dupPerson}`), 2); assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${noMainPerson} AND es_principal=1`), 0);
  for (const [k, v] of Object.entries(flights)) v.estado = stateOf(v.id);
  const out = { mark: MARK, password: PASSWORD, users: { ops: ops.name, ops2: ops2.name, dts: dts.name, commanders: Object.fromEntries(names.map((n) => [n, cmd[n].name])) }, flights };
  if (STATE) fs.writeFileSync(STATE, JSON.stringify(out, null, 1));
  console.log('Sembrado V47 completo:', Object.entries(flights).map(([k, v]) => `${k}=${v.id}(${v.estado})`).join(', '));
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
