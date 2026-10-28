/* Contactos laborales de la tripulación (I-2): API real sobre el stack aislado (vuelos_sanitarios_e2e, SQL Server real).
 * Verifica que Operaciones / Centro de Operaciones consulte desde el vuelo SÓLO los contactos LABORALES vigentes del comandante y la
 * tripulación vigente, que nadie más pueda, que los vuelos cerrados no lo permitan, que cada consulta se audite sin valores y que nada se
 * modifique (cuentas, contactos, vuelos históricos). Sólo crea registros marcados; nunca toca la base habitual. Uso: node scripts/e2e-contactos-tripulacion.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BASE, BACKEND, DB_NAME, MARK, PASSWORD, PDF, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy, verifyEmail } = require('./e2e-cierre-support.cjs');
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const HOUR = 3600000, DAY = 86400000, TZ = -3 * HOUR;
const civilDay = (ms) => new Date(ms + TZ).toISOString().slice(0, 10);
const lines = (q) => sql(q).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const stateOf = (id) => one(`SELECT ISNULL(e.codigo_estado_vuelo,'NULL') FROM vuelos v LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const raw = (p, o = {}) => call(p, { ...o, expect: [200, 204, 400, 401, 403, 404, 405, 409, 415, 500] });

async function provisionRole(admin, user, roleCode) {
  await call(`/crew-qualifications/${user.id}/${roleCode}`, { method: 'PUT', token: admin, expect: [204] });
  const credential = await ok(`/users/${user.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode, type: 'Documento de prueba', number: 'E2E-' + roleCode + '-' + user.id, issuer: 'Organismo de prueba', expires: null, noExpiry: true, notes: 'Pruebas aisladas' } });
  const form = new FormData(); form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf');
  const up = await fetch(`${BASE}/professional-credentials/${credential.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body: form });
  assert.equal(up.status, 200, 'carga de credencial');
  await call(`/professional-credentials/${credential.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual de datos de prueba', confirmsSufficiency: true } });
}

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'), 'el E2E sólo corre contra la base aislada');
  assert.equal(one('SELECT DB_NAME()'), DB_NAME);
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 54);
  const tablesBefore = count("SELECT COUNT(*) FROM sys.tables WHERE name NOT IN ('flyway_schema_history')");
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;

  // ---------- Fixtures ----------
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'cops'), ops2 = await createUser(admin, 'OPERACIONES', 'cops2'), dts = await createUser(admin, 'DTS', 'cdts');
  const cmd = await createUser(admin, 'COMANDANTE', 'ccmd'); await provision(admin, cmd);
  const med = await createUser(admin, 'DTS', 'cmed'), enf = await createUser(admin, 'DTS', 'cenf'), copi = await createUser(admin, 'DTS', 'ccopi'), enf2 = await createUser(admin, 'DTS', 'cenf2');
  await provisionRole(admin, med, 'MEDICO'); await provisionRole(admin, enf, 'ENFERMERO'); await provisionRole(admin, copi, 'COPILOTO'); await provisionRole(admin, enf2, 'ENFERMERO');
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { const a = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }), l = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (a.length >= 3 && l.length >= 2) { province = p; airports = a; localities = l; break; } }
  assert.ok(province);
  await call(`/catalogs/commanders/${cmd.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  let seq = 0;
  const newPlane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'C' + (++seq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 5, equipamientoMedico: 'Camilla', aeropuertoActualId: airports[0].id, activo: true } });
  const slot = () => { const d = futureSlot(); d.setHours(9, 0, 0, 0); return d; };
  const opFlight = async (commander) => { const d = slot(); const plane = await newPlane(); const f = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Contactos tripulación ' + MARK, aircraftId: plane.id, comandanteId: commander.id, destinoId: airports[1].id, salida: fmt(d), llegada: fmt(new Date(d.getTime() + 2 * HOUR)) } })).id; await ok(`/flights/${f}/commander-assignment/response`, { method: 'POST', token: commander.token, body: { aceptar: true } }); return f; };
  const crewList = (id) => ok(`/flights/${id}/crew`, { token: ops.token });
  const addCrew = (id, user, role) => call(`/flights/${id}/crew`, { method: 'POST', token: ops.token, body: { userId: user.id, crewRoleCode: role }, expect: [204] });
  const contactsOf = (id, token = ops.token) => raw(`/flights/${id}/crew/contacts`, { token });
  const views = (flightId) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'FLIGHT_CREW_CONTACT' AND operacion=N'VIEW'${flightId ? ` AND id_vuelos=${flightId}` : ''}`);
  const personOf = (u) => Number(one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${u.id}`));

  // contactos: createUser deja un correo y un teléfono PERSONALES (principales) en cada cuenta
  const phoneNew = (u, numero, tipo) => ok('/auth/me/telefonos', { method: 'POST', token: u.token, body: { pais: 'AR', numero, tipo } });
  // un correo nuevo nace sin verificar: Operaciones sólo lo ve después de confirmar el código recibido (bandeja de pruebas)
  const emailNew = async (u, direccion, tipo, verify = true) => { const r = await ok('/auth/me/correos', { method: 'POST', token: u.token, body: { direccion, tipo } }); if (verify) await verifyEmail(u, r.id, direccion); return r; };
  const P = {}; // números/correos propios de cada caso, para buscarlos en las respuestas
  P.cmdMail = MARK + 'cmd.trabajo@example.test'; P.cmdPhone = (await phoneNew(cmd, '381 600-0001', 'LABORAL')).valor; await emailNew(cmd, P.cmdMail, 'LABORAL');
  assert.equal(P.cmdPhone, '+54 381 600-0001', 'el teléfono se guarda y se devuelve en formato internacional');
  // med: sólo contactos personales (los de createUser) + uno personal adicional
  P.medPrivMail = MARK + 'med.privado@example.test'; P.medPrivPhone = (await phoneNew(med, '3816000002', 'PERSONAL')).valor; await emailNew(med, P.medPrivMail, 'PERSONAL', true);
  P.medPendMail = MARK + 'med.pendiente@example.test'; await emailNew(med, P.medPendMail, 'LABORAL', false);   // laboral SIN verificar: no debe entregarse
  // enf: ambos tipos, un laboral principal y otro no
  P.enfMail = MARK + 'enf.trabajo@example.test';
  P.enfPhone1 = (await phoneNew(enf, '3816000003', 'LABORAL')).valor; const enfP2 = await phoneNew(enf, '3816000004', 'LABORAL'); P.enfPhone2 = enfP2.valor; await emailNew(enf, P.enfMail, 'LABORAL'); P.enfPrivPhone = (await phoneNew(enf, '3816000005', 'PERSONAL')).valor;
  await call(`/auth/me/telefonos/${enfP2.id}/principal`, { method: 'POST', token: enf.token, expect: [200, 204] });
  // copi: sin contactos vigentes (la API impide quedarse sin contactos; se simula con las bajas lógicas que dejaría un registro histórico)
  const copiPerson = personOf(copi);
  sql(`UPDATE telefonos SET fecha_baja=SYSUTCDATETIME(), motivo_baja=N'RETIRO', es_principal=0, id_usuario_baja=${copi.id} WHERE id_personas=${copiPerson} AND fecha_baja IS NULL; UPDATE correos_electronicos SET fecha_baja=SYSUTCDATETIME(), motivo_baja=N'RETIRO', es_principal=0, id_usuario_baja=${copi.id} WHERE id_personas=${copiPerson} AND fecha_baja IS NULL`);
  // copi conserva un teléfono laboral ANTERIOR sin país (dato previo a V54): no se entrega ni se adivina el país, pero se informa que existe
  sql(`INSERT INTO telefonos(id_personas,numero,numero_normalizado,tipo_telefono,es_principal,fecha_creacion,fecha_actualizacion) VALUES(${copiPerson},N'381 600-0099',N'3816000099',N'LABORAL',1,SYSUTCDATETIME(),SYSUTCDATETIME())`);
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${copiPerson} AND fecha_baja IS NULL`), 0);
  // enf2: reemplazo con un contacto laboral propio
  P.enf2Phone = (await phoneNew(enf2, '3816000006', 'LABORAL')).valor;
  pass('fixtures: contactos laborales, personales, mixtos y ninguno');

  // ---------- Vuelo operativo con comandante y tripulación ----------
  const f = await opFlight(cmd);
  await addCrew(f, med, 'MEDICO'); await addCrew(f, enf, 'ENFERMERO'); await addCrew(f, copi, 'COPILOTO');
  const crew = await crewList(f);
  assert.equal(crew.filter((c) => c.vigente).length, 4, 'comandante (fila en vuelos_tripulantes) + 3');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${f} AND id_usuarios=${cmd.id} AND fecha_baja IS NULL`), 1);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${f} AND id_usuario_comandante=${cmd.id}`), 1, 'el comandante figura por las dos relaciones');

  const snapshot = () => ({
    identity: [cmd, med, enf, copi, ops, dts].map((u) => one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT u.hash_contrasena,u.estado_cuenta,u.esta_activo,u.version_credenciales,p.dni,p.nombre_persona,p.version_identidad FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE u.id_usuarios=${u.id} FOR JSON PATH)),2)`)),
    contacts: one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT (SELECT * FROM telefonos ORDER BY 1 FOR JSON PATH) t,(SELECT * FROM correos_electronicos ORDER BY 1 FOR JSON PATH) c FOR JSON PATH)),2)`),
    flights: one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT (SELECT * FROM vuelos ORDER BY 1 FOR JSON PATH) v,(SELECT * FROM vuelos_tripulantes ORDER BY 1 FOR JSON PATH) t FOR JSON PATH)),2)`),
    transfer: count('SELECT COUNT(*) FROM contactos_coordinacion_traslado'),
  });

  // ---------- A. Permisos ----------
  const before = snapshot();
  const auditBefore = views(); const eventsBefore = count('SELECT COUNT(*) FROM eventos_auditoria');
  const cmdToken = cmd.token;
  for (const [who, token, status] of [['DTS', dts.token, 403], ['comandante asignado', cmdToken, 403], ['administrador', admin, 403], ['anónimo', undefined, 401]]) {
    const r = token ? await contactsOf(f, token) : await raw(`/flights/${f}/crew/contacts`); assert.equal(r.status, status, who + ' → ' + status);
    assert.ok(!JSON.stringify(r.data || '').match(/\d{7}/), 'el rechazo no contiene datos');
  }
  assert.equal(views(), auditBefore, 'los rechazos no generan consultas auditadas');
  assert.equal(count('SELECT COUNT(*) FROM eventos_auditoria'), eventsBefore, 'ni otros eventos');
  assert.equal((await contactsOf(99999999)).status, 404, 'vuelo inexistente');
  assert.equal((await raw('/flights/abc/crew/contacts', { token: ops.token })).status >= 400, true);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.ok((await raw(`/flights/${f}/crew/contacts`, { method, token: ops.token, body: {} })).status >= 400, 'sin escritura: ' + method);
  for (const p of ['/crew/contacts', '/contacts', '/personas/1/contacts', '/persons/1/contacts', `/flights/${f}/contacts`]) assert.ok((await raw(p, { token: ops.token })).status >= 400, 'no existe un directorio ni una ruta por persona: ' + p);
  pass('permisos: DTS, comandante, administrador y anónimo rechazados sin auditoría ni datos; sin escritura ni rutas por persona');

  // ---------- B. Consulta autorizada: sólo laborales ----------
  const r1 = await contactsOf(f, ops.token); assert.equal(r1.status, 200);
  const res1 = r1.data;
  assert.equal(res1.vueloId, f); assert.equal(res1.tripulantes.length, 4, 'el comandante figura una vez');
  const byName = (res, user) => res.tripulantes.find((t) => t.nombre === 'E2E' && t.apellido === user.name.replace(MARK, ''));
  const mCmd = byName(res1, cmd), mMed = byName(res1, med), mEnf = byName(res1, enf), mCopi = byName(res1, copi);
  assert.ok(mCmd && mMed && mEnf && mCopi);
  assert.equal(res1.tripulantes[0].comandante, true, 'el comandante va primero');
  assert.equal(mCmd.funcionCode, 'COMANDANTE'); assert.equal(mMed.funcionCode, 'MEDICO');
  assert.deepEqual(mCmd.telefonos.map((t) => t.valor), [P.cmdPhone]); assert.deepEqual(mCmd.correos.map((t) => t.valor), [P.cmdMail]);
  assert.equal(mMed.estado, 'SIN_CONTACTO_LABORAL'); assert.deepEqual([mMed.telefonos, mMed.correos], [[], []]);
  assert.equal(mMed.correoLaboralSinVerificar, true, 'tiene un correo laboral sin verificar: no se entrega pero se informa'); assert.equal(mMed.telefonoLaboralSinValidar, false);
  assert.equal(mEnf.estado, 'DISPONIBLE'); assert.deepEqual(mEnf.telefonos.map((t) => t.valor), [P.enfPhone2, P.enfPhone1], 'el principal laboral primero, luego el más antiguo');
  assert.equal(mEnf.telefonos[0].principal, true, 'el laboral marcado principal por su titular'); assert.equal(mEnf.telefonos[1].principal, false);
  assert.deepEqual(mEnf.correos.map((t) => t.valor), [P.enfMail]);
  assert.equal(mCopi.estado, 'SIN_CONTACTO_LABORAL'); assert.deepEqual([mCopi.telefonos, mCopi.correos], [[], []]);
  assert.equal(mCopi.telefonoLaboralSinValidar, true, 'teléfono laboral anterior sin país: no se entrega pero se informa'); assert.equal(mCopi.correoLaboralSinVerificar, false);
  assert.ok(!JSON.stringify(res1).includes('3816000099') && !JSON.stringify(res1).includes('600-0099') && !JSON.stringify(res1).includes(P.medPendMail), 'ni el correo sin verificar ni el teléfono sin validar se entregan');
  assert.equal(JSON.stringify(mMed.telefonos) === JSON.stringify(mCopi.telefonos), true, 'sin contacto laboral: la misma respuesta para quien tiene sólo personales y para quien no tiene ninguno');
  const body1 = JSON.stringify(res1);
  // contra la verdad de SQL: todo contacto personal vigente de la tripulación está ausente, todo laboral vigente presente
  const crewPersons = [cmd, med, enf, copi].map(personOf).join(',');
  const personalValues = lines(`SELECT numero FROM telefonos WHERE id_personas IN (${crewPersons}) AND tipo_telefono=N'PERSONAL' AND fecha_baja IS NULL UNION SELECT direccion FROM correos_electronicos WHERE id_personas IN (${crewPersons}) AND tipo_correo_electronico=N'PERSONAL' AND fecha_baja IS NULL`);
  assert.ok(personalValues.length >= 6); for (const v of personalValues) assert.ok(!body1.includes(v), 'contacto personal expuesto: ' + v);
  const laboralValues = lines(`SELECT numero FROM telefonos WHERE id_personas IN (${crewPersons}) AND tipo_telefono=N'LABORAL' AND fecha_baja IS NULL AND codigo_pais IS NOT NULL UNION SELECT direccion FROM correos_electronicos WHERE id_personas IN (${crewPersons}) AND tipo_correo_electronico=N'LABORAL' AND fecha_baja IS NULL AND fecha_verificacion IS NOT NULL`);
  assert.equal(laboralValues.length, 5); for (const v of laboralValues) assert.ok(body1.includes(v), 'falta el laboral vigente ' + v);
  // minimización
  const dnis = lines(`SELECT dni FROM personas WHERE id_personas IN (${crewPersons})`);
  for (const secret of [...dnis, cmd.name, med.name, 'hash', 'token', 'activacion', 'roles', 'password']) assert.ok(!body1.toLowerCase().includes(String(secret).toLowerCase()), 'dato interno expuesto: ' + secret);
  assert.deepEqual(Object.keys(res1).sort(), ['tripulantes', 'vueloCodigo', 'vueloId']);
  assert.deepEqual(Object.keys(mCmd).sort(), ['apellido', 'asignacionId', 'comandante', 'correoLaboralSinVerificar', 'correos', 'estado', 'funcion', 'funcionCode', 'hayMasContactos', 'nombre', 'telefonoLaboralSinValidar', 'telefonos']);
  const raw1 = await fetch(BASE + `/flights/${f}/crew/contacts`, { headers: { Authorization: 'Bearer ' + ops.token } });
  assert.match(raw1.headers.get('cache-control') || '', /no-store/);
  // el segundo rol operativo también consulta
  assert.equal((await contactsOf(f, ops2.token)).status, 200);
  pass('consulta: sólo contactos laborales vigentes, selección determinista, personales ausentes, respuesta mínima, sin caché');

  // ---------- C. Auditoría ----------
  assert.equal(views(f), 3, 'tres consultas autorizadas (dos de Centro de Operaciones, una de Operaciones), tres eventos');
  const ev = lines(`SELECT CONCAT(u.nombre_usuario,'|',e.operacion,'|',e.tipo_entidad,'|',ISNULL(CAST(e.entidad_id AS varchar),'NULL'),'|',ISNULL(e.valores_anteriores,'NULL'),'|',e.valores_nuevos) FROM eventos_auditoria e JOIN usuarios u ON u.id_usuarios=e.id_usuario_actor WHERE e.id_vuelos=${f} AND e.tipo_entidad=N'FLIGHT_CREW_CONTACT' ORDER BY e.id_eventos_auditoria`);
  assert.equal(ev.length, 3);
  const shown = mCmd.telefonos.length + mCmd.correos.length + mEnf.telefonos.length + mEnf.correos.length; assert.equal(shown, 5);
  assert.equal(ev[0], `${ops.name}|VIEW|FLIGHT_CREW_CONTACT|NULL|NULL|{"tripulantes":4,"contactos":5,"sinContactoLaboral":2}`);
  assert.ok(ev[1].startsWith(ops.name + '|VIEW|') && ev[2].startsWith(ops2.name + '|VIEW|'));
  const auditText = lines(`SELECT CONCAT(ISNULL(valores_anteriores,''),valores_nuevos) FROM eventos_auditoria WHERE tipo_entidad=N'FLIGHT_CREW_CONTACT'`).join('\n');
  for (const v of [...laboralValues, ...personalValues, ...dnis]) assert.ok(!auditText.includes(v), 'la auditoría guarda un valor: ' + v);
  // visible para administración (y con la etiqueta en español), no para Operaciones
  const feed = await ok(`/audit?entityType=FLIGHT_CREW_CONTACT&flightId=${f}`, { token: admin });
  assert.equal(feed.total, 3); assert.ok(feed.items.every((e) => e.tipoEntidad === 'Contactos laborales de la tripulación' || /Contactos laborales/.test(JSON.stringify(e))));
  assert.ok(!JSON.stringify(feed).match(/3816000\d{3}/), 'la auditoría de administración no trae números');
  assert.equal((await raw(`/audit?entityType=FLIGHT_CREW_CONTACT`, { token: ops.token })).status, 403);
  const timeline = await raw(`/audit/flights/${f}`, { token: ops.token });
  assert.ok(timeline.status === 200 && !JSON.stringify(timeline.data).includes('FLIGHT_CREW_CONTACT'), 'la línea de tiempo de Operaciones no incluye las consultas de contactos');
  pass('auditoría: un evento VIEW por consulta autorizada, con usuario, vuelo y cantidades; sin valores; sólo visible para administración');

  // ---------- D. Cambios en la tripulación y en los contactos ----------
  const medRow = crew.find((c) => c.userId === med.id); const enfRow = crew.find((c) => c.userId === enf.id);
  // reemplazo: enf → enf2
  await call(`/flights/${f}/crew/${enfRow.id}`, { method: 'PUT', token: ops.token, body: { userId: enf2.id, crewRoleCode: 'ENFERMERO' }, expect: [204] });
  const r2 = (await contactsOf(f)).data; const b2 = JSON.stringify(r2);
  assert.ok(!b2.includes(P.enfPhone1) && !b2.includes(P.enfMail), 'el reemplazado ya no figura'); assert.ok(b2.includes(P.enf2Phone), 'el nuevo figura según su asignación actual');
  assert.equal(r2.tripulantes.length, 4);
  // retiro: med
  await call(`/flights/${f}/crew/${medRow.id}`, { method: 'DELETE', token: ops.token, expect: [204] });
  const r3 = (await contactsOf(f)).data; assert.equal(r3.tripulantes.length, 3); assert.ok(!JSON.stringify(r3).includes('"nombre":"E2E","apellido":"' + med.name.replace(MARK, '') + '"'));
  assert.equal(count(`SELECT COUNT(*) FROM telefonos WHERE id_personas=${personOf(med)} AND fecha_baja IS NULL`) >= 2, true, 'los contactos del retirado no se tocan');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${f}`), 5, 'el historial de la tripulación se conserva');
  // el titular cambia sus contactos: se refleja de inmediato (no hay copias)
  const newMail = MARK + 'cmd.nuevo@example.test'; await emailNew(cmd, newMail, 'LABORAL');
  assert.ok(JSON.stringify((await contactsOf(f)).data).includes(newMail));
  const cmdPhones = (await ok('/auth/me', { token: cmd.token })).telefonos; const cmdLab = cmdPhones.find((t) => t.valor === P.cmdPhone);
  await call(`/auth/me/telefonos/${cmdLab.id}`, { method: 'PUT', token: cmd.token, body: { pais: 'AR', numero: P.cmdPhone, tipo: 'PERSONAL', version: cmdLab.version } });
  const r4 = JSON.stringify((await contactsOf(f)).data); assert.ok(!r4.includes(P.cmdPhone), 'reclasificado como personal: deja de verse');
  const cmdPhone2 = (await ok('/auth/me', { token: cmd.token })).correos.find((t) => t.valor === newMail);
  await call(`/auth/me/correos/${cmdPhone2.id}`, { method: 'DELETE', token: cmd.token, expect: [200, 204] });
  assert.ok(!JSON.stringify((await contactsOf(f)).data).includes(newMail), 'retirado lógicamente: deja de verse');
  assert.ok(count(`SELECT COUNT(*) FROM correos_electronicos WHERE direccion=N'${newMail}' AND fecha_baja IS NOT NULL`) === 1, 'baja lógica: la fila se conserva');
  // la baja de la cuenta del tripulante está bloqueada mientras participa de un vuelo abierto (regla real de responsabilidades)
  assert.equal((await raw(`/auth/users/${enf2.id}/deactivate`, { method: 'PATCH', token: admin, body: {} })).status, 409);
  pass('cambios: reemplazo y retiro se reflejan al instante; los contactos del titular no se copian ni se tocan; alta/reclasificación/baja se ven de inmediato');

  // ---------- E. Identificadores manipulados: sólo la tripulación del vuelo consultado ----------
  const g = await opFlight((await (async () => { const c2 = await createUser(admin, 'COMANDANTE', 'ccmd2'); await provision(admin, c2); await call(`/catalogs/commanders/${c2.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token }); P.cmd2Phone = (await phoneNew(c2, '3816000007', 'LABORAL')).valor; return c2; })()));
  const rg = JSON.stringify((await contactsOf(g)).data); assert.ok(rg.includes(P.cmd2Phone) && !rg.includes(P.enf2Phone));
  const rf = JSON.stringify((await raw(`/flights/${f}/crew/contacts?personaId=1&userId=${cmd.id}&vueloId=${g}&crewId=1`, { token: ops.token })).data);
  assert.ok(rf.includes(P.enf2Phone) && !rf.includes(P.cmd2Phone), 'los parámetros no amplían el alcance');
  pass('identificadores y parámetros manipulados no amplían el alcance');

  // ---------- F. Estados: vuelos cerrados, replanificables y solicitudes sanitarias ----------
  const h = await opFlight(cmd); const reasons = await ok('/catalogs/cancellation-reasons', { token: ops.token }); const reason = reasons.find((r) => r.codigo !== 'OTRO');
  assert.equal((await contactsOf(h)).status, 200);
  await ok(`/flights/${h}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id } }); assert.equal(stateOf(h), 'CANCELADO');
  const closed = await contactsOf(h); assert.equal(closed.status, 409); assert.equal(closed.data.code, 'CREW_CONTACTS_CLOSED'); assert.ok(!JSON.stringify(closed.data).includes(P.cmdMail));
  assert.equal(views(h), 1, 'sólo la consulta previa al cierre; el rechazo no se audita');
  // vuelo en curso (aún comprometido) sí; finalizado no
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Contactos', apellido: 'Tripulacion' + MARK, dni: String(20000000 + Math.floor(Math.random() * 9999999)) } });
  const sanitary = async (days) => (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Traslado ' + MARK, fechaSolicitada: `${civilDay(Date.now() + days * DAY)}T10:00:00`, extremaUrgencia: false, medical: { diagnostico: 'Dx ' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  const s1 = await sanitary(300 + Math.floor(Math.random() * 50));
  const open = await contactsOf(s1); assert.equal(open.status, 200); assert.equal(open.data.tripulantes.length, 0, 'solicitud sanitaria abierta sin tripulación asignada: lista vacía');
  const s2 = await sanitary(360 + Math.floor(Math.random() * 50));
  await ok(`/flights/${s2}/evaluation`, { method: 'POST', token: ops.token, body: { aprobar: false, motivoCancelacionId: reason.id } });
  const rejected = await contactsOf(s2); assert.equal(rejected.status, 409, 'solicitud rechazada (' + stateOf(s2) + ')'); assert.equal(rejected.data.code, 'CREW_CONTACTS_CLOSED');
  assert.equal(views(s2), 0);
  pass('estados: vuelo cancelado y solicitud rechazada rechazan con 409 sin auditar; solicitud abierta sin tripulación devuelve lista vacía');

  // ---------- G. Integridad e invariantes ----------
  const after = snapshot();
  assert.equal(after.transfer, before.transfer, 'los contactos de coordinación del traslado no se usan ni se alteran');
  assert.deepEqual(after.identity, before.identity, 'cuentas, hashes, roles y versiones intactos');
  assert.equal(count("SELECT COUNT(*) FROM sys.tables WHERE name NOT IN ('flyway_schema_history')"), tablesBefore, 'sin tablas nuevas');
  assert.equal(count("SELECT COUNT(*) FROM flyway_schema_history WHERE version IS NOT NULL AND CAST(version AS int)>58"), 0, 'sin migraciones nuevas de contactos (V55 rutas, V56 índices, V57 licencia única y V58 clasificaciones no tocan contactos)');
  assert.equal(sql("DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS, NO_INFOMSGS").replace(/s/g, ''), '', 'DBCC CHECKCONSTRAINTS limpio');
  // los contactos sólo cambiaron por las acciones de sus titulares (fixtures y sección D), nunca por una consulta
  const c0 = snapshot().contacts; for (let i = 0; i < 3; i++) await contactsOf(f); assert.equal(snapshot().contacts, c0, 'consultar no modifica contactos');
  const f0 = snapshot().flights; await contactsOf(g); assert.equal(snapshot().flights, f0, 'consultar no modifica vuelos ni tripulación');
  // un vuelo histórico (cancelado) conserva su estado y su tripulación tras todas las consultas
  assert.equal(stateOf(h), 'CANCELADO'); assert.ok(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${h}`) >= 1);
  pass('integridad: sin tablas ni migraciones nuevas, cuentas y vuelos intactos, restricciones válidas');
  console.log(`\nOK: ${passed} bloques aprobados`);
})().catch((e) => { console.error(e); process.exit(1); });
