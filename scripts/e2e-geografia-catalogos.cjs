/* I-5.3: catálogo geográfico administrativo, API real y SQL Server E2E aislado. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, MARK, count, call, ok, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter(x => x && !x.trim().startsWith('#') && x.includes('=')).map(x => { const i = x.indexOf('='); return [x.slice(0, i).trim(), x.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const pass = message => console.log(`PASS: ${message}`);

(async () => {
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: env.BOOTSTRAP_ADMIN_USERNAME, password: env.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'geoops');
  const suffix = Date.now().toString().slice(-7);
  const provinceCode = `G${suffix}`;
  const localityCode = `GL${suffix}`;
  const airportCode = `GA${suffix}`;
  const oaci = `Z${suffix.slice(-3)}`;
  const iata = `Z${suffix.slice(-2)}`;

  const denied = await call('/admin/geography/provinces', { method: 'POST', token: ops.token, body: { codigoOficial: provinceCode, nombre: `Provincia no autorizada ${MARK}` }, expect: [403] });
  assert.equal(denied.status, 403);
  pass('un usuario operativo no puede mantener geografía administrativa');

  const province = await ok('/admin/geography/provinces', { method: 'POST', token: admin, body: { codigoOficial: provinceCode, nombre: `Provincia E2E ${MARK}` } });
  const duplicate = await call('/admin/geography/provinces', { method: 'POST', token: admin, body: { codigoOficial: provinceCode, nombre: `Duplicada ${MARK}` }, expect: [409] });
  assert.equal(duplicate.data.code, 'DUPLICATE_GEOGRAPHIC_CODE');
  const locality = await ok('/admin/geography/localities', { method: 'POST', token: admin, body: { codigoOficial: localityCode, nombre: `Localidad E2E ${MARK}`, provinciaId: province.id } });
  const airport = await ok('/admin/geography/airports', { method: 'POST', token: admin, body: { codigoOficial: airportCode, codigoOaci: oaci, codigoIata: iata, nombre: `Aeropuerto E2E ${MARK}`, ciudad: `Ciudad ${MARK}`, provinciaId: province.id, localidadId: locality.id, tipo: 'AERODROMO', pais: 'Argentina', latitud: -26.8, longitud: -65.2 } });
  pass('alta de provincia, localidad y aeropuerto mantiene la asociación de claves foráneas');

  const page = await ok(`/admin/geography/airports?q=${encodeURIComponent(airportCode)}&page=0&size=25`, { token: admin });
  assert.equal(page.totalElements, 1); assert.equal(page.items[0].id, airport.id);
  const updated = await ok(`/admin/geography/airports/${airport.id}`, { method: 'PUT', token: admin, body: { codigoOficial: airportCode, codigoOaci: oaci, codigoIata: iata, nombre: `Aeropuerto E2E editado ${MARK}`, ciudad: `Ciudad ${MARK}`, provinciaId: province.id, localidadId: locality.id, tipo: 'AERODROMO', pais: 'Argentina', latitud: -26.9, longitud: -65.3 } });
  assert.match(updated.nombre, /editado/);
  const localityDenied = await call(`/admin/geography/localities/${locality.id}/active`, { method: 'POST', token: admin, body: { activo: false, motivo: 'Debe conservar aeropuerto activo E2E' }, expect: [409] });
  assert.equal(localityDenied.data.code, 'GEOGRAPHIC_HAS_ACTIVE_DEPENDENCIES');
  pass('búsqueda paginada, edición y restricción de integridad de localidad se aplican en servidor');

  const activeQuery = `/catalogs/airports?provinceId=${province.id}&q=${encodeURIComponent(updated.nombre)}`;
  assert.equal((await ok(activeQuery, { token: ops.token })).some(x => x.id === airport.id), true, 'el catálogo encuentra el aeropuerto antes de la baja');
  await ok(`/admin/geography/airports/${airport.id}/active`, { method: 'POST', token: admin, body: { activo: false, motivo: 'Baja lógica E2E I-5.3' } });
  const activeCatalog = await ok(activeQuery, { token: ops.token });
  assert.equal(activeCatalog.some(x => x.id === airport.id), false);
  assert.equal(count(`SELECT COUNT(*) FROM aeropuertos WHERE id_aeropuertos=${airport.id} AND esta_activo=0`), 1);
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'GEOGRAPHIC_AIRPORT' AND entidad_id=${airport.id} AND operacion IN (N'CREATE',N'UPDATE',N'SET_ACTIVE')`), 3);
  pass('baja lógica excluye el aeropuerto de catálogos operativos y conserva fila y auditoría SQL');

  const types = await ok('/catalogs/flight-types?operationalOnly=true', { token: ops.token });
  assert.ok(types.length > 0); assert.equal(types.some(x => x.codigo === 'SANITARIO'), false); assert.ok(types.every(x => x.codigo && x.nombre));
  pass('el catálogo operativo de tipos de vuelo es activo, servido por backend y excluye SANITARIO');
})().catch(error => { console.error(error); process.exitCode = 1; });
