#!/usr/bin/env node
// Genera docs/CONCILIACION_TABLAS_I57_2026-10-28.md a partir del informe de scripts/inventario-tablas.cjs (docs/evidencia-i57/inventario-tablas-e2e-v60.json).
// Sólo escribe documentación; las cifras provienen de SQL Server, no se escriben a mano.
const fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const report = JSON.parse(fs.readFileSync(path.join(root, "docs", "evidencia-i57", process.argv[2] || "inventario-tablas-e2e-v60.json"), "utf8"));
const rows = report.tables.map((t) => `| \`${t.name}\` | ${t.kind === "NEGOCIO" ? "negocio" : "infraestructura"} | ${t.rows} | ${t.fkOut} | ${t.fkIn} | ${t.checks} | ${t.uniqueIndexes} | ${t.triggers} |`).join("\n");
const md = `# Conciliación exacta de tablas: SQL Server contra la matriz funcional (I-5.7, fase 1)

Fecha: 2026-10-28. Fuente: \`node scripts/inventario-tablas.cjs\` (consulta \`sys.tables\`, \`sys.foreign_keys\`, \`sys.check_constraints\`, \`sys.indexes\`, \`sys.triggers\` y \`sys.partitions\` de **${report.database}**, Flyway V${report.flywayVersion}), comparada contra las filas de [MATRIZ_FUNCIONAL_I5_2026-10-26](MATRIZ_FUNCIONAL_I5_2026-10-26.md). Informe bruto: \`docs/evidencia-i57/inventario-tablas-e2e-v60.json\`. Las filas son las de la base de **pruebas aisladas** (acumula miles de corridas), no las de la habitual.

## 1. Resultado

| Concepto | Cantidad |
|---|---:|
| Tablas físicas en \`sys.tables\` (todas en el esquema \`dbo\`) | **${report.totalPhysicalTables}** |
| …de negocio | **${report.businessTables}** |
| …de infraestructura (\`flyway_schema_history\`, gestionada por Flyway, sin CRUD) | **${report.infrastructureTables}** |
| Vistas | 0 |
| Filas de la matriz (con la corrección de I-5.7) | ${report.matrixRows} (${report.matrixBusinessRows} de negocio + 1 técnica) |
| En SQL y no en la matriz | ${report.missingInMatrix.length ? report.missingInMatrix.join(", ") : "ninguna"} |
| En la matriz y no en SQL | ${report.missingInDb.length ? report.missingInDb.join(", ") : "ninguna"} |
| Duplicadas en la matriz | ${report.duplicatedInMatrix.length ? report.duplicatedInMatrix.join(", ") : "ninguna"} |
| Tablas de negocio sin ninguna clave foránea entrante ni saliente | ${report.tablesWithoutFk.length ? report.tablesWithoutFk.join(", ") : "ninguna"} |
| **Estado de la conciliación** | **${report.reconciled ? "CONCILIADO" : "NO CONCILIADO"}** |

## 2. Por qué había 42 en la matriz y 46 en el esquema

No eran 42 funcionalidades *contra* 46 tablas con cuatro sin explicar: la diferencia se descompone exactamente.

1. La matriz funcional (I-5) se escribió con el esquema **V55**: **42 tablas de aplicación + \`flyway_schema_history\` = 43 filas**.
2. **V59 agregó tres tablas de negocio**: \`politicas_habilitacion\`, \`decisiones_habilitacion\` y \`consultas_externas_habilitacion\`. El cierre de I-5.6 reclasificó las dos tablas que seguían parciales (\`habilitaciones_profesionales\` y \`documentos_habilitacion\`) y declaró «42 funcionales, 0 parciales», pero **nunca agregó las tres tablas de V59 a la matriz**: su cifra seguía siendo la de las 42 anteriores.
3. 43 + 3 = **46 tablas físicas** = 45 de negocio + 1 técnica. Las 4 «de más» respecto de «42» son: \`flyway_schema_history\` (infraestructura, ya listada aparte) y las **3 de V59 que no estaban evaluadas**.

Respuesta a la pregunta planteada: **no, las 42 funcionalidades evaluadas no incluían las tablas de V59.** Quedaron fuera de la evaluación por no existir en la matriz anterior, y eso se corrigió en este incremento: se evaluaron como cualquier otra tabla (§3) y se agregaron a la matriz, que ahora concilia con \`sys.tables\` sin diferencias. El script falla (código de salida 1) si en el futuro alguna tabla nueva no figura en la matriz, de modo que esto no puede volver a pasar en silencio.

## 3. Evaluación de las tres tablas incorporadas

Criterios aplicados a cada una: funcionalidad, relaciones, reglas de negocio, utilización real, seguridad, auditoría y pruebas.

### \`politicas_habilitacion\` — Funcional (el contenido es decisión de negocio)

* **Funcionalidad**: define qué habilitación es suficiente para cada función según tipo de operación y categoría de aeronave; la consulta \`CredentialSufficiency\` es la única regla de suficiencia (listar, asignar, replanificar, aceptar, iniciar). I-5.7 agrega simulación y activación por lote (ver [POLITICAS_HABILITACION_PROPUESTA_I57](POLITICAS_HABILITACION_PROPUESTA_I57_2026-10-28.md)).
* **Relaciones**: FK a \`roles_tripulacion\`, \`tipos_vuelo\` (opcional) y \`usuarios\` (alta y baja).
* **Reglas**: combinación activa única (índice filtrado); fuente oficial citada obligatoria si el origen la declara; baja con actor, fecha y motivo (CHECK); sin borrado ni reactivación (trigger V60).
* **Uso real**: ${report.tables.find((t) => t.name === "politicas_habilitacion")?.rows ?? "-"} filas en la base de pruebas, creadas y dadas de baja por las suites E2E (la base habitual no tiene ninguna; V59/V60 no siembran).
* **Seguridad**: sólo \`ADMINISTRADOR\`; campos desconocidos rechazados; bloqueo por función ante cambios simultáneos.
* **Auditoría**: \`CREDENTIAL_POLICY\` (CREATE/DEACTIVATE) y \`CREDENTIAL_POLICY_BATCH\` (ACTIVATE, con huella, función, cantidades y referencia de aprobación).
* **Pruebas**: \`PolicyActivationAndLegacyIntegrationTest\`, \`CredentialLifecycleIntegrationTest\`, \`e2e-habilitaciones\`, \`e2e-politicas-documentos-v60\`, \`e2e-politicas-documentos-ui\`, \`credentials.test.jsx\`, \`policyActivation.test.jsx\`.
* **Brecha**: ninguna técnica. Pendiente de negocio: el contenido de la política.

### \`decisiones_habilitacion\` — Funcional

* **Funcionalidad**: historial de cada decisión sobre una habilitación (registro, modificación, documento, verificación, rechazo, corrección, revocación, renovación, consulta externa, retiro y bloqueo de documentos, solicitudes de datos, análisis), con actor, fecha, motivo y documento de evidencia. Se escribe en la misma transacción que el cambio y se lee en «Consultar historial».
* **Relaciones**: FK a \`habilitaciones_profesionales\`, \`usuarios\` y \`documentos_habilitacion\`; índice (habilitación, fecha).
* **Reglas**: \`tipo_decision\` acotado por CHECK; **insert-only**: V60 agrega un trigger que rechaza UPDATE y DELETE (antes la inmutabilidad dependía sólo de que el código no los emitiera).
* **Uso real**: ${report.tables.find((t) => t.name === "decisiones_habilitacion")?.rows ?? "-"} filas en la base de pruebas.
* **Seguridad**: lectura sólo \`ADMINISTRADOR\`; ningún endpoint escribe directamente.
* **Auditoría**: es en sí un historial; además cada operación origen se audita en \`eventos_auditoria\`.
* **Pruebas**: \`CredentialLifecycleIntegrationTest\` (secuencia exacta de decisiones), \`e2e-habilitaciones\`, \`e2e-politicas-documentos-v60\` (UPDATE y DELETE reales rechazados por SQL Server).

### \`consultas_externas_habilitacion\` — Funcional (manual por diseño)

* **Funcionalidad**: constancia de lo que un administrador declara haber contrastado en ANAC o REFEPS/SISA (o en otra fuente), con resultado y evidencia. **No es una validación emitida por el organismo** y no cambia el estado administrativo; sólo condiciona la suficiencia si una política exige \`requiere_consulta_externa\`.
* **Relaciones**: FK a \`habilitaciones_profesionales\`, \`usuarios\` y \`documentos_habilitacion\`.
* **Reglas**: organismo y resultado acotados por CHECK; ANAC sólo para personal aeronáutico, REFEPS/SISA sólo sanitario; fecha no futura; la coincidencia sólo vale para el número vigente de la habilitación; el titular no puede registrar la propia; insert-only (trigger V60).
* **Uso real**: ${report.tables.find((t) => t.name === "consultas_externas_habilitacion")?.rows ?? "-"} filas en la base de pruebas.
* **Seguridad**: sólo \`ADMINISTRADOR\`.
* **Auditoría**: \`PROFESSIONAL_CREDENTIAL/EXTERNAL_CHECK\` y una decisión \`CONSULTA_EXTERNA\`.
* **Pruebas**: \`CredentialLifecycleIntegrationTest\`, \`e2e-habilitaciones\`, \`e2e-politicas-documentos-v60\`.
* **Dependencia externa**: no existe API acreditada de los organismos; la consulta seguirá siendo manual.

## 4. Inventario completo (46 tablas)

| Tabla | Clase | Filas (E2E) | FK salientes | FK entrantes | CHECK | Índices únicos | Triggers |
|---|---|---:|---:|---:|---:|---:|---:|
${rows}

Reproducción: \`node scripts/inventario-tablas.cjs --out docs/evidencia-i57/inventario-tablas-e2e-v60.json\` (contenedor y base configurables con \`--container\`, \`--db\`, \`--env\`; sólo lee). Para la base habitual (sólo lectura): \`--container vuelos-sanitarios-sqlserver-1 --db vuelos_sanitarios --env .env\`.

## 5. La base habitual (V47), sólo lectura

Informe: \`docs/evidencia-i57/inventario-tablas-habitual-v47-solo-lectura.json\`. La habitual tiene **42 tablas físicas = 40 de negocio + 2 de infraestructura**: \`flyway_schema_history\` y \`sysdiagrams\` (la crea SQL Server Management Studio al usar «diagramas de base de datos»; no es de la aplicación, no está en las bases creadas por Flyway y se conserva tal cual). La conciliación contra la matriz informa exactamente las **5 tablas de negocio que V48–V59 todavía no crearon** —\`contactos_coordinacion_traslado\` (V51), \`verificaciones_correo\` (V54) y las tres de V59—: 40 + 5 = 45. Tras la migración se esperan **47 tablas físicas = 45 de negocio + 2 de infraestructura**, y el script debe informar «CONCILIADO».
`;
fs.writeFileSync(path.join(root, "docs", "CONCILIACION_TABLAS_I57_2026-10-28.md"), md);
console.log("escrito docs/CONCILIACION_TABLAS_I57_2026-10-28.md");
