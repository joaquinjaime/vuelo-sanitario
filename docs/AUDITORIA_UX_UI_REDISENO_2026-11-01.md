# Auditoría UX/UI — rediseño integral

Fecha: 1 de noviembre de 2026. Alcance auditado: frontend React/Vite, rutas por `hash`, componentes de los cuatro espacios de trabajo y contratos de API ya existentes. Las prioridades de uso que siguen son inferencias hechas a partir de los estados y flujos de negocio implementados; no se encontraron métricas de uso reales.

## Inventario de pantallas y flujos

| Área | Pantallas y capacidades actuales | Prioridad operativa inferida |
| --- | --- | --- |
| Administrador | Inicio, usuarios activos/desactivados, aeronaves, geografía, pacientes, auditoría, habilitaciones y cuenta | Alta para altas/consulta de usuarios y aeronaves; media para catálogos y habilitaciones; baja para bajas y auditoría histórica |
| Centro de Operaciones | Bandeja de vuelos, evaluación DTS, contraofertas, asignación, ruta, aeronaves, tripulación, clima, coordinación, documentos, bitácora e informes | Alta para solicitudes y rutas pendientes, asignaciones y decisiones; media para seguimientos; baja para historial |
| DTS | Nueva solicitud, paciente/contactos, respuesta a contrapropuestas, documentos, historial y cancelación | Alta para crear solicitud y responder propuestas; media para seguimiento; baja para historial |
| Comandante | Asignaciones, aceptación/rechazo, planificación/ruta, clima, hangar, documentos, bitácora e informe final | Alta para asignaciones, ruta e informe pendiente; media para preparación; baja para historial |

## Hallazgos

1. La pantalla operativa concentraba formulario, bandeja, tablas y notificaciones en una única vista sin una jerarquía de trabajo. El encabezado y las tres métricas eran iguales para todos los roles, incluso cuando sus tareas son distintas. **Gravedad: alta; efecto: demora para reconocer el próximo paso.**
2. El menú mostraba «Vuelos» y «Notificaciones» sin navegación asociada. En móvil, el menú lateral desaparecía por completo. **Gravedad: alta; efecto: navegación poco descubrible e inaccesible en pantallas pequeñas.**
3. La tabla de vuelos no comunicaba claramente si el registro necesita una acción del rol actual; acciones de gestión quedaban dentro de selectores extensos. **Gravedad: alta; efecto: mayor carga cognitiva en la operación.**
4. El dashboard administrativo daba protagonismo a usuarios desactivados mediante una métrica. Es una consulta histórica/ocasional, no una acción principal. **Gravedad: media; efecto: distrae de altas, cuentas pendientes y aeronaves.**
5. El sistema visual usaba colores y reglas CSS dispersas, grandes bloques con gradientes y sombras variables. Tablas no tenían un contenedor específico para reflujo y los controles de navegación no expresaban semántica de enlace/botón de forma consistente. **Gravedad: media; efecto: baja consistencia y riesgo responsive.**
6. Las pantallas de dominio sí tienen una cobertura funcional amplia. Por ello, una reescritura completa supondría riesgo de regresión desproporcionado. **Decisión: refactorización progresiva de carcasa, dashboards y primitivas visuales, preservando los componentes y contratos existentes.**

## Arquitectura visual propuesta

- Carcasa estable con barra lateral por rol, encabezado de contexto y menú móvil accesible.
- Inicio por rol con una acción primaria, una bandeja de atención derivada de los estados reales, resumen operativo mínimo y accesos a las áreas ya existentes.
- Páginas/secciones separadas para Inicio, Gestión de vuelos, Notificaciones y Cuenta; no se elimina ninguna capacidad del detalle de vuelo.
- Administración orientada a espacio de trabajo: altas, cuentas pendientes, usuarios activos y aeronaves; bajas permanecen en **Usuarios → Desactivados**.
- Tokens semánticos para superficies, texto, bordes, foco y estados; tarjetas y tablas compactas, sin métricas ficticias.

## Componentes renovados

- Navegación global, encabezado, menú móvil y avisos de estado.
- Paneles de resumen, bandeja de atención, accesos rápidos y lista de vuelos.
- Tarjetas, botones, formularios, tablas, etiquetas de estado, estados vacíos y contenedores responsive.
- Dashboard administrativo y sus prioridades visuales.

## Riesgos de regresión y mitigación

| Riesgo | Mitigación |
| --- | --- |
| Pérdida de permisos por cambio de navegación | La selección de área y los componentes existentes siguen usando los roles y las APIs actuales. |
| Cambio accidental de estados de negocio | La bandeja sólo lee `estado` y no altera payloads, endpoints ni reglas. |
| Flujos de alta/OTP afectados | Se preservan formularios, validaciones y modales existentes; se ejecutan pruebas de frontend. |
| Reflujo de tablas | Se introduce un contenedor de desbordamiento horizontal y reglas responsive. |

## Plan ejecutado

1. Consolidar tokens y carcasa responsive accesible.
2. Implementar navegación y dashboards diferenciados por rol.
3. Reorganizar el dashboard administrativo y retirar las bajas del resumen principal.
4. Aplicar patrones de tablas, estados y formularios sin cambiar contratos.
5. Ejecutar pruebas unitarias, build y revisión manual disponible; documentar límites de validación.
