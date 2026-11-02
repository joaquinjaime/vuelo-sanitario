/* Siembra en la base E2E aislada un Centro de Operaciones, un DTS y tres solicitudes (nueva, con contrapropuesta y con horario acordado)
 * para revisar visualmente el detalle por etapas. Sólo crea registros marcados; no borra ni modifica datos existentes.
 * Uso: node scripts/e2e-sembrar-validacion-visual.cjs */
const { PASSWORD, MARK, call, ok, fmt, futureSlot, createUser } = require('./e2e-cierre-support.cjs');
const fs = require('node:fs'), path = require('node:path');
(async () => {
  const dotenv = {}; for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim(); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'vis-ops'), dts = await createUser(admin, 'DTS', 'vis-dts');
  let localities; for (const p of await ok('/catalogs/provinces', { token: ops.token })) { localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (localities.length >= 2) break; }
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Visual', apellido: MARK } });
  const request = async (label) => (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: label + ' ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Prueba', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: true } } })).id;
  const nueva = await request('Nueva'), negociacion = await request('Contrapropuesta'), acordada = await request('Acordada');
  await call(`/flights/${negociacion}/schedule/counterproposal`, { method: 'POST', token: ops.token, body: { salida: fmt(new Date(futureSlot().getTime() + 86400000)), motivo: 'Aeronave disponible ese día' } });
  await call(`/flights/${acordada}/schedule/accept`, { method: 'POST', token: ops.token });
  console.log(JSON.stringify({ ops: ops.name, dts: dts.name, password: PASSWORD, nueva, negociacion, acordada }));
})().catch((e) => { console.error(e); process.exit(1); });
