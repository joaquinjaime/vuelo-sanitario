
# Decisiones de modelado

Cada decisión se clasifica como **[Doc]** documentada en una migración o comentario del repositorio, **[Ded]** deducida de la implementación o **[Rec]** recomendación propia. Ninguna «Ded» ni «Rec» debe leerse como intención original de los desarrolladores.

| # | Tema | Decisión observada | Tipo | Razón / ventaja | Limitación |
|---|---|---|---|---|---|
| 1 | Identidad compartida | `personas` separada de `usuarios`, `pacientes`, `perfiles_comandante` | [Doc] V4, V12, `PersonIdentityService` | Una sola identidad para quien es cuenta y paciente; DNI único; correcciones centralizadas | Un cambio de identidad afecta a todos los roles de esa persona (se mitiga con versión y auditoría) |
| 2 | Contactos en tablas propias | `correos_electronicos` y `telefonos` con principal, baja lógica y versión | [Doc] V11, V49 | Varios por persona; historial de bajas; verificación de correo | No hay unicidad global (varias personas pueden compartir un valor, por diseño) |
| 3 | Contactos del traslado aparte | `contactos_coordinacion_traslado` pertenece a la solicitud, no a una persona | [Doc] V51 | Un familiar o una clínica no son personas del sistema; no se contaminan los contactos personales | Duplica la lógica de teléfonos (normalización, principal) |
| 4 | Supertipo/subtipo de vuelo | `vuelos` + `vuelos_sanitarios` (1:0..1) | [Doc] V23 | Admite vuelos no sanitarios sin campos de paciente | Hay que consultar dos tablas; estados distintos en dos tablas (con triggers de coherencia) |
| 5 | Dato clínico por traslado | `informacion_medica_vuelo` y no en `pacientes` | [Doc] V4 | El estado clínico cambia entre traslados; limita el alcance del dato sensible | No hay histórico por paciente consultable directamente |
| 6 | Catálogos en lugar de texto | estados, prioridades, tipos, motivos, roles, tipos de documento | [Doc] V1, V21, V23 | Consistencia, ordenación, estadísticas, internacionalización | Los códigos están acoplados a triggers y servicios (agregar uno exige tocar código y migración) |
| 7 | Bajas lógicas | `fecha_baja`/`id_usuario_baja`/`motivo_baja` o `esta_activo` | [Doc] V19, V45, V47, V49, V52, V58, V59 | Conserva la trazabilidad (quién, cuándo, por qué); evita romper FK históricas | Las consultas deben filtrar vigentes; los índices únicos son filtrados |
| 8 | Versionado por fila | rutas, hangar, coordinaciones, informes, documentos | [Doc] V2, V4, V22, V41, V55 | Nada se sobrescribe; se puede reconstruir qué se presentó y decidió | Crece sin límite; el «estado» actual exige la versión vigente |
| 9 | Contexto en versiones | hangar, rutas y coordinaciones guardan aeronave/origen/destino/horarios con que se registraron | [Doc] V39, V41, V55 | Detecta que una aprobación perdió validez sin borrar historia | La comparación de contexto es en Java, no en la base |
| 10 | Historial inmutable | auditoría, bitácora operativa, decisiones y consultas externas con triggers | [Doc] V38, V46, V60 | La inmutabilidad no depende de que el código se porte bien | Las negociaciones de horario son «inmutables por convención» (sin trigger) |
| 11 | Estados con máquina de estados en SQL | triggers en `vuelos`, `vuelos_sanitarios`, `obligaciones_informe_final` | [Doc] V3, V4, V42–V44 | Imposibilita ciclos de vida inválidos aun con UPDATE directo | Reglas duplicadas con Java |
| 12 | Disponibilidad derivada | aeronave/tripulación libres se calculan por vuelos | [Doc] V18 | No hay un indicador que se desincronice | Cada consulta recorre vuelos; depende de índices (algunos ausentes: ver hallazgos) |
| 13 | Archivos fuera de la base | PDFs de documentos, informes y habilitaciones en disco con clave + huella | [Ded] | Evita inflar la base; la huella SHA-256 detecta alteraciones | Posibles archivos huérfanos o faltantes que el motor no controla |
| 14 | OTP hasheados | códigos de activación (BCrypt) y verificación (HMAC), nunca en claro | [Doc] V54, V61, V62 | Una filtración de la tabla no revela códigos | Dos mecanismos distintos para dos tablas |
| 15 | Política configurable de habilitaciones | `politicas_habilitacion` sin siembra, con lote aprobado | [Doc] V59, V60 | El contenido regulatorio es decisión de negocio, no de código | Sin políticas activas nadie es elegible |
| 16 | Fechas y estados explícitos | `fecha_*` y estados en columnas, no inferidos | [Ded] | Auditabilidad y consultas simples | Redundancia controlada con CHECK |
| 17 | Valores calculados | `numero_licencia_normalizada` persistida; disponibilidad y estado de hangar al consultar | [Doc] V12 / [Ded] | Lo canónico se compara en la base; lo volátil no se almacena | — |
| 18 | PK numérica uniforme | BIGINT IDENTITY en todas | [Doc] V24, V27 | Joins rápidos, ids no semánticos | El corte de V24 descartó datos de desarrollo (sólo en desarrollo) |
| 19 | CASCADE selectivo | CASCADE sólo en hijos «parte de» (vuelo→rutas, documento→versiones, usuario→roles/notificaciones) | [Ded] | Mantiene integridad al borrar un padre | Un DELETE accidental de un vuelo arrastra su historia (la app nunca lo hace) |
| 20 | Concurrencia | @Version, bloqueos pesimistas (`lockById`), SERIALIZABLE y bloqueos documentales | [Doc] V48, V49, `I-5.3` | Evita pérdidas silenciosas y dobles asignaciones | Más puntos de contención y posibles interbloqueos (mitigados con orden de bloqueo) |

**Recomendaciones propias** (no implementadas ni pedidas): consolidar los 63 grupos de índices duplicados; reponer los 7 índices que V24 perdió o documentar su baja; decidir si los campos heredados sin escritura se retiran; documentar una política de retención/purga de `notificaciones` y bloqueos vencidos; evaluar un CHECK que ate `esta_activo` y `estado_cuenta`; unificar la convención de tiempos (hora civil vs UTC).

[← Informe principal](../INFORME_COMPLETO_BASE_DATOS.md)
