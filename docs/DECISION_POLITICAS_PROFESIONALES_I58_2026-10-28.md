# Decisión requerida: política de suficiencia profesional (I-5.8)

Fecha: 2026-10-28 · Para: persona responsable del sistema · Estado: **sin ninguna política real cargada (0 de 4 funciones)**.

**Lo que este documento no hace:** no contiene ni propone requisitos de ANAC, de ministerios de salud ni de colegios profesionales, y no establece equivalencias entre títulos, matrículas o licencias. Las «fuentes a revisar» indican *dónde* debe mirar quien aprueba; el contenido real lo define la organización con asesoramiento normativo. Nada de lo que está en el repositorio como prueba (`fixture-prueba-NO-USAR-EN-PRODUCCION.json`) es una política autorizada.

## 1. Qué se está decidiendo (una explicación corta)

El sistema ya impide asignar a una persona a una función si no cumple **todas** estas condiciones: cuenta activa, clasificación administrativa para la función, (comandante) perfil con licencia registrada y sin informes vencidos, **habilitación verificada por revisión interna y vigente**, y disponibilidad. Todo eso funciona y está probado.

La única pieza que falta es *qué habilitación alcanza para cada función*: la tabla `politicas_habilitacion`. **Mientras esté vacía, nadie es elegible** (`POLITICA_HABILITACION_NO_CONFIGURADA`). Es el estado seguro: el sistema nunca autoriza por defecto.

Cada fila de política es una alternativa suficiente. Cada fila fija: la **función**, el **tipo de vuelo** (vacío = cualquiera), la **categoría de aeronave** (vacía = cualquiera), el **tipo de habilitación aceptado** (texto exacto), si exige **jurisdicción** registrada y si exige una **consulta externa manual coincidente**. No hay equivalencias implícitas: cada tipo aceptado se lista explícitamente. Distinguir *matrícula, licencia, habilitación, clasificación y aptitud* es una decisión de la organización: el modelo sólo guarda el texto del tipo y compara.

**Qué ocurre hasta que se apruebe cada decisión:** la función afectada queda **no elegible** en el alcance indicado; la lista de preparación (`/api/admin/readiness`) muestra `POLITICA_<función>` como pendiente y obligatorio para operar; las asignaciones se rechazan con el código indicado. No hay datos que reparar ni migración que bloquear.

## 2. Las ocho decisiones

| # | Función | Regla a definir | Efecto en la elegibilidad | Datos que usa | Alternativas del modelo | Fuente a revisar | Debería aprobar |
|---|---|---|---|---|---|---|---|
| **D1** | COMANDANTE | Qué tipo(s) de habilitación aeronáutica acreditan al comandante y para qué aeronaves de la flota. | Sin ella ningún comandante es elegible. Con ella, sólo quien tenga una habilitación **verificada y vigente** de ese tipo (y, si se fija categoría, de esa categoría de aeronave). | `habilitaciones_profesionales.tipo_habilitacion`, vigencia, estado `VERIFICADA`, categoría declarada; `aeronaves.tipo` del vuelo. | Una fila por tipo aceptado. Con o sin categoría de aeronave. Sin equivalencias: cada tipo equivalente se lista como otra fila. | Normativa vigente de la autoridad aeronáutica sobre licencias y habilitaciones del personal aeronáutico (norma y versión exactas a identificar por quien aprueba). | Dirección de Operaciones / responsable de seguridad operacional, con asesoría legal. |
| **D2** | COMANDANTE | Si lo exigido es igual en vuelos sanitarios y no sanitarios (traslado operativo, reposicionamiento, regreso a base, entrenamiento, otro). | Con filas sólo para `SANITARIO`, el comandante **no es elegible** en vuelos operativos y viceversa. | `vuelos.id_tipos_vuelo` frente a `politicas_habilitacion.id_tipos_vuelo`. | A: igual para todos (sin tipo de vuelo). B: una fila por tipo de vuelo. | Criterio operativo del explotador; si hay norma específica por tipo de operación, la misma fuente que D1. | Dirección de Operaciones. |
| **D3** | COMANDANTE | Si se exige una **consulta externa manual** registrada (resultado `COINCIDE`) además de la revisión interna. | Si se exige, la habilitación no alcanza hasta que un administrador registre esa consulta. Es una **constancia manual de lo que el administrador vio**; no es una validación emitida por el organismo. | `consultas_externas_habilitacion` (organismo, fecha, responsable, datos contrastados, resultado). | Exigirla o no, por fila. No existe consulta automática: las fuentes oficiales no ofrecen una interfaz acreditada para este sistema. | Procedimiento interno de verificación de licencias; sitio/servicio oficial que el responsable decida usar. | Dirección de Operaciones + asesoría legal. |
| **D4** | COPILOTO | Tipo(s) de habilitación suficientes para copiloto y categoría de aeronave; además, si el copiloto es **obligatorio** en alguna operación. | Sin política ningún copiloto es elegible. La obligatoriedad **no está modelada**: hoy el copiloto se asigna de forma opcional y el sistema no impone tripulación mínima. | Igual que D1. | Igual que D1. La tripulación mínima exigiría desarrollo nuevo (no incluido). | Igual que D1, más la norma de tripulación mínima por tipo de aeronave/operación. | Dirección de Operaciones / seguridad operacional. |
| **D5** | MEDICO | Qué matrícula o habilitación profesional acredita al médico, si debe constar su **jurisdicción**, y si se exige consulta externa a registros de profesionales de salud. | Sin política ningún médico es elegible. Con jurisdicción exigida, una habilitación sin jurisdicción registrada no alcanza. No se asume equivalencia entre matrículas provinciales y nacionales. | Tipo de habilitación, jurisdicción, vigencia, estado de verificación, consulta externa opcional. | Una fila por matrícula aceptada y jurisdicción; con o sin exigencia de jurisdicción/consulta. | Registro federal de profesionales de salud y registros del ministerio de salud jurisdiccional y del colegio profesional (quien aprueba identifica cuál rige). | Dirección médica, con asesoría legal. |
| **D6** | MEDICO | Si existe una **acreditación adicional** (p. ej. capacitación en transporte aeromédico, aptitud psicofísica) y si un médico puede integrar vuelos **no sanitarios**. | Una acreditación adicional se modelaría como *otro tipo de habilitación* con su propia política; no existe un modelo separado de «aptitud». Sin fila para un tipo de vuelo, el médico no es elegible en ese tipo. | Igual que D5, más `tipos_vuelo`. | Sumar filas para los vuelos no sanitarios o dejarlas fuera (el médico queda restringido a sanitarios). | Normativa de transporte aeromédico y política institucional de capacitación. | Dirección médica + Dirección de Operaciones. |
| **D7** | ENFERMERO | Matrícula o título suficiente, jurisdicción, consulta externa, acreditación adicional y vuelos no sanitarios para el personal de enfermería. | Igual que D5/D6 para enfermería. | Igual que D5/D6. | Igual que D5/D6. | Igual que D5, con el registro que corresponda a enfermería. | Jefatura de enfermería / Dirección médica, con asesoría legal. |
| **D8** | (aeronaves) | **Normalizar la categoría** de las aeronaves antes de usarla en políticas. Hoy «tipo» es texto libre (en el entorno de pruebas: PRUEBA, CAT-A, Turbohélice, T, AVION…). | Una política por categoría sólo se aplica si coincide (sin tildes ni mayúsculas) con ese texto; un valor mal escrito deja la operación **sin política aplicable (no elegible)**: falla cerrado. Un vuelo sin aeronave asignada → `CONTEXTO_OPERATIVO_INCOMPLETO`. | `aeronaves.tipo`; categoría de la política y de la habilitación. | Si las políticas no distinguen categoría (opción A/B de D1/D2), D8 no bloquea nada. Si la distinguen, definir la lista de categorías con Operaciones. | Clasificación de la flota que use el explotador (certificado de la aeronave y manual de operaciones). | Dirección de Operaciones / administrador técnico de flota. |

## 3. Cómo responder (por decisión)

Marcar **Aprobar / Rechazar / Modificar** y, si aprueba, completar:

- **D1, D4:** lista exacta de *tipos de habilitación* aceptados (texto), con categoría de aeronave o «cualquiera».
- **D2, D6:** para cada función, los *tipos de vuelo* donde rige.
- **D3, D5:** si exige *consulta externa* y/o *jurisdicción* (sí/no por fila).
- **D5, D7:** lista exacta de *matrículas* aceptadas y jurisdicciones.
- **D8:** lista cerrada de *categorías de aeronave* (si alguna política las usa).
- Para cada fila: **origen** (`CONFIGURACION_INTERNA`, o `FUENTE_OFICIAL_CITADA` con la cita exacta de la norma) y la **referencia de aprobación** (acta, expediente o nombre de quien aprueba).

Con eso se completa `config/politicas-habilitacion/propuesta-inicial-I57-PENDIENTE.json` (las filas van en `policies`; las decisiones resueltas se quitan de `pendingDecisions`) y se sigue el procedimiento de la sección 4.

## 4. Procedimiento comprobado (no activa nada por sí solo)

1. `node scripts/politicas-habilitacion.cjs validate <archivo>`: valida formato; rechaza campos desconocidos y filas duplicadas.
2. `node scripts/politicas-habilitacion.cjs simulate <archivo> --out informe.json`: **no modifica nada**. Informa errores, advertencias, cobertura (combinaciones función × tipo de vuelo × categoría sin política), personas que dejan de ser elegibles, personas que pasan a serlo y vuelos abiertos afectados. Entrega la **huella SHA-256** del lote.
3. La persona responsable aprueba *ese informe y esa huella*.
4. `node scripts/politicas-habilitacion.cjs activate <archivo> --fingerprint <huella> --approval "<referencia>" [--acknowledge]` (en un entorno real exige además `POLICY_ACTIVATION_TARGET_CONFIRMED=<URL>`). Si el archivo cambió una sola coma después de aprobarse, la huella no coincide y se rechaza (`HUELLA_NO_COINCIDE`). Se activa por función de forma atómica; las políticas anteriores se dan de baja con motivo y lote, nunca se borran (un trigger de la base lo impide).
5. Comprobar en Administración → Política de suficiencia (activas con lote y referencia de aprobación, pendientes, historial) y en la lista de preparación.
6. Reversión: se activa el lote anterior; vaciar una función la vuelve no elegible (estado seguro).

## 5. Evidencia de que el procedimiento funciona

Probado contra SQL Server real, con **políticas sintéticas identificadas como datos de prueba** (ver el informe final I-5.8, sección C): simulación sin escritura y determinista; lote incompleto, inconsistente, con campo desconocido o sin referencia: rechazado; lote alterado después de aprobar: rechazado por huella; activación sin permiso: rechazada; una activación nunca crea autorizaciones para funciones no incluidas; efecto real sobre elegibilidad antes/después; pantallas administrativas distinguen políticas aprobadas (con lote y referencia) de pendientes y de personas afectadas. Scripts: `e2e-politicas-documentos-v60`, `e2e-politicas-documentos-ui`.
