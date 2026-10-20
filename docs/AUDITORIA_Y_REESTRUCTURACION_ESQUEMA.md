# Auditoria y reestructuracion del esquema

> **Documento histórico.** Registra el diagnóstico y las decisiones hasta V22. La nomenclatura `UUID` y las referencias al modelo anterior no describen el esquema vigente tras V24, V27 y V28. Para las convenciones definitivas, V1--V31, leases documentales y operación actual, consulte [ESTADO_FUNCIONAL.md](ESTADO_FUNCIONAL.md) e [INVENTARIO_ESQUEMA_POST_V29.md](INVENTARIO_ESQUEMA_POST_V29.md).

## Diagnostico inicial

El modelo ya habia corregido dos problemas importantes: `personas` separaba
identidad de cuentas/pacientes y `informacion_medica_vuelo` evitaba que un
nuevo traslado sobrescribiera la informacion clinica historica. Tambien se
habian introducido versiones para documentos e informes. Sin embargo, el
modelo fisico conservaba nombres ingleses mezclados con espanol, constraints
autogeneradas e indices con nomenclatura inconsistente.

## Decisiones de modelo

`usuarios`, `pacientes` y `personas` representan especializaciones 1:1 con
restricciones unicas sobre `persona_id`: identidad, autenticacion y condicion
de paciente quedan separadas sin duplicar datos personales. `usuarios_roles`
mantiene la relacion N:M y su PK compuesta evita asignaciones repetidas.

`vuelos_tripulantes` es una entidad asociativa: una persona puede participar
en muchos vuelos y la participacion tiene rol y actor de asignacion. Los datos
clinicos son 1:1 por traslado en `informacion_medica_vuelo`. Un documento
logico (`documentos_vuelo`) tiene varias `versiones_documento_vuelo`; una
restriccion filtrada mantiene una sola version vigente.

La solicitud y el vuelo permanecen en una entidad porque el flujo actual es
un unico caso operativo que evoluciona de solicitado a completado. La prioridad
operativa es un catalogo y la extrema urgencia conserva reglas y fecha limite
propias, por lo que no se solapan.

## Migracion V8

`V8__traducir_esquema_fisico_espanol.sql` renombra las tablas y columnas de
negocio a `snake_case` en espanol sin tocar nombres de clases Java. Conserva
tipos, claves, relaciones e informacion de una base ya migrada. Por eso es
preferible a recrear las tablas: las instalaciones existentes pueden avanzar
sin un paso manual de exportacion.

Los eventos relevantes usan `datetime2` y las obligaciones de informe usan
`datetimeoffset`, que conserva el instante absoluto. La zona civil de negocio
continua siendo `America/Argentina/Tucuman` y esta declarada en configuracion.

## Integridad y escalabilidad

En la versión descrita por este diagnóstico el esquema usaba UUID para entidades operativas y `BIGINT IDENTITY` para la
auditoria. Esa decisión fue reemplazada por V24: el esquema vigente usa `BIGINT IDENTITY` para las identidades de aplicación. Las relaciones, checks de fechas,
versiones y carga documental se hacen cumplir en SQL Server. Los indices ya
existentes cubren estado/fecha, agendas de aeronave y comandante, vencimientos
de informes, documentos por vuelo, auditoria y notificaciones no leidas.

Los binarios siguen fuera de las tablas operativas mediante una clave de
almacenamiento; el contrato permite moverlos a object storage sin modificar el
modelo relacional. Las consultas de colecciones grandes se exponen mediante
`Pageable` en los repositorios/controladores correspondientes.

## Actualización V22: documentos exclusivamente PDF

`V22__refactorizar_documentos_de_vuelo_solo_pdf.sql` deja a
`documentos_vuelo` como la identidad lógica, con `nombre_documento`, y a
`versiones_documento_vuelo` como cada PDF físico. Renombra `version` a
`numero_version`, `nombre_archivo` a `nombre_archivo_original` y
`clave_almacenamiento` a `ubicacion_almacenamiento`.

Se retiran `modalidad`, `tipo_mime` y `contenido_texto`. Las versiones TEXT
preexistentes se copian antes a `documentos_vuelo_texto_legacy`, dado que no
hay una conversión automática y fiel de texto a PDF; luego no forman parte del
modelo operativo. Un índice único filtrado por `documento_vuelo_id` y
`es_version_actual = 1` conserva exactamente una versión vigente por cada
documento con versiones. La ubicación es una clave relativa generada dentro
del directorio configurado, no una URL firmada o temporal.

## Operacion de desarrollo

La base de desarrollo no contiene datos operativos. Antes de aplicar la V8,
hacer una copia si se quiere conservar datos de prueba y ejecutar Flyway con
las credenciales de SQL Server. Hibernate queda en `validate`: si un mapping o
el esquema no coincide, el backend no inicia.
