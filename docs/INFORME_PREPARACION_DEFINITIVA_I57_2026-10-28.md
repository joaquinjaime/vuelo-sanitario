# Informe de preparación definitiva — I-5.7 (2026-10-28)

Rama `feature/completitud-funcional-post-v55`, sólo commits locales. **La base habitual sigue en Flyway V47 y no se modificó; no hubo push ni despliegue.**

## H. Decisión de release (al principio, por ser lo que se pide)

**GO CON CONDICIONES.** La candidata (V60 + backend + frontend de esta rama) está técnicamente preparada para la siguiente etapa autorizada —la migración controlada de la base habitual— porque: la migración V47→V60 se ensayó completa sobre una restauración del respaldo real, la recuperación por restauración se comprobó, los 579 + 254 tests y la suite E2E continua (50 de 51 en la corrida única; el restante, tras corregir una expectativa obsoleta, aprobó al repetirse) aprobaron, y los riesgos que quedan están cerrados por omisión (nadie es elegible sin política; ningún documento es descargable sin antivirus acreditado). No es **GO** a secas porque operar de verdad exige condiciones que no son técnicas ni se pueden cumplir desde aquí (ver G):

1. **Autorización expresa de la ventana** de migración de la habitual (y de push/despliegue, que no se hicieron).
2. **Contenido de la política de suficiencia** decidido por el negocio con revisión normativa. Sin ella el sistema migra y arranca, pero no puede asignar tripulación ni iniciar vuelos.
3. **Antivirus completo en un equipo con memoria suficiente** antes de habilitar documentación de habilitaciones (aquí no se pudo probar).
4. Decisiones declaradas pendientes y sin efecto bloqueante sobre migrar: retención documental, plazos de aviso (60/30/7/0 es una propuesta), proveedor SMTP.

No es **NO-GO** porque no existe ningún defecto técnico conocido sin resolver que impida migrar.

## A. Estado funcional

| Concepto | Cantidad |
|---|---:|
| Tablas físicas (base de pruebas V60) | **46** |
| …de negocio | **45** |
| …de infraestructura (`flyway_schema_history`) | 1 |
| Filas de la matriz funcional (corregida) | 46 = 45 + 1 técnica |
| Tablas de negocio funcionales | **45 de 45** (0 parciales) |
| Habitual (V47, sólo lectura) | 42 físicas = 40 de negocio + `flyway_schema_history` + `sysdiagrams` (SSMS) |
| Copia migrada del ensayo (V60) | 47 físicas = 45 + 2 de infraestructura; **CONCILIADO** |

**Diferencia con la matriz anterior (42):** la matriz se cortó en V55 (42 de aplicación + Flyway) y nunca incorporó las tres tablas de V59 (`politicas_habilitacion`, `decisiones_habilitacion`, `consultas_externas_habilitacion`); el «42 funcionales» de I-5.6 contaba sólo las anteriores. No estaban incluidas. Ahora se evaluaron como el resto, se agregaron y `node scripts/inventario-tablas.cjs` concilia SQL contra la matriz y falla si una tabla nueva no figura. Detalle: [CONCILIACION_TABLAS_I57](CONCILIACION_TABLAS_I57_2026-10-28.md).

Hallazgo adicional: `sysdiagrams` en la habitual es una tabla de SSMS (diagramas), no de la aplicación; se conserva.

## B. Políticas profesionales

* **Propuesta inicial** (`config/politicas-habilitacion/propuesta-inicial-I57-PENDIENTE.json`): cuatro funciones, **cero políticas, ocho decisiones pendientes**; no se inventó ningún requisito de ANAC ni sanitario ni equivalencia alguna. Matriz de decisión (sustentado por el modelo / configuración / decisión de negocio / revisión normativa) en [POLITICAS_HABILITACION_PROPUESTA_I57](POLITICAS_HABILITACION_PROPUESTA_I57_2026-10-28.md). Mientras no se cargue, cada función queda **no elegible** (`POLITICA_HABILITACION_NO_CONFIGURADA`) y la lista de preparación la marca obligatoria y pendiente.
* **Correcciones técnicas:** simulación y activación por lote (atómico por función, huella SHA-256 de lo aprobado, referencia de aprobación, reconocimiento de incompatibilidades, auditoría `CREDENTIAL_POLICY_BATCH`), bloqueo por función, campos desconocidos rechazados (antes una errata eliminaba una exigencia en silencio), trigger V60 que impide borrar/alterar/reactivar políticas, interfaz y CLI. Un defecto de rendimiento hallado y corregido: activar sobre 2.281 vuelos abiertos tardaba ≈ 5 min (volcados automáticos de Hibernate); ahora ≈ 25–45 s en la base de pruebas.
* **Simulaciones sobre datos representativos:**
  * Copia migrada del ensayo (10 vuelos, 8 comandantes con habilitación verificada): propuesta de 16 políticas con tipos ficticios → 7 vuelos abiertos examinados, **0** integrantes dejan de ser elegibles, **7** pasan a serlo, 8 comandantes pasan a elegibles; activación del lote (16 altas) y lista de preparación sin `POLITICA_*` pendiente.
  * Base de pruebas (2.281 vuelos abiertos, miles de personas): la plantilla pendiente (cero políticas) dejaría **2.731 integrantes de vuelos abiertos no elegibles** (2.233 comandantes, 113 copilotos, 335 médicos, 108 enfermeros) y exige reconocimiento: así se ve el costo de abrir sin política. Informe: `docs/evidencia-i57/simulacion-plantilla-pendiente-e2e.json`.
  * Fixture de enfermería con jurisdicción: una persona pasa a elegible y otra sigue no elegible con su causa (`JURISDICCION_NO_REGISTRADA`).
* Habitual: 1 usuario, 0 vuelos, 0 habilitaciones → no hay nada que simular; tras migrar no tendrá impacto en vuelos.

## C. Documentos

* La habitual no tiene documentos de habilitación; los **8 heredados** del ensayo son los PDF de las credenciales de los 8 comandantes sembrados con el contrato V47.
* **Regularización implementada** (V60 + `LegacyDocumentService`): conserva archivo e historial, `origen_registro = ANTERIOR_V59` permanente, huella con `hash_momento` (`CARGA` / `REGULARIZACION`, esta última no prueba integridad desde la carga), validación estructural PDF, análisis real con clamd, estado `LEGADO_SIN_ANALISIS` sin cambios si no puede analizarse (archivo ausente, analizador caído o base no acreditada) con explicación, informe de habilitaciones y vuelos afectados, lote acotado, y si el análisis rechaza el único sustento de una verificación la habilitación vuelve a `PENDIENTE`. La **descarga de un heredado sin analizar se cerró** (antes se permitía) y reanalizarlo «a ciegas» se rechaza.
* Ensayo: los 8 se regularizaron con ClamAV real (8/8, huella SHA-256 igual al archivo original, origen conservado, ninguna habilitación cambió de estado). E2E: limpio, EICAR real, archivo ausente, PDF truncado, titular propio denegado.
* **Limitaciones pendientes:** la base de pruebas conserva ≈ 2.490 heredados históricos no regularizados en masa (no se ejecutó el lote a esa escala); el antivirus de pruebas es de base mínima (EICAR); sin antivirus completo no se regulariza en producción.

## D. Pruebas

| Capa | Resultado | Origen |
|---|---|---|
| Backend (Maven, H2) | **579**, 0 fallos (562 + 17 nuevos) | **Nueva ejecución** I-5.7 |
| Frontend (Vitest) + build | **254**, 0 fallos (243 + 11 nuevos); `vite build` correcto | **Nueva ejecución** |
| SQL Server real + ClamAV real + API | `e2e-politicas-documentos-v60` **19/19**; `e2e-antimalware-produccion` **4/4** | **Nueva ejecución** |
| Navegador (Chrome) | `e2e-politicas-documentos-ui` **4/4** | **Nueva ejecución** |
| Ensayo V47→V60 | 60 checksums, V48…V60 una por una, 0 violaciones, 12 bloques funcionales; recuperación comprobada | **Nueva ejecución** |
| Control negativo del defecto de respuestas tardías | 3 de 4 pruebas fallan sin la corrección | **Nueva ejecución** |
| Suite E2E continua (51 scripts) | Corrida continua `20261028T153439` (2 h 31 min): **50 de 51 aprobados**. El fallo fue `e2e-contactos-tripulacion`, cuya aserción fijaba «sin migraciones posteriores a V59»; V60 no toca contactos, la expectativa estaba obsoleta y se actualizó a V60 con su justificación (no se debilitó nada más). Repetido solo: **8 bloques aprobados**. Por lo tanto 51/51 aprobaron, pero **no en una única corrida continua** | **Nueva ejecución** (48 previos + 3 nuevos) |
| Resultados de I-5.6 (562/243/48 de 48) | Se conservan sólo como línea de base; no se reutilizan como evidencia de esta candidata | Incremento anterior |

Defectos de las propias pruebas corregidos sin relajar expectativas (el código no se adaptó a la prueba): el cuerpo de error usa `error` y no `message`; una elección de documento de muestra que podía ser ya heredado; carreras de la interfaz en el script de Chrome; un `process.exit()` del CLI que en Node/Windows terminaba con código 0xC0000409 tras usar la red (corregido en el CLI).

## E. Infraestructura

* Docker Desktop: VM de 3,45 GB sin `.wslconfig` (no se modificó); host con 7,2 GB de RAM y ≈ 0,9 GB libres con todo en marcha. Habitual (SQL Server, backend, frontend) en marcha y **sin cambios**; stack aislado reconstruido varias veces.
* **ClamAV:** completo = inviable aquí (≈ 2 GB para clamd; ≈ 1,1 GB libres en la VM): **bloqueo documentado, no validado**. Recomendación: servicio separado en un equipo con ≥ 4 GB. Nuevo: un analizador con base mínima o antigua **no se acepta como protección en producción** (`GuardedMalwareScanner`, probado contra el clamd real: documentos en cuarentena, reversible), y `scripts/verificar-antivirus-produccion.cjs` rechaza correctamente el clamd mínimo del E2E.
* **SMTP:** sin proveedor; **no se declara probado**. Mailpit sigue como transporte de prueba. Endurecido: STARTTLS obligatorio + verificación de identidad, y la aplicación no arranca con credenciales sin cifrado.
* **Almacenamiento y respaldos:** ningún respaldo existente se modificó (se leyó una copia del respaldo pristino V47 para el ensayo y se eliminó la copia); no se hicieron copias fuera del equipo. Persistencia: volúmenes `sqlserver_data`, `documents_data`, `clamav_db` (respaldar base y PDF juntos).
* **Recuperación comprobada:** se restauró el FULL pristino V47, `DBCC CHECKDB` limpio, 42 tablas, y la imagen V47 archivada arrancó sobre él («Schema [dbo] is up to date»).
* Exposición: SQL Server pasa a publicarse sólo en `127.0.0.1` (surte efecto al recrear su contenedor en la ventana); superposición `docker-compose.prod.yml` (entorno `produccion`, ClamAV obligatorio, migraciones al arrancar **deshabilitadas**, límites de memoria y rotación de logs como punto de partida) y `.env.production.example`. Detalle: [PREPARACION_PRODUCCION_I57](PREPARACION_PRODUCCION_I57_2026-10-28.md).
* Retención: ninguna purga física de documentos en el código (verificado); avisos 60/30/7/0 configurables y marcados como propuesta; lista de preparación `GET /api/admin/readiness`.

## F. Git y migraciones

* Rama `feature/completitud-funcional-post-v55`, commits locales de I-5.7: `3ef9cbe` (código, V60, pruebas, scripts), `738b66d` (estabilización y pre-validación), `8cb516f` (documentación y evidencia) y el commit final del informe. Árbol limpio. Sin push.
* Flyway: **habitual V47** (sin tocar); **stack aislado V60**; copia migrada del ensayo V60 (descartada). Migración nueva: **V60** (`V60__endurecimiento_politicas_y_documentos_heredados.sql`): triggers de inmutabilidad (decisiones, consultas, políticas, documentos), `origen_registro`/`hash_momento`/regularización y `lote_activacion`/`referencia_aprobacion`. Herramientas de despliegue: `invoke-prepared-flyway-v60.ps1` y `FlywayMigrationRunner` con autorización específica del objetivo 60 (la V55 sigue funcionando); `prevalidate-migrations.ps1` ahora avisa de licencias de comandante duplicadas (V57) y de documentos heredados (V59/V60).

## Fase 6 — flujos operativos

Defecto real corregido: respuestas tardías que pisaban datos más nuevos en el panel del comandante (reaparecían los botones de aceptar tras aceptar), Operaciones, respuestas del DTS, hangar, AA2000, bitácora, ruta y clasificaciones; control negativo incluido. Mapa de flujos por rol, diferencias sanitario/no sanitario y cobertura de concurrencia: [AUDITORIA_FLUJOS_OPERATIVOS_I57](AUDITORIA_FLUJOS_OPERATIVOS_I57_2026-10-28.md).

## G. Lista de bloqueos

**Técnicos**
* Antivirus completo no probado por falta de memoria en este equipo (se prueba al disponer del equipo recomendado con `verificar-antivirus-produccion.cjs`).
* Residual aceptado/documentado: el usuario de aplicación de SQL Server es `db_owner` (necesario para que Flyway migre); recomendable separar credenciales de migración y ejecución. El tablero general no se actualiza solo (limitación conocida). Sin CI remoto (requiere push). Rendimiento no medido con volúmenes reales de producción.

**Decisiones de negocio**
* Contenido de la política de suficiencia (tipos de habilitación, vuelos sanitarios/operativos, categorías de aeronave —normalizar el texto libre «tipo» de la flota—, jurisdicción, consulta externa, aptitudes).
* Política de retención documental y plazos legales; plazos de aviso (60/30/7/0 propuestos); tripulación mínima por operación (no modelada).
* Autorización de la ventana de migración, del push y del despliegue.

**Dependencias externas**
* Equipo para ClamAV completo con salida a Internet (freshclam).
* Proveedor SMTP real (dominio, SPF/DKIM, credenciales).
* ANAC y REFEPS/SISA no ofrecen API acreditada: la consulta seguirá siendo manual.
* Copia de respaldos y claves fuera del equipo (no autorizada ni realizada).
