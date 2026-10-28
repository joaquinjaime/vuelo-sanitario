# I-5.6 — Habilitaciones profesionales y documentación de habilitación

Estado: **en curso** (2026-10-28). Este documento se actualiza con cada incremento; las cifras de pruebas sólo se anotan cuando se ejecutaron.

## 1. Diagnóstico inicial (Fase 0), verificado en el entorno real

| Dato informado | Verificado |
|---|---|
| Rama `feature/completitud-funcional-post-v55`, árbol limpio, sin push | Sí (HEAD `a8e0b61`) |
| Base aislada en Flyway V58 | Sí (última migración aplicada: V58) |
| Base habitual en V47 | Sí (no se tocó en esta sesión) |
| Siete contenedores sanos | Sí |
| Matriz 40 funcionales / 2 parciales | Coincide con `MATRIZ_FUNCIONAL_I5_2026-10-26.md` |

Modelo previo de las dos tablas parciales:

* `habilitaciones_profesionales` (V35/V36): una fila por persona y función (`roles_tripulacion`), con tipo, número, organismo, fechas, `vencimiento_no_aplica` y estado PENDIENTE/VERIFICADA/RECHAZADA/REVOCADA. **Cualquier** habilitación verificada y vigente de la función volvía elegible a la persona: no había noción de tipo de operación, categoría de aeronave ni jurisdicción, no existía política configurable, ni historial de decisiones propio (sólo auditoría), ni renovación, ni corrección solicitada, ni consulta externa.
* `documentos_habilitacion` (V35): archivo PDF con clave de almacenamiento, nombre, cargador y fecha. Sólo se validaba tamaño, MIME, extensión, cabecera `%PDF-` y la cola `startxref/%%EOF`. Sin hash, sin versión, sin análisis antimalware, sin baja controlada, sin retención y la descarga no se auditaba.

Datos en la base aislada antes de V59: 2.494 habilitaciones y 2.486 documentos (datos de pruebas E2E).

## 2. Dos conceptos que no se mezclan

| Concepto | Qué afirma | Qué NO afirma |
|---|---|---|
| **Revisión interna** (`estado_verificacion = VERIFICADA`) | Un administrador distinto del titular revisó la documentación y declara que acredita la función. | Que un organismo oficial la haya validado. |
| **Consulta externa manual** (`consultas_externas_habilitacion`) | Un administrador declara haber contrastado los datos con ANAC o con el Buscador Nacional de Profesionales de la Salud, con fecha, resultado y evidencia opcional. | Que el sistema consulte, automatice o reciba una respuesta del organismo. No hay API acreditada ni scraping. |

La interfaz y la API (`validationKind`) distinguen `REVISION_INTERNA_SIN_CONSULTA_EXTERNA`, `…_CON_CONSULTA_EXTERNA_MANUAL` y `…_NO_COINCIDENTE`.

## 3. Política de suficiencia (V59 `politicas_habilitacion`)

Regla única en `CredentialSufficiency`. Cada fila de política es una combinación **aceptada**: función + (tipo de vuelo | cualquiera) + (categoría de aeronave | cualquiera) + tipo de habilitación, con indicadores `requiere_jurisdiccion` y `requiere_consulta_externa`.

* **Sin política activa para la función → `POLITICA_HABILITACION_NO_CONFIGURADA`, nadie es elegible.** La migración no siembra ninguna regla: hacerlo sería inventar requisitos regulatorios.
* Con políticas pero ninguna aplicable al contexto → mismo código con mensaje específico.
* En un vuelo concreto, si la política exige una categoría de aeronave y el vuelo todavía no tiene aeronave → `CONTEXTO_OPERATIVO_INCOMPLETO` (no se asume).
* La habilitación debe coincidir en tipo (comparación sin tildes ni mayúsculas) y, si la política tiene categoría, la habilitación debe declarar esa misma categoría (`categoria_aeronave`). No se establecen equivalencias entre licencias, categorías o jurisdicciones.
* Jurisdicción: la política sólo puede exigir que la matrícula tenga jurisdicción registrada. **No se compara con la provincia del vuelo**, porque no se conoce una regla oficial que lo exija.
* Restricciones (texto libre): no son evaluables por máquina. Una habilitación con restricciones sólo puede verificarse si el revisor las acepta expresamente (`RESTRICCIONES_SIN_CONFIRMAR`) y el texto viaja en el mensaje de elegibilidad.
* `origen`: `CONFIGURACION_INTERNA` (decisión de la organización) o `FUENTE_OFICIAL_CITADA` (exige citar la fuente; el sistema **no** la verifica).
* Las políticas no se borran: baja con motivo, auditada. Cada alta/baja dispara la revisión de los vuelos abiertos (alertas `CREW_ELIGIBILITY_REVIEW`).

> **Consecuencia operativa para el despliegue:** al migrar a V59 ningún tripulante es elegible hasta que un administrador cargue la política (pantalla *Habilitaciones*). Es deliberado.

## 4. Ciclo de vida

`PENDIENTE → VERIFICADA | RECHAZADA | CORRECCION_SOLICITADA`; `VERIFICADA → REVOCADA`. Modificar una habilitación (salvo REVOCADA, que es definitiva) la devuelve a PENDIENTE; una edición idéntica no reinicia nada. El vencimiento se **deriva** de la fecha y del reloj de negocio (`lifecycle`: VIGENTE / POR_VENCER / VENCIDA). La renovación crea una habilitación nueva PENDIENTE (`id_habilitacion_renovada`); la anterior se conserva y sigue valiendo hasta vencer. Cada decisión queda en `decisiones_habilitacion` (actor, fecha, motivo, documento) además de la auditoría.

Separación de funciones: el titular no puede verificar, rechazar, revocar, registrar consultas externas, retirar documentos ni aplicar bloqueos sobre su propia habilitación (`403 AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA`), aunque sea administrador.

## 5. Documentos

Flujo: validación estructural con PDFBox (rechaza malformados, cifrados, JavaScript, acciones de lanzamiento/envío, archivos embebidos, RichMedia, XFA) → almacenamiento privado con SHA-256 → **cuarentena** → análisis antimalware (clamd por `INSTREAM`, fuera de toda transacción) → `LIMPIO | RECHAZADO | ERROR_ANALISIS`.

* Falla segura: sin analizador configurado o caído, el documento queda en `ERROR_ANALISIS`; no puede aprobarse ni descargarse. Hay reintento manual (`/rescan`) y periódico.
* Un documento `RECHAZADO` no se vuelve limpio con un nuevo análisis.
* Descarga autenticada (ADMINISTRADOR), solo `LIMPIO` o legado, verificando la huella; cada descarga se audita.
* Versiones: `numero_version` y `id_documento_reemplazado`; reemplazar o retirar es baja lógica con motivo; archivo, huella y registro se conservan. No se puede retirar el único documento limpio que sustenta una verificación vigente.
* Documentos anteriores a V59: `LEGADO_SIN_ANALISIS` (sin hash). Se pueden volver a analizar; no cuentan como limpios para una nueva verificación.

### Retención
No existe política de retención aprobada ni plazo legal definido por esta implementación. Comportamiento conservador: **no hay ninguna purga física**, ni siquiera de documentos retirados o reemplazados; `app.retention.credential-documents.purge-enabled` está fijo en `false` y el informe `/api/professional-credential-retention/report` lo declara. Existen bloqueos de conservación por documento (auditoría/legales) y las solicitudes de rectificación o supresión (Ley 25.326 como referencia) se registran y bloquean la evidencia hasta que se resuelvan fuera del sistema. **Decisión de negocio pendiente antes de operar con datos reales:** plazos, obligaciones de conservación y procedimiento de supresión.

## 6. Avisos de vencimiento
Ver `CredentialExpiryNoticeService`: umbrales configurables (60/30/7/0 días), clave `CRED_EXPIRY:<id>:<vencimiento>:<umbral>` única por usuario (índice único de `notificaciones`), una pasada a la vez por proceso, una transacción por habilitación, reloj y zona de negocio. Tras una caída emite sólo el umbral más urgente alcanzado; no avisa retroactivamente vencimientos de más de 30 días. Destinatarios: titular, administradores y, si el titular tiene asignaciones abiertas, Operaciones y Centro de Operaciones. El mensaje al titular no incluye número de matrícula; los demás identifican `#id` y usuario.
