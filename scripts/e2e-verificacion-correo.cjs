/* Verificación de correos (V54): API real, SQL Server real y una bandeja de pruebas SMTP (Mailpit) en el stack aislado.
 * Comprueba el recorrido completo (alta → mensaje en la bandeja → código → confirmación → estado en SQL), la seguridad del código (sólo su HMAC,
 * un solo uso, vencimiento con el reloj ajustable, intentos, reemplazo, límites de envío, contactos ajenos), la conservación del correo
 * verificado durante un cambio, el fallo real del servidor SMTP (se pausa la bandeja: el servidor no responde), la persistencia tras reiniciar el backend y la
 * concurrencia. La bandeja es un transporte controlado: NO prueba entrega a un proveedor externo. Sólo toca el stack aislado.
 * Uso: node scripts/e2e-verificacion-correo.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, DB_NAME, MARK, sleep, sql, one, count, call, ok, createUser, waitHealthy, MAILBOX, mailboxMessages, mailboxCode, confirmEmail } = require('./e2e-cierre-support.cjs');
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const lines = (q) => sql(q).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const sqlFails = (q) => { try { sql(q); return false; } catch { return true; } };
const MAILBOX_CONTAINER = process.env.E2E_MAILBOX_CONTAINER || 'vuelos-sanitarios-e2e-mailbox-1';

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'), 'sólo la base aislada');
  assert.equal(env.MAIL_HOST, 'mailbox', 'el backend E2E envía a la bandeja de pruebas, no a un proveedor real');
  assert.equal(one('SELECT DB_NAME()'), DB_NAME);
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 54);
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const clock = (body) => ok('/e2e/clock', { method: 'PUT', token: admin, body });
  const secrets = [];   // todos los códigos emitidos en esta ejecución: no pueden aparecer en ningún lado
  const personOf = (u) => Number(one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${u.id}`));
  const identity = (u) => one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT u.hash_contrasena,u.estado_cuenta,u.esta_activo,u.version_credenciales,p.dni,p.version_identidad,(SELECT STRING_AGG(r.codigo_rol,',') WITHIN GROUP(ORDER BY r.codigo_rol) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=u.id_usuarios) roles FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE u.id_usuarios=${u.id} FOR JSON PATH)),2)`);
  const tok = (emailId) => lines(`SELECT CONCAT(id_verificaciones_correo,'|',intentos_fallidos,'|',ISNULL(motivo_invalidacion,'-'),'|',IIF(fecha_uso IS NULL,0,1),'|',IIF(fecha_envio IS NULL,0,1),'|',IIF(fecha_invalidacion IS NULL AND fecha_uso IS NULL,1,0)) FROM verificaciones_correo WHERE id_correos_electronicos=${emailId} ORDER BY id_verificaciones_correo`).map((r) => { const [id, attempts, reason, used, sent, open] = r.split('|'); return { id: Number(id), attempts: Number(attempts), reason, used: used === '1', sent: sent === '1', open: open === '1' }; });
  const verified = (emailId) => count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_correos_electronicos=${emailId} AND fecha_verificacion IS NOT NULL`) === 1;
  const audits = (emailId, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'PERSON_EMAIL' AND entidad_id=${emailId} AND operacion=N'${op}'`);
  const addMail = (u, address, extra = {}) => ok('/auth/me/correos', { method: 'POST', token: u.token, body: { direccion: address, ...extra } });
  const confirm = (u, id, code, expect = [200]) => call(`/auth/me/correos/${id}/verificacion/confirmar`, { method: 'POST', token: u.token, body: { codigo: code }, expect });
  const resend = (u, id, expect = [200]) => call(`/auth/me/correos/${id}/verificacion`, { method: 'POST', token: u.token, expect });
  const codeOf = async (address, after = 0) => { const r = await mailboxCode(address, { after }); secrets.push(r.code); return r.code; };

  // ---------- A. Esquema V54 y datos anteriores ----------
  assert.equal(one("SELECT CAST(success AS int) FROM flyway_schema_history WHERE version='54'"), '1');
  assert.equal(count("SELECT COUNT(*) FROM sys.tables WHERE name='verificaciones_correo'"), 1);
  assert.equal(count("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('correos_electronicos') AND name='fecha_verificacion'"), 1);
  assert.equal(count("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('telefonos') AND name='codigo_pais'"), 1);
  assert.equal(count("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('contactos_coordinacion_traslado') AND name='codigo_pais'"), 1);
  assert.equal(count("SELECT COUNT(*) FROM sys.indexes WHERE name='uq_verificaciones_correo_abierta' AND is_unique=1 AND filter_definition LIKE '%fecha_uso%IS NULL%fecha_invalidacion%IS NULL%'"), 1);
  for (const c of ['ck_verificaciones_correo_cierre', 'ck_verificaciones_correo_vigencia', 'ck_telefonos_validacion_internacional', 'ck_contactos_coordinacion_traslado_validacion_internacional']) assert.equal(count(`SELECT COUNT(*) FROM sys.check_constraints WHERE name='${c}'`), 1, c);
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos c WHERE c.fecha_verificacion IS NOT NULL AND NOT EXISTS (SELECT 1 FROM verificaciones_correo v WHERE v.id_correos_electronicos=c.id_correos_electronicos AND v.fecha_uso IS NOT NULL)`), 0, 'ningún correo figura verificado sin un código confirmado');
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos e JOIN personas p ON p.id_personas=e.id_personas JOIN usuarios u ON u.id_personas=p.id_personas WHERE u.nombre_usuario=N'${dotenv.BOOTSTRAP_ADMIN_USERNAME}' AND e.fecha_verificacion IS NOT NULL`), 0, 'el correo del administrador inicial se conserva sin verificar');
  pass('V54: esquema, índice filtrado de una verificación abierta, restricciones y correos anteriores sin verificar');

  const u1 = await createUser(admin, 'DTS', 'vc1'), u2 = await createUser(admin, 'DTS', 'vc2');
  const identityBefore = identity(u1);
  const legacy = (await ok('/auth/me', { token: u1.token })).correos[0];
  assert.equal(legacy.verificacion, 'SIN_VERIFICAR'); assert.equal(legacy.principal, true);

  // ---------- B. Recorrido completo ----------
  const addr = `verif.${MARK}@example.test`;
  const created = await addMail(u1, addr, { tipo: 'LABORAL' });
  assert.equal(created.envio, 'ENVIADO'); assert.equal(created.verificacion, 'PENDIENTE'); assert.equal(created.principal, false);
  assert.equal(verified(created.id), false, 'registrar no verifica');
  const t1 = tok(created.id); assert.equal(t1.length, 1); assert.ok(t1[0].open && t1[0].sent && t1[0].attempts === 0);
  assert.equal(count(`SELECT COUNT(*) FROM verificaciones_correo WHERE id_correos_electronicos=${created.id} AND LEN(codigo_hash)=64 AND DATEDIFF(MINUTE,fecha_creacion,fecha_vencimiento)=30 AND direccion_normalizada=N'${addr}'`), 1);
  const mail1 = await mailboxCode(addr); secrets.push(mail1.code);
  assert.equal(mail1.count, 1);
  assert.equal(mail1.message.From.Address, 'no-reply@vuelos-e2e.test'); assert.match(mail1.message.Subject, /Código para verificar su correo/);
  assert.match(mail1.message.Text, /Vence en 30 minutos y sólo puede usarse una vez/);
  assert.ok(!/DNI|contrase|usuario/i.test(mail1.message.Text.replace('Vuelos Sanitarios', '')), 'el mensaje no lleva datos personales');
  assert.equal(count(`SELECT COUNT(*) FROM verificaciones_correo WHERE codigo_hash LIKE N'%${mail1.code.replace('-', '')}%'`), 0, 'el código no se guarda en claro');
  assert.equal(audits(created.id, 'VERIFY_REQUEST'), 1);
  assert.ok((await ok('/auth/me', { token: u1.token })).correos.find((c) => c.id === created.id).verificacion === 'PENDIENTE');
  // contactos ajenos y accesos indebidos: no consumen intentos ni confirman
  for (const [who, token, status] of [['otro titular', u2.token, 404], ['administrador', admin, 404], ['anónimo', undefined, 401]]) {
    const r = await call(`/auth/me/correos/${created.id}/verificacion/confirmar`, { method: 'POST', token, body: { codigo: mail1.code }, expect: [status] });
    assert.equal(r.status, status, who);
  }
  assert.equal((await call(`/auth/me/correos/${created.id}/verificacion`, { method: 'POST', token: u2.token, expect: [404] })).status, 404);
  assert.equal(verified(created.id), false); assert.equal(tok(created.id)[0].attempts, 0);
  const wrong = await confirm(u1, created.id, 'AAAA-AAAA', [400]); assert.equal(wrong.data.code, 'VERIFICATION_CODE_INVALID'); assert.equal(wrong.data.intentosRestantes, 4);
  assert.equal(tok(created.id)[0].attempts, 1, 'el intento fallido queda persistido aunque la respuesta sea un error');
  assert.equal((await call(`/auth/me/correos/${created.id}/verificacion/confirmar`, { method: 'POST', token: u1.token, body: { codigo: mail1.code, verificado: true }, expect: [400] })).status, 400, 'campos desconocidos rechazados');
  const done = await confirm(u1, created.id, mail1.code.toLowerCase().replace('-', ' '));
  assert.equal(done.data.verificacion, 'VERIFICADO'); assert.ok(verified(created.id));
  assert.equal(tok(created.id)[0].used, true); assert.equal(tok(created.id)[0].open, false);
  assert.equal(audits(created.id, 'VERIFY_CONFIRM'), 1);
  assert.equal((await confirm(u1, created.id, mail1.code, [409])).data.code, 'EMAIL_ALREADY_VERIFIED', 'un solo uso');
  assert.equal((await resend(u1, created.id, [409])).data.code, 'EMAIL_ALREADY_VERIFIED');
  assert.equal((await mailboxMessages(addr)).length, 1, 'un correo verificado no recibe más códigos');
  pass('recorrido: alta → mensaje en la bandeja → código → confirmación; sólo el HMAC en SQL; ajenos 404/401 sin consumir intentos; un solo uso');

  // ---------- C. Intentos agotados ----------
  const lockAddr = `bloqueo.${MARK}@example.test`; const lockMail = await addMail(u1, lockAddr);
  const lockCode = await codeOf(lockAddr);
  for (let i = 0; i < 4; i++) assert.equal((await confirm(u1, lockMail.id, 'BBBB-BBBB', [400])).data.intentosRestantes, 4 - i);
  const locked = await confirm(u1, lockMail.id, 'BBBB-BBBB', [429]); assert.equal(locked.data.code, 'VERIFICATION_LOCKED');
  assert.equal(tok(lockMail.id)[0].reason, 'AGOTADO'); assert.equal(tok(lockMail.id)[0].attempts, 5); assert.equal(audits(lockMail.id, 'VERIFY_LOCKED'), 1);
  assert.equal((await confirm(u1, lockMail.id, lockCode, [409])).data.code, 'VERIFICATION_NOT_REQUESTED', 'ni siquiera el código correcto del token agotado');
  assert.equal(verified(lockMail.id), false);
  await sleep(2300); await resend(u1, lockMail.id);
  const lockCode2 = await codeOf(lockAddr, 1); assert.notEqual(lockCode2, lockCode);
  await confirm(u1, lockMail.id, lockCode2); assert.ok(verified(lockMail.id));
  pass('cinco errores bloquean el código (persistido y auditado); sólo uno nuevo permite verificar');

  // ---------- D. Reenvío y límites ----------
  const rlAddr = `limite.${MARK}@example.test`; const rl = await addMail(u1, rlAddr);
  const c1 = await codeOf(rlAddr);
  const tooSoon = await resend(u1, rl.id, [429]); assert.equal(tooSoon.data.code, 'VERIFICATION_RATE_LIMIT'); assert.ok(tooSoon.data.reintentoEnSegundos >= 1);
  assert.equal((await mailboxMessages(rlAddr)).length, 1, 'el rechazo por frecuencia no envía nada');
  assert.ok(audits(rl.id, 'VERIFY_RATE_LIMITED') >= 1);
  await sleep(2300); const r2 = await resend(u1, rl.id); assert.equal(r2.data.envio, 'ENVIADO');
  const c2 = await codeOf(rlAddr, 1); assert.notEqual(c1, c2);
  assert.equal((await confirm(u1, rl.id, c1, [400])).data.code, 'VERIFICATION_CODE_INVALID', 'el código anterior quedó reemplazado');
  assert.equal(tok(rl.id).filter((t) => t.open).length, 1, 'una sola verificación abierta'); assert.ok(tok(rl.id).some((t) => t.reason === 'REEMPLAZADO'));
  for (let i = 3; i <= 5; i++) { await sleep(2300); await resend(u1, rl.id); }
  await sleep(2300); assert.equal((await resend(u1, rl.id, [429])).data.code, 'VERIFICATION_RATE_LIMIT', 'máximo 5 mensajes por correo y día');
  assert.equal((await mailboxMessages(rlAddr)).length, 5); assert.equal(tok(rl.id).length, 5);
  assert.equal(audits(rl.id, 'VERIFY_REQUEST'), 1); assert.equal(audits(rl.id, 'VERIFY_RESEND'), 4);
  pass('reenvío: intervalo mínimo, código anterior invalidado, una sola verificación abierta y límite diario por correo');

  // ---------- E. Vencimiento con el reloj ajustable ----------
  const exAddr = `vence.${MARK}@example.test`; const ex = await addMail(u1, exAddr); const exCode = await codeOf(exAddr);
  try {
    await clock({ advanceSeconds: 31 * 60 });
    assert.equal((await ok('/auth/me', { token: u1.token })).correos.find((c) => c.id === ex.id).verificacion, 'EXPIRADO');
    assert.equal((await confirm(u1, ex.id, exCode, [409])).data.code, 'VERIFICATION_EXPIRED');
  } finally { await clock({ reset: true }); }
  assert.equal(tok(ex.id)[0].reason, 'VENCIDO'); assert.equal(verified(ex.id), false); assert.equal(audits(ex.id, 'VERIFY_EXPIRED'), 1);
  await sleep(2300); await resend(u1, ex.id); await confirm(u1, ex.id, await codeOf(exAddr, 1)); assert.ok(verified(ex.id));
  pass('un código vencido se rechaza (reloj ajustable), queda registrado y puede reemplazarse');

  // ---------- F. Reemplazo de un correo verificado ----------
  const oldVerified = created.id;   // verificado en B, tipo LABORAL
  const nextAddr = `nuevo.${MARK}@example.test`; const next = await addMail(u1, nextAddr); await codeOf(nextAddr);
  // el principal sigue siendo el original sin verificar de createUser, el nuevo no puede serlo mientras está pendiente
  assert.equal((await call(`/auth/me/correos/${next.id}/principal`, { method: 'POST', token: u1.token, expect: [409] })).data.code, 'EMAIL_NOT_VERIFIED');
  assert.equal((await call(`/auth/me/correos/${oldVerified}`, { method: 'PUT', token: u1.token, body: { direccion: nextAddr.replace('nuevo', 'otro'), tipo: 'LABORAL', version: Number(one(`SELECT version_contacto FROM correos_electronicos WHERE id_correos_electronicos=${oldVerified}`)) }, expect: [409] })).data.code, 'EMAIL_VERIFIED_IMMUTABLE');
  assert.equal(one(`SELECT direccion FROM correos_electronicos WHERE id_correos_electronicos=${oldVerified}`), addr);
  await confirmEmail(u1, legacy.id, legacy.valor);   // el correo original también queda verificado y es el principal
  await call(`/auth/me/correos/${next.id}`, { method: 'PUT', token: u1.token, body: { direccion: `cambiado.${MARK}@example.test`, tipo: 'PERSONAL', version: Number(one(`SELECT version_contacto FROM correos_electronicos WHERE id_correos_electronicos=${next.id}`)) } });
  assert.equal(tok(next.id).filter((t) => t.open).length, 0); assert.ok(tok(next.id).some((t) => t.reason === 'CORREO_MODIFICADO'), 'cambiar la dirección invalida el código abierto');
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_correos_electronicos IN (${oldVerified},${legacy.id}) AND fecha_verificacion IS NOT NULL`), 2, 'los correos verificados conservan su estado durante el cambio');
  await confirmEmail(u1, next.id, `cambiado.${MARK}@example.test`);
  await call(`/auth/me/correos/${next.id}/principal`, { method: 'POST', token: u1.token });
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${personOf(u1)} AND es_principal=1 AND fecha_baja IS NULL`), 1);
  assert.equal(count(`SELECT es_principal FROM correos_electronicos WHERE id_correos_electronicos=${next.id}`), 1);
  await call(`/auth/me/correos/${oldVerified}`, { method: 'DELETE', token: u1.token });
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_correos_electronicos=${oldVerified} AND fecha_baja IS NOT NULL AND fecha_verificacion IS NOT NULL`), 1, 'el retirado conserva su verificación como historial');
  assert.ok(audits(next.id, 'SET_PRIMARY') >= 1);
  // el único correo verificado no se retira dejando sólo correos sin verificar
  const onlyAddr = `solo.${MARK}@example.test`; const u3 = await createUser(admin, 'DTS', 'vc3');
  const u3mail = (await ok('/auth/me', { token: u3.token })).correos[0]; await confirmEmail(u3, u3mail.id, u3mail.valor);
  await addMail(u3, onlyAddr);
  assert.equal((await call(`/auth/me/correos/${u3mail.id}`, { method: 'DELETE', token: u3.token, expect: [409] })).data.code, 'LAST_VERIFIED_EMAIL');
  pass('reemplazo: el verificado no se sobrescribe ni se retira antes de confirmar el nuevo; el principal cambia sólo después de verificar; el historial se conserva');

  // ---------- G. Fallo real del servidor SMTP ----------
  let failMail;
  try {
    assert.equal(spawnSync('docker', ['pause', MAILBOX_CONTAINER], { encoding: 'utf8' }).status, 0);
    const failAddr = `falla.${MARK}@example.test`;
    failMail = await addMail(u1, failAddr);
    assert.equal(failMail.envio, 'FALLIDO'); assert.equal(failMail.verificacion, 'SIN_VERIFICAR');
    assert.equal(tok(failMail.id).length, 1); assert.equal(tok(failMail.id)[0].reason, 'ENVIO_FALLIDO'); assert.equal(tok(failMail.id)[0].sent, false);
    assert.equal(audits(failMail.id, 'VERIFY_SEND_FAILED'), 1); assert.equal(verified(failMail.id), false);
    await sleep(2300); assert.equal((await resend(u1, failMail.id, [502])).data.code, 'MAIL_SEND_FAILED');
  } finally { assert.equal(spawnSync('docker', ['unpause', MAILBOX_CONTAINER], { encoding: 'utf8' }).status, 0); }
  for (let i = 0; i < 40; i++) { try { if ((await fetch(MAILBOX + '/api/v1/messages')).ok) break; } catch { /* arrancando */ } await sleep(500); }
  await sleep(2300); assert.equal((await resend(u1, failMail.id)).data.envio, 'ENVIADO');
  await confirm(u1, failMail.id, await codeOf(`falla.${MARK}@example.test`)); assert.ok(verified(failMail.id));
  pass('con el servidor SMTP caído el contacto queda registrado sin verificar, el código se invalida y se informa el error; recuperado el servidor se verifica');

  // ---------- H. Persistencia tras reiniciar el backend ----------
  const rsAddr = `reinicio.${MARK}@example.test`; const rs = await addMail(u1, rsAddr); const rsCode = await codeOf(rsAddr);
  const restart = spawnSync('docker', ['restart', BACKEND], { encoding: 'utf8' }); assert.equal(restart.status, 0, restart.stderr);
  await sleep(3000); await waitHealthy();
  assert.equal(tok(rs.id)[0].open, true, 'la verificación pendiente sobrevive al reinicio');
  assert.equal((await ok('/auth/me', { token: u1.token })).correos.find((c) => c.id === rs.id).verificacion, 'PENDIENTE');
  await confirm(u1, rs.id, rsCode); assert.ok(verified(rs.id));
  pass('una verificación pendiente sobrevive al reinicio del backend');

  // ---------- I. Concurrencia ----------
  const ccAddr = `concurrente.${MARK}@example.test`; const cc = await addMail(u1, ccAddr); const ccCode = await codeOf(ccAddr);
  const racers = await Promise.all(Array.from({ length: 8 }, () => confirm(u1, cc.id, ccCode, [200, 409])));
  assert.equal(racers.filter((r) => r.status === 200).length, 1, 'una sola confirmación'); assert.equal(racers.filter((r) => r.status === 409).length, 7);
  assert.equal(tok(cc.id).filter((t) => t.used).length, 1); assert.equal(audits(cc.id, 'VERIFY_CONFIRM'), 1);
  pass('ocho confirmaciones simultáneas: exactamente una prospera');

  // ---------- J. SQL Server rechaza estados imposibles ----------
  const probe = await addMail(u2, `sql.${MARK}@example.test`); await codeOf(`sql.${MARK}@example.test`);
  assert.ok(sqlFails(`INSERT INTO verificaciones_correo(id_correos_electronicos,direccion_normalizada,codigo_hash,fecha_creacion,fecha_vencimiento,id_usuario_solicitante) VALUES(${probe.id},N'x@y.test',REPLICATE('a',64),SYSUTCDATETIME(),DATEADD(MINUTE,5,SYSUTCDATETIME()),${u2.id})`), 'dos verificaciones abiertas para el mismo correo');
  assert.ok(sqlFails(`UPDATE verificaciones_correo SET fecha_invalidacion=SYSUTCDATETIME(),motivo_invalidacion=N'INVENTADO' WHERE id_correos_electronicos=${probe.id} AND fecha_invalidacion IS NULL`), 'motivo inventado');
  assert.ok(sqlFails(`UPDATE verificaciones_correo SET fecha_vencimiento=fecha_creacion WHERE id_correos_electronicos=${probe.id}`), 'vencimiento no posterior a la creación');
  assert.ok(sqlFails(`UPDATE verificaciones_correo SET fecha_uso=SYSUTCDATETIME(),fecha_invalidacion=SYSUTCDATETIME(),motivo_invalidacion=N'VENCIDO' WHERE id_correos_electronicos=${probe.id}`), 'usado e invalidado a la vez');
  assert.ok(sqlFails(`UPDATE verificaciones_correo SET intentos_fallidos=99 WHERE id_correos_electronicos=${probe.id}`), 'intentos fuera de rango');
  pass('SQL Server rechaza dos verificaciones abiertas, motivos inventados, vigencias imposibles y estados contradictorios');

  // ---------- K. Invariantes finales ----------
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos c WHERE c.fecha_verificacion IS NOT NULL AND NOT EXISTS (SELECT 1 FROM verificaciones_correo v WHERE v.id_correos_electronicos=c.id_correos_electronicos AND v.fecha_uso IS NOT NULL)`), 0, 'ningún correo verificado sin código confirmado');
  assert.equal(count(`SELECT COUNT(*) FROM verificaciones_correo v JOIN correos_electronicos c ON c.id_correos_electronicos=v.id_correos_electronicos WHERE v.fecha_uso IS NOT NULL AND c.fecha_verificacion IS NULL`), 0);
  const stored = lines(`SELECT CONCAT(codigo_hash,'|',direccion_normalizada) FROM verificaciones_correo`).join('\n') + lines(`SELECT CONCAT(ISNULL(valores_anteriores,''),ISNULL(valores_nuevos,'')) FROM eventos_auditoria WHERE tipo_entidad=N'PERSON_EMAIL'`).join('\n');
  const logs = spawnSync('docker', ['logs', BACKEND], { encoding: 'utf8' }); const logText = (logs.stdout || '') + (logs.stderr || '');
  for (const code of secrets) { assert.ok(!stored.includes(code) && !stored.includes(code.replace('-', '')), 'código en SQL o auditoría: ' + code); assert.ok(!logText.includes(code), 'código en los logs del backend: ' + code); }
  assert.ok(!/@example\.test/.test(lines(`SELECT CONCAT(ISNULL(valores_anteriores,''),ISNULL(valores_nuevos,'')) FROM eventos_auditoria WHERE tipo_entidad=N'PERSON_EMAIL' AND operacion LIKE N'VERIFY%'`).join('\n').replace(/[a-z]\*\*\*@example\.test/g, '')), 'la auditoría de verificación sólo guarda direcciones enmascaradas');
  const feed = await ok('/audit?entityType=PERSON_EMAIL&operation=VERIFY_CONFIRM&size=50', { token: admin }); assert.ok(feed.total >= 3);
  assert.equal((await call('/audit?entityType=PERSON_EMAIL', { token: u1.token, expect: [403] })).status, 403);
  assert.equal(identity(u1), identityBefore, 'credenciales, roles, versión de credenciales e identidad intactas'); await ok('/auth/me', { token: u1.token });
  for (const t of ['verificaciones_correo', 'correos_electronicos']) assert.equal(sql(`DBCC CHECKCONSTRAINTS('${t}') WITH NO_INFOMSGS`).replace(/\s/g, ''), '');
  pass(`${secrets.length} códigos emitidos: ninguno en SQL, auditoría ni logs; correos verificados sólo con código confirmado; cuentas intactas`);
  console.log(`\nOK: ${passed} bloques aprobados (bandeja de pruebas SMTP: no verifica entrega a un proveedor externo)`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
