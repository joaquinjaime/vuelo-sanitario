# Guía de demostración y defensa

## Guion seguro

1. Mostrar `/actuator/health` y la versión Flyway con consulta de solo lectura.
2. Ingresar como DTS: buscar/registrar un paciente ficticio y una solicitud ficticia en entorno aislado.
3. Ingresar como Operaciones: mostrar disponibilidad/asignación y la diferencia de permisos.
4. Ingresar como Comandante: crear y presentar una ruta.
5. Volver a Operaciones: aprobar o devolver esa versión y mostrar el historial.
6. Mostrar informe final/documentos, auditoría y las filas relacionadas mediante consultas de sólo lectura.
7. Ingresar como Administrador: catálogo, auditoría y habilitaciones (sin afirmar aprobación normativa).

**Datos necesarios:** cuatro cuentas de ensayo (DTS, Operaciones, Comandante, Administrador), un paciente/anónimo, dos aeropuertos, aeronave activa y un vuelo de ensayo. No usar datos clínicos reales ni la base habitual.

**Recuperación:** detener la demo ante error; no ejecutar migraciones. Restablecer el entorno E2E conocido, comprobar health, y volver a cargar datos de ensayo.

## Preguntas y respuestas

### Básica - ¿Qué diferencia hay entre persona y usuario?

**Respuesta:** Persona conserva identidad civil; usuario representa la cuenta autenticable. La separación evita exigir credenciales a todo paciente.

### Básica - ¿Qué es una PK?

**Respuesta:** Identifica de forma única una fila; las FKs referencian esa identidad.

### Básica - ¿Qué protege una FK?

**Respuesta:** Evita referencias a filas inexistentes, salvo las reglas explícitas de nulabilidad y borrado.

### Básica - ¿Cómo se autentica?

**Respuesta:** Login emite JWT; `JwtAuthenticationFilter` lo valida y carga roles en Spring Security.

### Básica - ¿Qué base usa?

**Respuesta:** Microsoft SQL Server; Flyway versiona el DDL y JPA valida el mapeo.

### Intermedia - ¿Por qué vuelos sanitarios está separado?

**Respuesta:** Sólo el traslado sanitario necesita paciente, solicitud e información médica; separarlo evita nulos y mezcla semántica.

### Intermedia - ¿Quién aprueba una ruta?

**Respuesta:** Operaciones/Centro de Operaciones; el comandante crea/presenta y no puede autorrevisarse.

### Intermedia - ¿Qué invalida una ruta?

**Respuesta:** Cambios materiales de aeropuertos, horarios, aeronave o comandante; `reassess` conserva evidencia e indica nueva revisión.

### Intermedia - ¿Cómo se evita una doble asignación?

**Respuesta:** Servicios/repositorios bloquean datos críticos y validan disponibilidad dentro de transacciones; consultar pruebas de concurrencia.

### Intermedia - ¿Qué ocurre al cerrar?

**Respuesta:** El flujo controla obligaciones/informe, estado y autorización; persiste informe/adjuntos y auditoría.

### Intermedia - ¿Qué es baja lógica?

**Respuesta:** Conservar la fila y marcarla inactiva/retirada, útil para no romper trazabilidad.

### Intermedia - ¿Qué se prueba en frontend?

**Respuesta:** Vitest y Testing Library; evidencia histórica I58 informa 255 pruebas aprobadas.

### Intermedia - ¿Qué se prueba E2E?

**Respuesta:** Flujos API/UI contra SQL Server aislado, incluyendo seguridad, migración y concurrencia.

### Avanzada - ¿Qué asegura SQL y qué asegura Java?

**Respuesta:** SQL asegura estructura e integridad declarable; Java asegura transiciones, autorización contextual y políticas complejas.

### Avanzada - ¿Cómo modificar un estado nuevo?

**Respuesta:** Evaluar catálogo, constantes/transiciones de servicio, CHECK/seed/migración, DTO/UI, pruebas y compatibilidad histórica.

### Avanzada - ¿Qué ocurre si falla una transacción?

**Respuesta:** Spring revierte cambios participantes; no se debe afirmar compensación externa sin revisar el servicio concreto.

### Avanzada - ¿Las consultas externas validan automáticamente organismos?

**Respuesta:** No. Son constancias manuales, explícitamente no una integración oficial.

### Avanzada - ¿Por qué hay dos cuentas SQL?

**Respuesta:** Mínimo privilegio: aplicación con datos y migrador con DDL; reduce la capacidad de alterar esquema accidentalmente.

### Avanzada - ¿Qué versión se defiende?

**Respuesta:** Código V60 y evidencia E2E V60; la base habitual relevada estaba en V47. No deben confundirse.

### Avanzada - ¿Cuál es el riesgo de escala?

**Respuesta:** Listados sin paginación y disponibilidad de comandantes evidenciaron tiempos altos con bases E2E acumuladas.

### Básica - ¿Qué hace Flyway?

**Respuesta:** Ordena y registra migraciones; `flyway_schema_history` permite conocer el corte aplicado.

### Básica - ¿Qué rol tiene Nginx?

**Respuesta:** Sirve el frontend y forma parte del despliegue contenedorizado.

### Básica - ¿Qué es un DTO?

**Respuesta:** Contrato de entrada/salida de API, separado de la entidad persistente.

### Básica - ¿Qué contiene una tabla intermedia?

**Respuesta:** Las dos FKs y, si hace falta, atributos propios; ejemplo `usuarios_roles`.

### Básica - ¿Por qué hay auditoría?

**Respuesta:** Permite saber quién realizó cambios y reconstruir eventos.

### Básica - ¿Qué es `ddl-auto: validate`?

**Respuesta:** Hibernate verifica mapeos pero no genera ni altera tablas.

### Intermedia - ¿Cómo se protege un PDF?

**Respuesta:** Se restringe tipo/tamaño, se versiona, usa lock y los documentos profesionales incorporan análisis antimalware.

### Intermedia - ¿Qué son las notificaciones?

**Respuesta:** Mensajes persistentes por usuario para cambios operativos relevantes.

### Intermedia - ¿Qué diferencia hay entre rol de acceso y de tripulación?

**Respuesta:** `roles` autoriza API; `roles_tripulacion` describe función operativa.

### Intermedia - ¿Qué controla una UNIQUE?

**Respuesta:** Evita duplicados en la combinación/columna protegida; los índices filtrados aplican sólo en condiciones específicas.

### Intermedia - ¿Qué muestra la bitácora?

**Respuesta:** Asientos operativos del vuelo, distinta de la auditoría técnica general.

### Intermedia - ¿Qué ocurre con correo no verificado?

**Respuesta:** El modelo conserva verificación y vencimientos; entrega real requiere SMTP configurado.

### Intermedia - ¿Para qué sirve la versión de ruta?

**Respuesta:** Evita aprobar contenido distinto del revisado y conserva historial.

### Intermedia - ¿Cuándo un documento no se elimina?

**Respuesta:** El diseño prefiere baja lógica/historial; verificar la política concreta de cada módulo.

### Avanzada - ¿Cómo se agregaría una funcionalidad?

**Respuesta:** Definir dominio, migración Flyway, entidad/repositorio, servicio transaccional, API, UI y pruebas.

### Avanzada - ¿Qué protege un trigger inmutable?

**Respuesta:** Rechaza UPDATE/DELETE incluso si otro cliente elude el servicio Java.

### Avanzada - ¿Por qué los snapshots no violan necesariamente 3FN?

**Respuesta:** Son evidencia histórica deliberada, no atributos maestros actualizables.

### Avanzada - ¿Cuál es el estado de ClamAV?

**Respuesta:** Integración disponible y probada mínimamente; análisis completo productivo pendiente de recursos.

### Avanzada - ¿Qué hacer si falla la demo?

**Respuesta:** No tocar la base habitual: reiniciar con datos aislados conocidos, verificar health y ejecutar sólo consultas de lectura.

### Avanzada - ¿Qué no se debe afirmar?

**Respuesta:** Que la instancia habitual está en V60, que hay validación oficial externa, o que producción está autorizada.
