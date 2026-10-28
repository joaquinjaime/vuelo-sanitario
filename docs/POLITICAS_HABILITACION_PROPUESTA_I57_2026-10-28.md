# Política de suficiencia profesional: propuesta inicial, matriz de decisión y activación (I-5.7, fase 2)

Fecha: 2026-10-28. **Esta propuesta no contiene requisitos de ANAC ni de ningún organismo sanitario y no establece equivalencias legales.** Lo que no puede determinarse legítimamente queda como decisión pendiente y la evaluación permanece en estado **no elegible**.

## 1. Cómo decide el sistema hoy (hechos verificados en el código)

Una persona es elegible para una función en un vuelo sólo si se cumplen **todas** estas condiciones (`CrewManagementService.evaluateOn`):

1. Cuenta activa (`CUENTA_INACTIVA`).
2. **Clasificación administrativa vigente** para la función (`CLASIFICACION_INCOMPATIBLE`) — la otorga un administrador.
3. Sólo comandante: rol de acceso `COMANDANTE` y licencia registrada en su perfil (`PERFIL_COMANDANTE_INCOMPLETO`) y sin informes finales vencidos (`INFORME_FINAL_VENCIDO`).
4. **Habilitación verificada, vigente y suficiente** para la función (`ProfessionalCredentialService.assess` + `CredentialSufficiency.evaluate`).
5. Disponibilidad (sin otro vuelo superpuesto).

El punto 4 es el único que depende de la política configurable (`politicas_habilitacion`). Reglas del motor (`CredentialSufficiency`, una sola implementación para listar, asignar, replanificar, aceptar e iniciar):

- Cada fila de política es una **alternativa** (una persona basta con que *alguna* habilitación vigente satisfaga *alguna* fila aplicable).
- Una fila define: función, tipo de operación (`tipos_vuelo`; vacío = cualquiera), categoría de aeronave (vacío = cualquiera), **tipo de habilitación aceptado** (texto), si exige jurisdicción registrada y si exige una consulta externa manual con resultado `COINCIDE`.
- **Sin ninguna fila activa para la función → `POLITICA_HABILITACION_NO_CONFIGURADA`**: nadie es elegible. Con filas pero ninguna aplicable al tipo de vuelo/categoría → el mismo código. Con una fila por categoría y un vuelo sin aeronave asignada → `CONTEXTO_OPERATIVO_INCOMPLETO` (no se infiere).
- La categoría de aeronave de la política se compara (sin tildes ni mayúsculas) con el campo **libre** «tipo» de la aeronave y, si la fila la indica, también con la categoría declarada en la habilitación.
- No existe ninguna equivalencia entre tipos de habilitación: cada tipo aceptado se lista explícitamente.
- La verificación es una **revisión interna manual** de otro administrador; la «consulta externa» es la constancia de lo que un administrador declara haber visto en ANAC o REFEPS/SISA. Nada se consulta automáticamente.

## 2. Matriz de decisión

Leyenda: **M** = sustentado por el modelo existente (no requiere decisión); **C** = configuración administrativa (se carga en el sistema, el contenido lo define la organización); **D** = decisión de negocio; **N** = revisión normativa (requiere conocer el requisito real antes de cargarlo).

| # | Requisito | Función(es) | M | C | D | N | Estado propuesto |
|---|---|---|:-:|:-:|:-:|:-:|---|
| 1 | Las cuatro funciones profesionales a bordo | todas | ✔ | | | | Catálogo cerrado `roles_tripulacion` (COMANDANTE, COPILOTO, MEDICO, ENFERMERO). |
| 2 | Clasificación administrativa por función | todas | ✔ | ✔ | | | Funciona. Cada administrador clasifica a cada persona. |
| 3 | Cuenta activa, perfil de comandante con licencia registrada, rol de acceso, sin informe final vencido | COMANDANTE | ✔ | | | | Funciona. **Registrar un número de licencia no es validarlo.** |
| 4 | Habilitación verificada por revisión interna, con documentación limpia, vigencia y restricciones aceptadas | todas | ✔ | | | | Funciona. |
| 5 | **Qué tipo(s) de habilitación acredita cada función** | todas | | ✔ | ✔ | ✔ | **PENDIENTE.** No se carga ningún tipo. |
| 6 | Si el requisito difiere entre vuelo sanitario y vuelos no sanitarios (TRASLADO_OPERATIVO, REPOSICIONAMIENTO, REGRESO_BASE, ENTRENAMIENTO, OTRO) | todas | ✔ | ✔ | ✔ | | **PENDIENTE.** El modelo lo soporta con una fila por tipo de vuelo; una función con política sólo para SANITARIO no es elegible en vuelos no sanitarios. |
| 7 | Categoría de aeronave a la que aplica la habilitación | COMANDANTE, COPILOTO | ✔ | ✔ | ✔ | ✔ | **PENDIENTE.** Antes hay que **normalizar** el campo libre «tipo» de las aeronaves (hoy en el E2E: PRUEBA, CAT-A, Turbohélice, T, AVION…). |
| 8 | Jurisdicción de la matrícula (provincial/nacional) | MEDICO, ENFERMERO | ✔ | ✔ | ✔ | ✔ | **PENDIENTE.** El modelo puede exigir una jurisdicción registrada; no establece equivalencias entre jurisdicciones. |
| 9 | Exigir una consulta externa manual coincidente (ANAC / REFEPS-SISA) | todas | ✔ | ✔ | ✔ | | **PENDIENTE.** Es una declaración del administrador, no una validación del organismo; las fuentes no ofrecen API acreditada (dependencia externa). |
| 10 | Aptitudes adicionales (aptitud psicofísica, capacitación aeromédica, otras) | todas | ✔ | ✔ | ✔ | ✔ | **PENDIENTE.** Se modelarían como otro tipo de habilitación con su propia política; no existe un modelo de «aptitud» separado. |
| 11 | Plazos de vencimiento y avisos (60/30/7/0 días) | todas | ✔ | ✔ | ✔ | | Configurable; **60/30/7/0 es una propuesta sin aprobar** (`APP_CREDENTIAL_EXPIRY_APPROVED=false`). |
| 12 | Tripulación mínima por tipo de operación (¿copiloto obligatorio?) | COPILOTO | | | ✔ | ✔ | **No modelado.** El sistema no impone composición mínima; sólo capacidad de la aeronave. Fuera de este incremento. |
| 13 | Equivalencias entre habilitaciones | todas | | | ✔ | ✔ | **Deliberadamente no modeladas:** cada tipo aceptado se lista explícitamente. |

## 3. Propuesta inicial de configuración

Archivo: `config/politicas-habilitacion/propuesta-inicial-I57-PENDIENTE.json`.

- **Cuatro funciones en alcance, cero políticas, ocho decisiones pendientes** (las del cuadro anterior, con su pregunta).
- Efecto de activarla: ninguna función queda con política → **nadie es elegible** (`POLITICA_HABILITACION_NO_CONFIGURADA`). Esto es lo correcto mientras las decisiones sigan abiertas y es la situación en la que la base habitual quedará tras migrar, por diseño (V59/V60 no siembran nada).
- No es un defecto técnico ni un bloqueo imprevisto: es el estado «cerrado por omisión». La lista de preparación (`GET /api/admin/readiness`) marca **obligatorio y pendiente** el elemento `POLITICA_<función>` para cada una hasta que exista una política activa.
- Cuando el negocio decida el contenido (puntos 5–10), se completa **ese mismo archivo** con las filas, se simula y se activa por el procedimiento de la sección 5. Estructuras posibles, con su consecuencia:

| Opción | Cuándo conviene | Consecuencia |
|---|---|---|
| A. Una fila por función y tipo de habilitación, sin tipo de vuelo ni categoría | El requisito es igual en todas las operaciones | Simple; **no** distingue sanitario de operativos ni categorías de aeronave (esa información de la habilitación no se exige). |
| B. Filas por función **y tipo de vuelo** | Sanitario exige más que los vuelos operativos | Un médico/enfermero con política sólo para `SANITARIO` no es elegible en vuelos operativos. |
| C. Filas por función, tipo de vuelo **y categoría de aeronave** | La habilitación depende de la aeronave | Exige normalizar «tipo» de aeronave; un valor mal escrito deja la operación sin política aplicable (queda no elegible: falla cerrado). |

## 4. Correcciones técnicas de esta fase

| Problema | Corrección |
|---|---|
| La única forma de cargar o cambiar políticas era alta/baja individual, inmediata y sin simulación: entre la baja y el alta de una modificación la función quedaba sin política (bloqueo transitorio) y no había forma de saber el impacto antes de activar. | **Simulación y activación por lote** (`CredentialPolicyActivationService`): un cambio es atómico por función; las políticas idénticas se conservan, las ausentes se dan de baja con motivo y las nuevas se crean con la referencia de aprobación. |
| Nadie podía comprobar qué personas y vuelos quedarían afectados. | La simulación evalúa con **la misma regla** (`CredentialSufficiency`) a todas las personas clasificadas y a cada integrante de los vuelos abiertos, antes y después, y lista quiénes pasan a no elegibles, quiénes a elegibles y con qué causa. |
| Se podía activar algo distinto de lo aprobado. | Huella SHA-256 canónica de la propuesta; la activación exige la huella del informe y la referencia de la aprobación. Cambiar una coma cambia la huella (`HUELLA_NO_COINCIDE`). |
| Un error de tipeo en un campo opcional (`requiresExternalChek`) se ignoraba en silencio y **eliminaba una exigencia**. | `@StrictJson`: los campos desconocidos se rechazan (400). |
| Incoherencias detectables sólo al operar. | La simulación informa: filas duplicadas, tipo de vuelo inexistente/inactivo, función fuera de alcance, fuente oficial sin citar, políticas redundantes (una más amplia ya comprende a otra), combinaciones función×tipo de vuelo×categoría de aeronave **sin cobertura**, habilitaciones verificadas cuyo tipo ninguna política reconoce y categorías de aeronave en uso. |
| Dos administradores podían modificar la política de la misma función a la vez. | Bloqueo pesimista por función (`CrewRoleRepository.lockByCodes`) compartido por alta, baja y lote. |
| La integridad de la política dependía sólo del código. | V60: trigger que impide borrar políticas, cambiar su definición o reactivarlas. |
| Una activación de política sobre cientos de vuelos abiertos tardaba minutos (costo cuadrático por volcados automáticos de Hibernate en una transacción de escritura). | El análisis corre con volcado diferido y la tripulación de los vuelos se lee en bloque. |
| El historial de bajas (cientos de filas en el E2E) tapaba las políticas activas en pantalla. | Las bajas pasan a un desplegable de historial. |

## 5. Procedimiento de activación inicial

Precondición: decisiones de negocio cerradas y propuesta completa en un archivo JSON bajo control de versiones (`config/politicas-habilitacion/`). Todo en la copia aislada primero; en producción, sólo con la aprobación documentada.

1. **Cargar**: completar el archivo (`policies`) y vaciar `pendingDecisions` sólo cuando cada decisión esté resuelta (una decisión pendiente sigue apareciendo como advertencia en la simulación).
2. **Validar** (local, sin servidor): `node scripts/politicas-habilitacion.cjs validate <archivo>` — JSON bien formado, sin campos desconocidos.
3. **Simular** (no modifica nada): `node scripts/politicas-habilitacion.cjs simulate <archivo> --out informe.json` con `POLICY_ADMIN_TOKEN` (o usuario/contraseña de un administrador). Revisar: errores (bloquean), advertencias, cobertura, personas que pasan a no elegibles y vuelos abiertos afectados. Anotar la **huella**.
4. **Aprobación**: la persona responsable aprueba *ese* informe y esa huella; se registra la referencia (acta, expediente o nombre).
5. **Activar**: `node scripts/politicas-habilitacion.cjs activate <archivo> --fingerprint <huella> --approval "<referencia>" [--acknowledge]`. Fuera del E2E aislado exige además `POLICY_ACTIVATION_TARGET_CONFIRMED=<URL exacta>`. `--acknowledge` es obligatorio si la simulación informa integrantes de vuelos abiertos que dejarían de ser elegibles (se alerta a Operaciones).
6. **Comprobar**: lista de preparación (`/api/admin/readiness`) sin `POLITICA_*` pendiente; cada política activa muestra lote, referencia de aprobación y quién la creó; la auditoría (`CREDENTIAL_POLICY_BATCH`) conserva huella, función, cantidades y referencia.
7. **Reversión**: no se «deshace»: se activa la propuesta anterior (el sistema conserva las bajas con motivo y lote). Siempre existe el estado seguro de partida: vaciar la función deja a todos no elegibles.

La misma operación está en la interfaz (Administración → Política de suficiencia → *Carga, simulación y activación*): pegar o cargar el JSON, «Validar y simular», referencia de aprobación, reconocimiento si corresponde y «Activar política aprobada» (inhabilitado si el texto cambió después de simular, si hay errores o falta la referencia).

## 6. Validaciones y resultados

Los resultados con cifras (simulaciones sobre datos representativos y sobre la copia migrada del ensayo) están en el informe final `INFORME_PREPARACION_DEFINITIVA_I57_2026-10-28.md`, sección B.

Pruebas del mecanismo: `PolicyActivationAndLegacyIntegrationTest` (H2) y `e2e-politicas-documentos-v60` (SQL Server y ClamAV reales): simulación sin escritura y determinista, huella independiente de mayúsculas y orden, propuestas inválidas rechazadas, huella distinta rechazada, sin aprobación rechazada, sin permiso rechazada, campos desconocidos rechazados, lote atómico con referencia de aprobación y baja con motivo, auditoría del lote, cambio real de la elegibilidad de una persona antes/después, idempotencia, función sin política = `POLITICA_HABILITACION_NO_CONFIGURADA`, restauración, y el procedimiento por línea de comandos (valida, simula la plantilla pendiente sin modificar nada y se niega a activar sin huella ni confirmación de destino).
