# Documentos anteriores a V59: estrategia de regularización (I-5.7, fase 3)

Fecha: 2026-10-28. Migraciones: V59 (clasificación inicial) y **V60** (origen permanente y trazabilidad de la huella).

## 1. Situación

V59 agregó a `documentos_habilitacion` el análisis antimalware, la huella SHA-256 y la cuarentena. Los documentos cargados antes quedaron en `LEGADO_SIN_ANALISIS`, sin huella ni análisis. En el ensayo V47→V59 se conservaron ocho de esos documentos.

**La base habitual (V47) no tiene ninguna habilitación ni ningún documento de habilitación** (consulta de sólo lectura el 2026-10-28: 1 usuario, 0 habilitaciones, 0 documentos, 0 vuelos, 0 aeronaves). Por lo tanto la migración real **no dejará documentos heredados**; los ocho del ensayo provienen de la siembra de datos representativos del ensayo (`scripts/ensayo-sembrar-v47.cjs`). La estrategia queda implementada y probada igualmente, porque un entorno que haya operado antes de V59 la necesita y porque el procedimiento de restauración de una copia con datos reales también lo requiere.

## 2. Principios

1. **No se toca el archivo original ni su historial.** La regularización sólo lee el archivo almacenado; no lo reescribe ni lo mueve.
2. **Nada se presume limpio por haberse cargado antes.** Un documento heredado permanece restringido hasta que un análisis real lo declare limpio.
3. **Sin falsificar estados ni resultados históricos.** No se inventa una fecha de análisis anterior ni se completa el motor con un valor ficticio; el estado `LEGADO_SIN_ANALISIS` sólo cambia cuando hay un resultado real (`LIMPIO` o `RECHAZADO`).
4. **La condición de heredado es permanente** (`origen_registro = ANTERIOR_V59`, V60), aunque después se analice: sigue siendo visible quién y cuándo lo regularizó.
5. **La huella calculada después no prueba lo que no puede probar.** `hash_momento` distingue `CARGA` (el archivo no cambió desde que se recibió) de `REGULARIZACION` (calculada después: sólo prueba que no cambió desde entonces). Así se muestra en pantalla y en el historial.
6. **Si no puede analizarse, queda restringido y se explica por qué**, sin cambiar a un estado inventado.

## 3. Modelo (V60)

| Columna | Significado |
|---|---|
| `origen_registro` | `ANTERIOR_V59` (cargado sin análisis obligatorio) o `POSTERIOR_V59`. V60 clasifica como heredados los documentos que V59 dejó `LEGADO_SIN_ANALISIS` sin huella ni fecha de análisis. |
| `hash_momento` | `CARGA` o `REGULARIZACION`; obligatorio si y sólo si hay huella (CHECK). |
| `fecha_regularizacion`, `id_usuario_regularizacion` | Quién y cuándo regularizó; sólo en heredados (CHECK). |

Triggers (V60, `tr_documentos_habilitacion_integridad`): el archivo (`clave_archivo`), la habilitación, el propósito, el origen, **una huella ya registrada**, su momento y una baja ya registrada **no pueden modificarse**; las filas no se eliminan. Asignar la huella a un heredado (NULL → valor) sí está permitido, y es exactamente lo que hace la regularización. Verificado con intentos reales de `UPDATE`/`DELETE` en SQL Server (`e2e-politicas-documentos-v60`, sección A).

## 4. Qué ocurre con un documento heredado

| Resultado de la regularización | Estado final | Huella | Descarga / sustento de verificaciones |
|---|---|---|---|
| clamd real: sin amenazas y PDF estructuralmente válido | `LIMPIO` (origen `ANTERIOR_V59` se conserva) | `REGULARIZACION` | Habilitados |
| clamd real: amenaza detectada | `RECHAZADO` | `REGULARIZACION` | No |
| Estructura PDF no válida (o con contenido activo) | `RECHAZADO` (motor `validacion-estructural-pdf`) | `REGULARIZACION` | No |
| Archivo ausente del almacenamiento | `LEGADO_SIN_ANALISIS` (sin cambios) | Ninguna | No; la explicación del último intento queda en `detalle_analisis` |
| Analizador no configurado, caído o con base no acreditada | `LEGADO_SIN_ANALISIS` (sin cambios) | Se registra si el archivo existe | No |
| La huella registrada no coincide con el archivo | sin cambios, integridad no demostrada | — | No; se audita `INTEGRITY_FAILURE` |

Otras reglas:

- **Descarga**: antes de este incremento la descarga permitía un documento heredado sin analizar («para que pudiera revisarse»). **Se cerró**: sólo se descarga un documento `LIMPIO`; el mensaje explica que debe regularizarse. Este cambio era necesario para cumplir «si no puede analizarse, permanece restringido».
- **Verificaciones nuevas**: un documento heredado no analizado no sustenta una verificación (`DOCUMENTACION_NO_LIMPIA`), igual que antes.
- **Verificaciones ya vigentes que se apoyaban en un documento heredado**: siguen vigentes (fueron una revisión humana anterior; el riesgo de un archivo sin analizar es de malware, no de autenticidad), pero **el sustento documental figura como pendiente** en cada habilitación y en el informe. **Si el análisis rechaza el único documento que sustentaba una verificación vigente, la habilitación vuelve a `PENDIENTE`** (con decisión «Revisión requerida» en el historial) y deja de ser suficiente; las tripulaciones de vuelos abiertos reciben el aviso de revisión de elegibilidad por el mecanismo ya existente.
- El titular de la habilitación no puede regularizar sus propios documentos (`AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA`).

## 5. Interfaz y API

- Administración → Política: panel **Documentos anteriores a V59** (cuántos, cuántos sin huella, archivos ausentes, analizador disponible, habilitaciones verificadas que sostienen sólo documentos heredados, vuelos abiertos con tripulantes en esa situación) y botón de lote.
- En cada habilitación: etiqueta «Documento anterior a V59», explicación de la restricción, «Regularizar (huella y análisis)», y la huella rotulada según su momento.
- API (sólo `ADMINISTRADOR`): `GET /api/professional-credential-documents/legacy/report`, `POST …/legacy/regularize?limit=N` (1–500, una ejecución a la vez, cada documento en su transacción) y `POST …/{id}/regularize`.

## 6. Procedimiento

1. Migrar a V60 (ver `PROCEDIMIENTO_ACTUALIZACION_V47_V60.md`). Los heredados quedan restringidos; nada se pierde.
2. Con el antivirus **acreditado** (`verificar-antivirus-produccion.cjs` y lista de preparación en verde), ejecutar el lote desde el panel o la API hasta que `pendingActive` sea 0. Repetir mientras haya pendientes.
3. Revisar el informe: documentos rechazados, habilitaciones devueltas a `PENDIENTE` y archivos ausentes (esos requieren recuperar el archivo desde el respaldo o solicitar uno nuevo; no se descartan).
4. Sin antivirus acreditado **no ejecutar** la regularización: los documentos permanecen restringidos de forma segura, y las habilitaciones que dependían de ellos siguen mostrando el sustento pendiente.

## 7. Pruebas

- Integración (H2) `PolicyActivationAndLegacyIntegrationTest`: restricción y no descarga, regularización limpia (origen conservado, huella `REGULARIZACION`, rótulo), analizador caído o archivo ausente, amenaza que devuelve la verificación a revisión, autoverificación denegada, informe y lote.
- E2E contra SQL Server y ClamAV reales (`e2e-politicas-documentos-v60`): los mismos escenarios con el motor real (EICAR real, archivo inexistente, PDF truncado), integridad de la huella (SHA-256 igual al del archivo original), descarga íntegra tras regularizar, auditoría `REGULARIZE`, decisión «anterior a V59… no prueba integridad desde la carga original», y el lote.
- Regularización a escala sobre la copia migrada del ensayo: ver el informe final (fase 7).
