# I-4.1 Estabilización de rutas y ensayo de migración V47 → V55 — 2026-10-25

Este documento registra la evidencia de la estabilización. **La base habitual no se actualizó y sigue en Flyway V47.** El procedimiento para hacerlo, cuando se autorice, está en `PROCEDIMIENTO_ACTUALIZACION_V47_V55.md`.

## 1. Hallazgos y correcciones

| # | Hallazgo | Corrección y prueba de regresión |
|---|---|---|
| 1 | **Dato truncado en silencio.** Jackson acepta `1.5` para un `Integer` y lo guardaba como `1`: `tiempoEstimadoMinutos: 1.5` se persistía como 1 minuto, y la versión esperada `1.7` se leía como 1. | `api/dto/WholeNumber` (deserializador de enteros sin truncamiento, 400 ante parte decimal, exponente o desborde de `int`) aplicado a `version` y `tiempoEstimadoMinutos` y a las versiones de `submit`/`approve`/`return`. `FlightRouteInputContractTest` (6) falló antes del cambio y pasa ahora; E2E: 1.5, 95.9 y 1e3 minutos devuelven 400 sin crear versión. |
| 2 | **Error interno con un contexto de ruta ilegible.** `FlightRouteService.conditions` fallaba con `NullPointerException` (`Map.of().get(null)`) si el contexto guardado tenía identificadores no numéricos. | Se contempla el identificador nulo. `FlightRouteServiceTest` (+4 pruebas de rutas históricas y contextos ilegibles) y E2E con contexto `10|11`, `x|y|z|w|v|u` y vacío: la versión se interpreta como "requiere revisión", nunca 500. |
| 3 | `FlywayMigrationRunner` sólo autorizaba la migración de la base habitual con la contraseña `V32_TO_V47_AUTHORIZED` y `invoke-prepared-flyway.ps1` tenía el objetivo 47 fijo: ninguno servía para V47 → V55. | La autorización pasa a depender de la versión objetivo (`V32_TO_V47_AUTHORIZED` para 47, `V47_TO_V55_AUTHORIZED` para 55; cualquier otra combinación se rechaza antes de conectar; verificado sin red). Nuevo `invoke-prepared-flyway-v55.ps1` (objetivo 55, exige V47 exacto). El original se conserva como registro histórico. |
| 4 | `prevalidate-migrations.ps1` no conocía las condiciones de V48 a V55. | Se agregan: documentos inactivos sin versiones (**ISSUE**: V52 se detendría), duplicados de contactos (V49) y personas sin principal (V50) como **WARNING**, y la cantidad de rutas y de vuelos `PLANIFICADO` que necesitarán ruta aprobada (**INFO**). Ejecutado sobre la restauración V47. |
| 5 | Herramienta de ensayo: el montaje directo de `backend-java/target/classes` (que Maven recrea) en Docker Desktop produjo, dos veces, `No migration with a target version ... could be found` y, otra, un fallo de `validate`, sin haber tocado la base y sin causa reproducible. | Las clases se copian a una carpeta estable antes de montarlas, con un reintento acotado a ese único error. Sin fallos en las corridas posteriores. **Causa no confirmada.** |
| 6 | La base habitual sólo contiene 1 usuario y ningún vuelo, ruta ni documento: restaurarla tal cual no ejercita V48 a V55. | La restauración se pobló, únicamente en la restauración, con el backend V47 real (`scripts/ensayo-sembrar-v47.cjs`). |

## 2. Pruebas pendientes de I-4 (SQL Server real, `e2e-rutas-estabilizacion.cjs`, 6 bloques)

1. **Rutas históricas sin contexto ni recorrido.** Se reproduce el estado en que V55 deja una ruta anterior a V37: `BORRADOR` si el vuelo no inició, `SIN_REVISION` si ya inició. Todos los perfiles la leen (recorrido y condiciones nulos) sin errores; presentarla da 409 `RUTA_REQUIERE_REVISION`, aprobarla 409 `TRANSICION_RUTA_NO_PERMITIDA`, iniciar 409 `RUTA_NO_PRESENTADA`; ninguna queda aprobada, pendiente o devuelta; guardar una versión nueva (sin pedir motivo) deja la histórica con **todos sus datos idénticos** (comparación columna a columna) y sólo cambia su estado a `SIN_REVISION`. En un vuelo ya iniciado la ruta histórica no impide registrar la bitácora ni finalizar (la obligación de informe final se crea) y queda intacta. Un contexto dañado en una versión presentada se trata como revisión requerida.
2. **Creación inicial concurrente.** Ocho rondas, de dos y tres solicitudes `PUT` con versión 0 y ambos órdenes de llegada: **siempre una única versión 1 vigente**, un evento `CREATE`, ningún `UPDATE`, 409 `VERSION_RUTA_DESACTUALIZADA` para las demás y lo persistido coincide con lo que respondió la solicitud ganadora (ganaron la primera y la segunda en rondas distintas). Además, ocho rondas de creación-con-presentación contra un cambio de aeronave: la ruta presentada coincide con la aeronave actual o queda `REQUIERE_REVISION` con un único evento `INVALIDATE`.
3. **Límites numéricos.** Las columnas son `DECIMAL(8,2)` (altitud y distancia) e `INT` (minutos). Persistieron con su valor exacto 13 entradas válidas: los tres campos omitidos o nulos, altitud 0 / 0.01 / 9000.5 / 999999.99, distancia 0.01 / 640.5 / 999999.99, minutos 1 / 2147483647 y textos de 4000 caracteres. Se rechazaron con 400, sin crear versión, 29 entradas inválidas: altitud −0.01, −1, 1000000, 999999.999, 12.345, texto, booleano y arreglo; distancia 0, −5, 0.001, 1000000, 999999.999 y texto; minutos 0, −1, **1.5**, 95.9, 2147483648, 1e3 y texto; versión fraccionaria, negativa o ausente; recorrido vacío o de 4001; observaciones de 4001 y motivo de 501. No se agregó ningún límite aeronáutico.

## 3. Auditoría (`e2e-rutas-estabilizacion.cjs`, bloque D, SQL Server real)

* Cada intento de inicio rechazado por la ruta (sin ruta, borrador, devuelta, invalidada, pendiente) deja **un** evento `FLIGHT_ROUTE/START_REJECTED` (código, versión y estado) **persistido aunque la transacción del inicio se revierta**; el vuelo sigue `PLANIFICADO` y no aparece ningún `START`.
* Consultar la ruta, la cola, la auditoría o el detalle (tres rondas por perfil) no genera eventos; un inicio rechazado por permisos (403) o una escritura sin permiso tampoco.
* El inicio exitoso deja un `START` y ningún rechazo adicional.
* Con un trigger temporal que hace fallar el insert de auditoría, **presentar, aprobar, devolver y la invalidación (cambio de aeronave) se revierten completos**: no queda revisor, observación ni cambio de aeronave sin su evento, y al retirar el trigger la operación se aplica y audita una vez.
* La invalidación se audita una sola vez aunque después cambie otra condición del vuelo. Secuencia final del vuelo de la prueba: `CREATE` 1, `UPDATE` 2, `SUBMIT` 3, `APPROVE` 2, `RETURN` 1, `INVALIDATE` 1.

## 4. Ensayo de migración V47 → V55

**Aislamiento.** Respaldo `COPY_ONLY, CHECKSUM` de la base habitual V47 tomado dentro de su contenedor (sólo lectura de datos; escribe el archivo y el historial de respaldos de `msdb`), `RESTORE VERIFYONLY WITH CHECKSUM` correcto, SHA-256 idéntico en origen y destino, restauración con otro nombre (`vuelos_sanitarios_ensayo_v47`) **dentro de la instancia SQL Server E2E existente** (no se creó otra instancia) y `DBCC CHECKDB` limpio. El backend de ensayo y el ejecutor de Flyway sólo tenían la URL de esa base (el ejecutor además rechaza la habitual sin autorización por versión). Los respaldos preexistentes de la habitual eran de V32; no existía uno de V47, por eso se tomó este. Al terminar se eliminaron la base de ensayo, el archivo de respaldo (contiene datos personales) y los contenedores y volúmenes del ensayo.

**Datos de partida.** La habitual: 42 tablas, 336 MB de archivos, collation `SQL_Latin1_General_CP1_CI_AS`, modelo FULL, 1 usuario, 0 vuelos, 0 rutas, 0 documentos. Se poblaron en la restauración, con la imagen `release-v47` y su API, 12 usuarios (los 5 roles), 8 comandantes con habilitación verificada, 10 vuelos (5 `PLANIFICADO` —uno con ruta de dos versiones, uno sin ruta, dos sanitarios con ruta y uno con ruta anterior a V37 sin contexto ni recorrido—, 2 `EN_CURSO`, 1 `FINALIZADO`, 1 cancelado y 1 solicitud sanitaria), 9 versiones de ruta, 1 documento PDF, hangar, coordinación, clima, bitácora, tripulación y 138 eventos de auditoría; por SQL se agregaron un correo y un teléfono duplicados y una persona sin contacto principal, tal como los permitía V47.

**Resultado de cada migración** (corrida final; sobre la restauración limpia; tiempos de ejecución de Flyway):

| Migración | Resultado | Tiempo |
|---|---|---|
| Validación previa de V1–V47 con el bundle V55 | `Successfully validated 55 migrations` | 2,0 s |
| V48 `version_optimista_identidad_personas` | aplicada | 0,08 s |
| V49 `contactos_personales_baja_logica_y_unicidad` | aplicada (1 correo y 1 teléfono dados de baja como `DUPLICADO_MIGRACION`) | 0,27 s |
| V50 `correccion_preventiva_contactos_v49` | aplicada (2 eventos de auditoría; 1 principal promovido) | 0,23 s |
| V51 `contactos_coordinacion_traslado_sanitario` | aplicada (tabla nueva, 0 filas) | 0,10 s |
| V52 `baja_logica_documentos_vuelo` | aplicada | 0,15 s |
| V53 `compatibilidad_tipos_documento_con_tipo_vuelo` | aplicada | 0,07 s |
| V54 `verificacion_correos_y_telefonos_internacionales` | aplicada (tabla `verificaciones_correo` nueva, 0 filas) | 0,11 s |
| V55 `revision_operativa_rutas` | aplicada | 1,21 s |

Las ocho se repitieron en cuatro corridas completas desde una restauración limpia con el mismo resultado (la última, con la herramienta definitiva, es la registrada).

**Comparación antes y después (sin datos personales):**

| Aspecto | Antes (V47) | Después (V55) |
|---|---|---|
| Versión Flyway / filas fallidas | 47 / 0 | 55 / 0 |
| Tablas de aplicación / PK / FK / CHECK / índices / triggers | 41 / 42 / 84 / 30 / 227 / 7 | 43 / 44 / 94 / 48 / 242 / 7 |
| FK y CHECK no confiables; filas de `DBCC CHECKCONSTRAINTS` | 0; 0 | 0; 0 |
| Filas por tabla existente | — | iguales en las 41 tablas, salvo `eventos_auditoria` 138 → 140 (los dos eventos de V50) |
| Contenido de las columnas previas (CHECKSUM_AGG por tabla con las filas previas) | — | idéntico en 38 tablas; cambia sólo en `correos_electronicos` y `telefonos` (`es_principal` del duplicado dado de baja y de la persona que recibió un principal). En `eventos_auditoria` (que crece en 2) esta comparación no se hizo: sólo se verificó que el disparador de inmutabilidad sigue presente |
| Columnas agregadas | — | `personas` +1, `correos_electronicos` +6, `telefonos` +6, `documentos_vuelo` +3, `tipos_documento` +1, `rutas_vuelo` +9; tablas nuevas `contactos_coordinacion_traslado` y `verificaciones_correo` |
| Usuarios activos por rol / habilitaciones | 12 / 8 verificadas | iguales / iguales |
| Vuelos por tipo y estado | 10 | iguales |
| Rutas (versiones / vigentes) | 9 / 8 | 9 / 8; vigentes de vuelos planificados en `BORRADOR` (4), las demás `SIN_REVISION` (5); **0 aprobadas, pendientes o devueltas** |
| Documentos / versiones | 1 / 1 | 1 / 1; el PDF se descarga con el mismo SHA-256 |
| Disparador de inmutabilidad de auditoría | presente | presente |

**Prueba funcional sobre la restauración migrada** (`ensayo-funcional-v55.cjs`, backend V55 con `ddl validate`, 10 bloques): arranque y autenticación de las cuentas existentes; listado, detalle y auditoría de los 10 vuelos; rutas anteriores legibles (incluida la sin contexto); rechazo del inicio sin aprobación en los 5 planificados con un evento persistido por intento; presentación, aprobación, invalidación por cambio de aeronave, regularización e inicio de un operativo; devolución, corrección con motivo y aprobación de la ruta histórica sin contexto; presentación de la ruta vigente y de la desactualizada de dos sanitarios, aprobación e inicio; finalización de 5 vuelos (iniciados antes y después de V55) con su obligación de informe final; documento, hangar, coordinación, clima, bitácora y tripulación con elegibilidad (I-3); V49/V50 (duplicados dados de baja sin borrar, auditados, un principal por persona); y verificación de correo I-2b (los correos de V47 quedan `SIN_VERIFICAR`, el titular recibe y confirma el código).

**Ensayo negativo** (`ensayo-migracion-negativa.sh`): sobre otra restauración limpia se creó un documento inactivo sin versiones. El diagnóstico previo lo informó como `ISSUE`; V48 a V51 se aplicaron; **V52 falló con el error 51052** y la base quedó en V51, sin fila fallida en el historial, con `documentos_vuelo` aún de 7 columnas y el dato intacto (SQL Server revirtió la migración completa); tras corregir el dato la reanudación aplicó V52 a V55.

## 5. Regresión

| Suite | Resultado |
|---|---|
| Maven | **487** pruebas, 0 fallos (477 al iniciar I-4.1: +4 de rutas históricas, +6 del contrato numérico) |
| Vitest | **211** pruebas, 0 fallos (210 al iniciar: +1 de ruta histórica); `vite build` correcto |
| Node (SQL Server aislado y Chrome) | **37 scripts aprobados en una sola pasada** (se agrega `e2e-rutas-estabilizacion`) |

## 6. Limitaciones

* `protect-sql-backup.ps1` e `invoke-prepared-flyway-v55.ps1` requieren PowerShell 7.4 y no se ejecutaron; el segundo sólo se validó sintácticamente.
* La restauración se pobló con datos sintéticos con el contrato V47: la base habitual no tiene datos complejos. No se midió el rendimiento con volúmenes grandes.
* El ensayo usó una copia `COPY_ONLY` en el mismo equipo; no se probó la recuperación desde una copia externa.
* No se ejecutó nada contra la base habitual salvo el respaldo `COPY_ONLY` descrito y consultas de sólo lectura.
