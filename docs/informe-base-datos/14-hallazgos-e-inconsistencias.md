
# Hallazgos e inconsistencias

Sólo se documenta; **no se corrigió nada**. Clasificación: **Error confirmado** (verificado contra el esquema o el código), **Riesgo potencial**, **Decisión de diseño válida** (parece una rareza pero está justificada) o **Duda pendiente** (no se pudo determinar con certeza a partir del código y el esquema analizados).

## A. Errores confirmados

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| A1 | **63 grupos de índices no únicos duplicados** (misma tabla, mismas columnas): casi todas las FK tienen dos índices, uno con el nombre antiguo (`idx_vuelos_aeronave_id`) y otro con el nuevo (`idx_vuelos_id_aeronaves`) | Catálogo `sys.indexes` (lista completa en el capítulo de catálogos) | Espacio y costo de escritura duplicados; sin efecto funcional. Resto de los renombres V8/V27/V28 |
| A2 | **7 índices creados por migraciones no existen en el esquema vivo**: `ix_vuelos_aeronave_estado` (V18), `ix_aeronaves_aeropuerto_actual_activo` (V18), `ix_usuarios_activo_estado` (V19), `ix_perfiles_comandante_provincia_actual` (V20), `ix_negociaciones_horario_vuelo_fecha` (V20), `ix_vuelos_motivo_cancelacion` (V21), `ix_vuelos_tipo_vuelo_estado` (V23) | Búsqueda de cada nombre en `sys.indexes` (no está); V24 reconstruyó las tablas | Las consultas de disponibilidad por aeronave/estado y por estado de cuenta pierden un índice compuesto (rendimiento) |
| A3 | El CHECK **`ck_negociaciones_horario_motivo`** (V20: motivo obligatorio en contrapropuesta, rechazo y rechazo de contrapropuesta) **no existe** en el esquema vivo | `sys.check_constraints` sólo tiene `ck_negociaciones_horario_tipo` | La obligatoriedad del motivo depende sólo del servicio |
| A4 | **Columnas que ninguna ruta de código escribe**: `informacion_hangar.combustible_litros` (sólo se copia entre versiones), `roles.descripcion_rol`, `vuelos_sanitarios.origen_solicitado_legacy`, `vuelos_sanitarios.destino_solicitado_legacy`, `bitacora_vuelos.valor_anterior`, `bitacora_vuelos.valor_nuevo` | Búsqueda de setters y de SQL en el repositorio | Campos muertos que confunden; candidatos a retirarse |
| A5 | **Endpoint heredado `POST /api/catalogs/airports`** guarda un aeropuerto con sólo los textos del esquema original (sin `id_provincias`, `id_localidades`, `codigo_oficial`), sin auditoría ni control de duplicados | `CatalogController.createAirport`; el frontend sólo hace GET sobre ese recurso | Un aeropuerto así no tiene provincia: las validaciones por provincia del servicio podrían fallar con él. Convive con el alta correcta `/api/admin/geography/airports` |
| A6 | Cambiar los roles de un usuario **borra y reinserta** todas sus filas de `usuarios_roles` | `AuthService.updateUser` | `fecha_asignacion` de los roles que se mantienen se reinicia; se pierde su antigüedad |
| A7 | **Columnas de versión de fila sin uso:** `documentos_vuelo.row_version` y `obligaciones_informe_final.version_fila` (rowversion) no están mapeadas por JPA | Entidades sin @Version sobre ellas | Control optimista previsto que no se usa (se usa bloqueo pesimista) |
| A8 | `obligaciones_informe_final.numero_obligacion` vale siempre 1 y `es_actual` siempre 1 | Único setter de ambos al crear | Parte del diseño admite varias obligaciones por vuelo que ningún flujo crea |
| A9 | **Campos de fecha que nunca cambian:** `pacientes.fecha_actualizacion` e `informacion_medica_vuelo.fecha_actualizacion` | Ausencia de endpoints de modificación | Información engañosa (parece que se auditan cambios) |

## B. Riesgos potenciales

| # | Riesgo | Detalle |
|---|---|---|
| B1 | **CASCADE desde `vuelos`** hacia 11 tablas (`bitacora_vuelos`, `coordinaciones_aa2000`, `documentos_vuelo`, `informacion_hangar`, `informacion_medica_vuelo`, `informes_finales_vuelo`, `instantaneas_clima`, `notificaciones`, `rutas_vuelo`, `vuelos_sanitarios`, `vuelos_tripulantes`) | Un DELETE manual de un vuelo destruiría su historia operativa. La aplicación no tiene endpoint de borrado ni la base impide el DELETE (las FK con NO ACTION desde `obligaciones_informe_final`, `negociaciones_horario_vuelo` y `eventos_auditoria` lo bloquearían sólo si existen esas filas) |
| B2 | `notificaciones` **sin purga**; en la base de pruebas supera 1,5 millones de filas | Crecimiento ilimitado; el panel pagina, pero la tabla no se archiva |
| B3 | `bloqueos_documento_vuelo` vencidos **no se limpian** | Quedan filas obsoletas hasta que se recuperan; no afectan la lógica (se comparan fechas) |
| B4 | **Validaciones sólo en servicio:** diagnóstico y condición médica (la columna admite NULL), unicidad de nombre de documento activo por vuelo, inmutabilidad de `negociaciones_horario_vuelo`, recorrido de la ruta, condiciones/favorable del clima | Un INSERT/UPDATE directo en SQL podría violar reglas que la aplicación sí impone |
| B5 | **Convenciones de tiempo mezcladas:** hora civil (vuelos, solicitudes, contactos), UTC (auditoría, habilitaciones), DATETIMEOFFSET (obligaciones, bitácora), DATETIME2(3) vs DATETIME2(7) | Riesgo de errores al cruzar tablas o en reportes; hay conversión explícita sólo en algunos servicios |
| B6 | `eventos_auditoria.entidad_id` **no tiene FK** | Diseño intencional (el evento sobrevive al objeto), pero no hay integridad sobre el id |
| B7 | **Archivos fuera de la base** (documentos, informes, habilitaciones) | Si se pierde el volumen o se borra un archivo, la fila queda huérfana sin que el motor lo detecte; la huella sólo se verifica en la descarga |
| B8 | `usuarios.esta_activo` y `estado_cuenta` **redundantes** sin CHECK que los ate | El código los mantiene coherentes; un UPDATE directo podría desacoplarlos |
| B9 | `perfiles_comandante.id_provincias` nace NULL | Un comandante recién creado no es asignable hasta que alguien fije su provincia |
| B10 | `vuelos_sanitarios.id_localidad_origen/destino` e `id_prioridades_vuelo` admiten NULL aunque el alta los exige | Datos migrados; consultas que asumen no nulo deben tolerarlo |
| B11 | Roles **OPERACIONES** y **CENTRO_OPERACIONES** duplicados con el mismo nombre visible | Duplicidad histórica (V12); las autorizaciones aceptan ambos, pero un usuario con uno solo no ve lo mismo en listados de roles |
| B12 | **Nombres inconsistentes:** `tamano_bytes` (habilitaciones) vs `tamanio_bytes` (resto), `contacto_aa2000` (columna genérica de contacto), `codigo_numerico` (bit), `fecha_utilizacion` (en realidad «fecha de cierre») | Aumenta la carga cognitiva y el riesgo de confundir semántica |
| B13 | `aeropuertos.ciudad` y `aeropuertos.provincia` (texto) duplican `id_localidades` e `id_provincias` | Pueden divergir si se edita sólo uno |
| B14 | **Tablas de auditoría duplicadas en parte:** `decisiones_habilitacion` y los eventos `PROFESSIONAL_CREDENTIAL` en `eventos_auditoria` | Doble escritura (una consultable por habilitación, otra global); deben mantenerse sincronizadas por el código |
| B15 | Contraseñas temporales se **devuelven una vez** al administrador (reactivación, restablecimiento) | Es una decisión de usabilidad con riesgo de exposición en pantalla; el hash nunca se muestra |

## C. Decisiones de diseño válidas que parecen anomalías

| # | Observación | Por qué es válida |
|---|---|---|
| C1 | `vuelos.id_estados_vuelo` NULL | Un sanitario aún sin recursos (o rechazado) no tiene estado operativo; la solicitud tiene su propio estado |
| C2 | `usuarios.nombre_usuario`/`hash_contrasena` NULL | Cuentas pendientes de activación; índices únicos filtrados |
| C3 | `personas.dni` NULL | Pacientes sin DNI conocido y administrador inicial |
| C4 | Sin DELETE en la mayoría de las tablas | Bajas lógicas por trazabilidad |
| C5 | `vuelos_sanitarios` con PK propia y FK única a `vuelos` | Relación 1:0..1 sin perder una PK numérica uniforme |
| C6 | Varias tablas sin FK de usuario con CASCADE (todas NO ACTION) | Se evita borrar un usuario con historial |
| C7 | Catálogos que sólo cambian por migración | Reglas estables y versionadas; evita pantallas de mantenimiento sin necesidad |
| C8 | Columna calculada `numero_licencia_normalizada` declarada anulable | SQL Server marca como anulables las columnas calculadas aunque nunca queden vacías aquí |

## D. Dudas pendientes de verificación

| # | Duda | Qué evidencia falta |
|---|---|---|
| D1 | ¿Qué pantalla invoca `POST /api/patients` (alta directa de paciente)? | El frontend analizado no la llama; podría ser un recurso de integración o de pruebas |
| D2 | ¿Se retiraron deliberadamente los 7 índices de A2? | Registro de la decisión de V24 (el script reconstruye tablas sin reponerlos) |
| D3 | ¿Existe un proceso de **supresión de datos personales** (derecho de supresión)? | No hay endpoint ni migración que anonimice `personas`; `requestDataAction` sólo protege la evidencia y registra la solicitud |
| D4 | Contenido real de `politicas_habilitacion` en producción | La base habitual está vacía (0 filas): la suficiencia no puede evaluarse hasta que se activen políticas |
| D5 | Comportamiento con **datos reales** y volumen de producción | La base habitual local tiene muy pocos datos (4 personas, 4 usuarios, 0 vuelos); la de pruebas tiene datos sintéticos |
| D6 | Validaciones presentes **sólo en el frontend** | No se auditaron sistemáticamente todas las validaciones del cliente contra el servidor; las revisadas (contraseña ≥ 12, DNI, contactos, urgencia, motivos) también están en el backend |
| D7 | Ruta de limpieza de archivos huérfanos | No se encontró un proceso de reconciliación disco ↔ base |

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md)
