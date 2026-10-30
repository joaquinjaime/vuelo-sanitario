# Cierre del módulo documental: baja lógica y compatibilidad de tipos — 2026-10-24

Continuación de [INTEGRACION_DOCUMENTOS_VUELO_2026-10-24.md](INTEGRACION_DOCUMENTOS_VUELO_2026-10-24.md). Se completaron las dos reglas que ese informe dejó como decisiones pendientes y se reutilizaron los mecanismos existentes (`DocumentService`, `FlightDocuments`, auditoría, bloqueos). No se creó ninguna tabla. Flyway: **V52 y V53** nuevas (aplicadas sólo a la base aislada E2E); base habitual **sin tocar, V47**.

## 1. Diagnóstico previo

* `documentos_vuelo.esta_activo` existía y el listado ya filtraba por él, pero **ningún proceso lo cambiaba**: un documento cargado por error no podía retirarse. La tabla no tenía dónde registrar quién, cuándo ni por qué.
* Las bases conocidas no tienen documentos inactivos (habitual: 0 documentos; E2E: 0 inactivos) ni combinaciones incompatibles (E2E: 0 `PARTE_MEDICO` en vuelos sin extensión sanitaria; habitual: 0 documentos).
* Un vuelo operativo aceptaba `PARTE_MEDICO`.
* Hallazgo adicional: las **solicitudes sanitarias rechazadas** no tienen estado de vuelo (`estados_vuelo` no contiene `RECHAZADO`; el rechazo vive en `vuelos_sanitarios`), de modo que la regla de sólo consulta del incremento anterior no las alcanzaba y seguían aceptando documentos. Hangar y coordinaciones ya las trataban como inmutables; ahora los documentos también (`stateCode` cae al estado de la solicitud cuando el vuelo no tiene estado).
* Corrección de un dato anterior: el informe del incremento previo habló de "31 funcionales y 10 parciales". Era un error de suma. El encabezado de la matriz ya contaba las cuatro tablas documentales como funcionales desde V41/V43 y la fila de detalle seguía diciendo "PARCIAL"; el recuento real de la tabla de detalle es **27 funcionales y 14 parciales** (ver §9).

## 2. Decisiones de negocio aplicadas

### Baja lógica

Se aplicó la política propuesta, sin conflictos con reglas existentes.

| Condición | Resultado |
|---|---|
| El documento debe pertenecer al vuelo de la URL (`POST /flights/{flightId}/documents/{itemId}/deactivate`) | 404 si no (no distingue "inexistente" de "de otro vuelo") |
| Debe estar activo | 409 "El documento ya fue retirado"; el primer motivo, responsable y fecha no cambian |
| Vuelo `FINALIZADO`, `COMPLETADO`, `CANCELADO` o solicitud `RECHAZADO` | 400 "es de sólo consulta documental" |
| Motivo | Obligatorio, ≤ 500 caracteres, sin caracteres de control (400); se guarda recortado |
| Bloqueo vigente de otra persona | 409 "bloqueado por X"; un bloqueo propio o vencido se elimina **en la misma transacción** y la baja lo registra (`bloqueoLiberado`) |
| Versiones, archivos, vínculos | Se conservan íntegros; nunca hay borrado físico |
| Documento retirado | No admite nuevas versiones ni nuevos bloqueos (409), aunque quedara un bloqueo antiguo; no puede volver a retirarse |
| Nombre | El nombre de un documento retirado puede reutilizarse (la unicidad por vuelo cuenta sólo documentos activos) |
| Informes finales, ruta, clima, hangar, bitácora | No se tocan |

### Permisos de baja (servidor)

| Rol | Puede retirar |
|---|---|
| `OPERACIONES`, `CENTRO_OPERACIONES` | Cualquier documento activo de un vuelo editable |
| `COMANDANTE` | Sólo los documentos que **él cargó** (autor de la versión 1), en el vuelo que comanda y mientras no esté bloqueado por un informe vencido (`COMANDANTE_BLOQUEADO`) |
| `DTS` | No |
| `ADMINISTRADOR` | No: no se amplió ningún permiso (403) |

Razón de distinguir al comandante: puede cargar documentos de su vuelo, pero no debe poder retirar los que cargó Operaciones (autorizaciones, planes). Operaciones gestiona todos los recursos del vuelo. El servidor calcula `puedeRetirar` por usuario y documento, y la interfaz sólo lo muestra: no recompone la política.

### Consulta histórica restringida

* Los retirados desaparecen del listado ordinario para todos.
* `GET /flights/{flightId}/documents/retired` (motivo, responsable, fecha en hora civil, cantidad de versiones, última versión) y el historial/descarga/estado de bloqueo de un documento retirado sólo se permiten a **Operaciones y al comandante del vuelo**. El DTS solicitante, un DTS ajeno, un comandante ajeno y ADMINISTRADOR reciben 403 aunque conozcan el identificador (se verificó en historial, descarga, bloqueo y listado).
* Descargar una versión de un retirado se audita igual que cualquier descarga.

### Compatibilidad de tipos documentales

Tipos reales de `tipos_documento` y clasificación (por finalidad, no por nombre):

| Código | Nombre | Finalidad | Clasificación |
|---|---|---|---|
| `AUTORIZACION` | Autorización de vuelo | Autoriza un vuelo, sea sanitario u operativo | **General** |
| `PARTE_MEDICO` | Parte médico | Describe a un paciente; la información clínica sólo existe en la extensión sanitaria | **Sólo vuelo sanitario** |
| `PLAN_DE_VUELO` | Plan de vuelo | Plan de cualquier vuelo | **General** |
| `OTRO` | Otro documento | Comodín | **General** |

El catálogo no tiene columna de activación, por lo que no existen tipos "deshabilitados" que validar. No se restringió ningún tipo cuya finalidad no estuviera clara.

**Representación:** una columna `tipos_documento.solo_vuelo_sanitario` (V53). Se prefirió al código fijo porque la regla pertenece al tipo, el catálogo es la única fuente, un tipo nuevo nace sin restricción hasta que se defina su finalidad y la interfaz no puede divergir. No hay tabla de compatibilidad (no hay una relación N:M que modelar).

**Dónde se aplica (todos los caminos de escritura de documentos):**

| Entrada | Regla |
|---|---|
| Alta (`POST /flights/{id}/documents/pdf`) | 400 «El tipo documental «Parte médico» sólo puede registrarse en vuelos sanitarios», antes de guardar nada |
| Nueva versión y bloqueo sobre un documento histórico incompatible | 409 «…retire este documento y regístrelo con un tipo compatible» |
| Cambio de tipo | No existe esa operación (el tipo es inmutable): no hay camino alternativo |
| Selector | `GET /flights/{id}/documents/types` devuelve sólo los tipos admitidos para ese vuelo (sanitario: 4; operativo: 3) a quien opera el vuelo; la interfaz ya no filtra ni lista un catálogo global |

**Histórico:** no se reclasifica ni se elimina nada. Un documento ya incompatible se sigue listando, descargando y consultando; no admite más versiones ni bloqueos y puede retirarse con motivo. Se probó simulando el caso sobre un registro propio de la prueba.

## 3. Cambios SQL (Flyway)

* **V52** `baja_logica_documentos_vuelo`: `fecha_baja DATETIME2(3)`, `id_usuario_baja` (FK `usuarios`), `motivo_baja NVARCHAR(500)`; `ck_documentos_vuelo_baja` impone que un documento activo no tenga datos de baja y que uno inactivo tenga fecha, responsable y motivo no vacío; un índice `(id_vuelos, esta_activo)`. Cualquier baja anterior (ninguna en las bases conocidas) se conserva y se completa con el autor de su primera versión y una leyenda explícita; si no pudiera atribuirse, la migración se detiene con un `THROW` y un mensaje.
* **V53** `compatibilidad_tipos_documento_con_tipo_vuelo`: `solo_vuelo_sanitario BIT NOT NULL DEFAULT 0` y `PARTE_MEDICO = 1`.
* Ninguna migración aplicada fue modificada. Habitual: V47 (sin aplicar V48–V53; pendientes de autorización). E2E: V53.
* Nota: el índice de V52 se suma a índices ya redundantes de la tabla (`idx_documentos_vuelo_vuelo_id`, `idx_documentos_vuelo_id_vuelos`, …). Depurarlos sigue pendiente y requiere una migración propia.

## 4. Auditoría

Nuevo evento `DOCUMENT/DEACTIVATE` (etiqueta "Baja lógica") en la misma transacción: entidad = documento, antes `{"activo":true}`, después `{"activo":false,"motivoBaja":"…","versiones":n,"bloqueoLiberado":true|false}` (motivo escapado; sin nombres ni contenido). Operaciones lo ve siempre; el comandante, junto con altas y versiones; el DTS no ve eventos documentales. Una baja rechazada no deja evento. Se agregaron las etiquetas de los campos nuevos.

## 5. Cambios de código

* Backend: `DocumentService` (`deactivate`, `listRetired`, `allowedTypes`, `requireCompatible`, `requireActive`, `requireVisible`, `canRetire`, estado de la solicitud), `DocumentController` (3 endpoints), `DocumentDtos` (`puedeRetirar`, `RetiredDocumentView`, `DeactivateRequest` estricta), `FlightAuthorizationService` (`operationsStaff`, `mayReadRetired`), entidades `FlightDocumentItem`/`DocumentType`, repositorios, `AuditAccessPolicy`, `AuditCatalog`, `V52`, `V53`.
* Frontend (`documents.jsx`, dentro del panel de documentos del vuelo; sin pantalla nueva): botón "Retirar documento" sólo si el servidor lo permite, advertencia, motivo obligatorio, confirmación, errores y conflictos sin perder lo escrito, listado actualizado, "Ver documentos retirados" (sólo Operaciones y comandante) con descarga de sus versiones y sin controles de edición, selector alimentado por el servidor.
* Pruebas: `DocumentServiceTest` (+17), `DocumentAuthorizationTest` (+2, con cuerpo estricto), `CommanderWriteEndpointsGuardTest` (registra el nuevo endpoint del comandante), `documents.test.jsx` (+7), `e2e-documentos.cjs` (bloques L y M, asserts SQL de las restricciones nuevas), `e2e-documentos-integracion-ui.cjs` (bloque G), `e2e-cierre.cjs` (la baja también se bloquea al comandante con informe vencido).

## 6. Resultados

| Verificación | Resultado |
|---|---|
| Backend completo (`mvn -o test`) | **358 pruebas aprobadas** (339 + 17 en `DocumentServiceTest` + 2 en `DocumentAuthorizationTest`), 0 fallos |
| Frontend completo (`vitest run`) | **150 pruebas aprobadas** (143 + 7 en `documents.test.jsx`), 13 archivos; `vite build` correcto |
| `e2e-documentos.cjs` (API real, SQL Server real) | 15 bloques aprobados (los 13 anteriores + L baja lógica + M compatibilidad) |
| `e2e-documentos-integracion-ui.cjs` (Chrome real) | 8 bloques aprobados (los 7 anteriores + G baja y compatibilidad desde la interfaz) |
| **Suite Node completa en una única pasada** | **23/23 scripts aprobados** |

Qué comprueban los bloques nuevos, con SQL Server real: **L** — 7 cuerpos inválidos (motivo vacío, en blanco, de 501 caracteres, con carácter de control, ausente, nulo y campo desconocido) y ausencia de cuerpo; 403 para DTS (solicitante y ajeno), comandante ajeno, comandante del vuelo que no cargó el documento y ADMINISTRADOR; 404 por documento de otro vuelo, inexistente o vuelo inexistente; conflicto 409 con un bloqueo vigente ajeno y baja con el propio bloqueo (la fila de bloqueo desaparece y el evento informa `bloqueoLiberado`); la fila queda con `esta_activo=0`, fecha en UTC, responsable y motivo; sus 2 versiones y sus archivos físicos se conservan (SHA-256); desaparece del listado de Operaciones, DTS y comandante; nuevas versiones y bloqueos se rechazan (409) también para quien tenía un bloqueo anterior; segunda baja 409 sin alterar el primer motivo; historial y descarga idénticos para Operaciones y el comandante, 403 para DTS, comandante ajeno y administración; el comandante retira lo que cargó y no lo de Operaciones; nombre reutilizable; 1 baja entre 3 simultáneas, 6 rondas baja-contra-bloqueo y 4 baja-contra-versión sin incoherencias (un retirado nunca conserva un bloqueo vigente, numeración contigua y una sola versión vigente); sin bajas en vuelos finalizados, cancelados ni solicitudes rechazadas (que además dejan de aceptar altas, versiones y bloqueos). **M** — indicadores del catálogo en SQL (sólo `PARTE_MEDICO`), selector del servidor (4 tipos para el vuelo sanitario, 3 para el operativo, 403 a quien no opera el vuelo, 404 vuelo inexistente), parte médico rechazado en el vuelo operativo para Operaciones y comandante sin documentos ni archivos, tipos generales aceptados en ambos y registro histórico incompatible conservado/descargable pero sin versiones ni bloqueos, retirable. **K** — la base rechaza una baja sin motivo o responsable, datos de baja en un documento activo, un motivo en blanco, un responsable inexistente y un código de tipo repetido. **G (Chrome)** — advertencia y motivo obligatorio, cancelar sin efecto, retiro con SQL y auditoría, "documentos retirados" con descarga idéntica y sin controles de edición, el DTS no los ve ni se le ofrece la consulta, conflicto por bloqueo ajeno conservando lo escrito, selector del vuelo operativo sin parte médico y comandante que sólo retira lo suyo.

**Cómo leer estos resultados**

* La suite de 23 scripts se ejecutó **una vez, completa, sin repetir scripts individuales**: 23/23. Durante sus primeros minutos coincidió con la suite backend en la misma máquina (por eso los tiempos son mayores que en la ejecución anterior); ningún script falló.
* Antes de esa pasada, `e2e-documentos` y `e2e-documentos-integracion-ui` se iteraron individualmente mientras se escribían los bloques nuevos (un error de aserción propia por el recuento de claves foráneas, un umbral de bajas, y dos esperas de la interfaz); esas ejecuciones no cuentan como la regresión.
* La suite backend completa se ejecutó dos veces: la primera con 1 fallo (`CommanderWriteEndpointsGuardTest`, que exige registrar cada endpoint de escritura del comandante; se registró `DocumentController.deactivate` y se agregó su caso a `e2e-cierre`) y la segunda, 358/358.
* No se ejecutaron: los scripts Python (no hay Python en la máquina), un recorrido E2E completo hasta `COMPLETADO`, ni la aplicación de V48–V53 sobre una copia de la base habitual.

**Estado de las bases:** habitual en **V47** (consulta de sólo lectura; 0 documentos; contenedores sin reiniciar, ~15 h de actividad ininterrumpida); E2E aislada en **V53** (V52 y V53 aplicadas por el arranque del backend aislado), 41 tablas. No hay commit ni push. Sin volúmenes borrados, sin respaldos tocados.

## 7. Cobertura documental y pendientes

Las cuatro tablas documentales conservan su clasificación **FUNCIONAL**, ahora sin las dos brechas de negocio que declaraban. Pendientes (todos de prioridad baja): validación de contenido PDF más allá de cabecera/MIME/extensión/tamaño; sin notificación de nuevas versiones; el lease vencido no se purga; sin mantenimiento ni activación de `tipos_documento` (catálogo estático); índices redundantes; el estado `COMPLETADO` se prueba en unidad e interfaz y no con un recorrido E2E completo; la baja no tiene "restaurar" (decisión deliberada: se registra de nuevo y la historia queda).

## 8. Próxima implementación recomendada

Ver §9.2: rectificación controlada de DNI (identidad de personas y pacientes).

## 9. Las tablas parcialmente funcionales

### 9.1 Recuento verificado

El inventario real de `sys.tables` (E2E, V53) tiene **41 tablas de aplicación**. La tabla de detalle de la matriz clasifica **27 como funcionales y 14 como parciales**, que coincide con el encabezado histórico (27/14). Las 14 parciales son las que siguen; no hay 10.

### 9.2 Evaluación y agrupación por incremento

| Tabla | Proceso de negocio | Existente | Brechas concretas | Roles | Dependencias | Prioridad | Incremento |
|---|---|---|---|---|---|---|---|
| `personas` | Identidad de quien solicita, vuela o administra | Alta compartida, corrección de nombre/apellido/nacimiento por ADMIN con versión V48 y auditoría | **El DNI no puede corregirse**; el nombre en vuelos históricos es el actual | ADMINISTRADOR (corrige); DTS (detecta el error) | `pacientes`, `usuarios`, índice único de DNI, auditoría | **Alta** | **I-1** |
| `pacientes` | Ficha del paciente en la solicitud sanitaria | Alta/enlace con declaración, búsqueda paginada por DNI o nombre, selección en la solicitud | **Un DNI mal cargado no tiene remedio** (queda una ficha errónea o duplicada vinculada a vuelos); sin adjudicación de identidad | DTS, ADMINISTRADOR | `personas`, `vuelos_sanitarios`, búsqueda | **Alta** | **I-1** |
| `perfiles_comandante` | Elegibilidad y ubicación del comandante al asignar | Licencia y provincia; disponibilidad por provincia en la asignación; ubicación manual por Operaciones | E2E de licencia duplicada y de disponibilidad incompletos | OPERACIONES, ADMINISTRADOR | `vuelos`, `provincias`, `clasificaciones_tripulacion` | Media | I-3 |
| `clasificaciones_tripulacion` | Quién puede cumplir cada función | Alta y retiro por ADMIN, uso en disponibilidad, bloqueo de retiro con asignación activa | Sólo MEDICO recorrido en navegador | ADMINISTRADOR, OPERACIONES | `roles_tripulacion`, `habilitaciones_profesionales` | Media | I-3 |
| `roles_tripulacion` | Catálogo de funciones | Consumido por clasificación y tripulación adicional | Mantenimiento y todos sus valores sin E2E | Todos (consulta) | `clasificaciones_tripulacion` | Baja | I-3 (como catálogo estático) |
| `correos_electronicos` | Contacto personal | Mantenimiento propio en "Mi cuenta" con versión y baja lógica; auditoría | **Ningún proceso lo consume**; corrección administrativa sin política | Titular; OPERACIONES (consumidor) | `personas`, tripulación asignada | Media | I-2 |
| `telefonos` | Idem | Idem | Idem; sin reglas por país | Idem | Idem | Media | I-2 |
| `habilitaciones_profesionales` | Credencial verificada para la función | Registro, revisión manual, vigencia, auditoría | Exigencias normativas por función **sin definición externa**; sin verificación con la autoridad | ADMINISTRADOR | `roles_tripulacion`, `documentos_habilitacion` | Baja (bloqueada por normativa) | I-5 |
| `documentos_habilitacion` | Respaldo de la credencial | PDF privado, descarga, denegaciones | Sin antivirus ni análisis estructural del PDF | ADMINISTRADOR | `habilitaciones_profesionales` | Baja | I-5 |
| `rutas_vuelo` | Planificación y registro de la ruta | Versionado, comandante registra, Operaciones consulta, concurrencia y reinicio probados | Rutas previas a V37 sin revisar (la base habitual tiene 0 rutas); permisos en más combinaciones | COMANDANTE, OPERACIONES | `vuelos`, `aeropuertos` | Baja | I-6 |
| `provincias` | Ubicación de solicitud, comandante y aeronave | Consulta en formularios | E2E SQL de su uso; sin mantenimiento | Todos | `localidades`, `aeropuertos` | Baja | I-4 |
| `localidades` | Origen/destino de la solicitud DTS | Idem (4 037 filas) | Idem | DTS | `provincias` | Baja | I-4 |
| `aeropuertos` | Origen/destino operativo y ubicación de aeronaves | Consulta; alta por ADMIN | Mantenimiento y E2E SQL | OPERACIONES, ADMINISTRADOR | `provincias`, `localidades` | Baja | I-4 |
| `tipos_vuelo` | Clase del vuelo operativo | Selector de creación operativa (6 valores) | Valores fijos sin E2E de cada uno | OPERACIONES | `vuelos` | Baja | I-4 |

Varias tablas se completan con el mismo incremento (columna "Incremento"). Ninguna requiere un formulario genérico.

* **I-1 Rectificación controlada de DNI (personas, pacientes)** — recomendado como el siguiente.
* **I-2 Contacto operativo de la tripulación asignada (correos_electronicos, telefonos).**
* **I-3 Elegibilidad de la tripulación: ubicación del comandante, licencia y clasificaciones (perfiles_comandante, clasificaciones_tripulacion, roles_tripulacion).**
* **I-4 Catálogos de referencia (provincias, localidades, aeropuertos, tipos_vuelo):** decidir "catálogo estático" (como `roles` o `motivos_cancelacion`) y cerrarlos con E2E de uso, sin pantallas de mantenimiento.
* **I-5 Habilitaciones (habilitaciones_profesionales, documentos_habilitacion):** depende de una definición normativa externa.
* **I-6 Revisión de rutas históricas (rutas_vuelo).**

### 9.3 Siguiente incremento: I-1, rectificación controlada de DNI

* **Necesidad operativa:** la solicitud sanitaria es la primera etapa del ciclo y es donde más se escriben datos bajo apuro. Un DNI mal tipeado deja hoy una ficha de paciente errónea o duplicada, ya vinculada a vuelos, sin ninguna vía de corrección. Con un DNI duplicado o equivocado la búsqueda deja de encontrar al paciente correcto, lo que afecta la identificación clínica.
* **Tablas:** `personas` (DNI, versión V48), `pacientes`, `usuarios` (si la persona tiene cuenta), `eventos_auditoria`; sin tablas nuevas previsibles.
* **Roles:** ADMINISTRADOR corrige con motivo obligatorio; DTS y Operaciones ven el resultado. Reutiliza la corrección de nombre/nacimiento de `PatientDirectoryService`.
* **Integración:** dentro de la búsqueda y mantenimiento de pacientes que ya existe (no una pantalla nueva); el resultado se refleja en la solicitud y en el detalle de Operaciones.
* **Reglas a definir antes de codificar:** qué ocurre si el DNI correcto ya pertenece a otra persona (adjudicación: rechazar y derivar a una fusión explícita, fuera de alcance), cuándo se permite (sin cuenta activa o con ella), si el vuelo histórico debe conservar una instantánea del DNI anterior y cómo se invalidan sesiones/credenciales si la persona tiene cuenta.
* **Dependencias:** índice único filtrado de DNI (V47), versión optimista (V48), búsqueda paginada, auditoría enmascarada; una migración sólo si se decide la instantánea histórica.
* **Por qué ahora:** es el único proceso esencial del ciclo de vida de los vuelos sin salida cuando falla, afecta a dos tablas a la vez y reutiliza casi toda la infraestructura ya probada. I-2 (contactos) mejora la coordinación, pero nada se rompe sin él; I-3 a I-6 son validaciones o dependen de definiciones externas.
