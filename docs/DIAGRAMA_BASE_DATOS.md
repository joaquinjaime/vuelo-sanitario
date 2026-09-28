# DER de la base de datos

Generado a partir del catálogo de `vuelos_sanitarios` en SQL Server luego de Flyway V10 (V8 aplicada correctamente). No incluye los objetos técnicos `flyway_schema_history` y `sysdiagrams`.

```mermaid
erDiagram
  personas ||--o| usuarios : identifica
  personas ||--o| perfiles_comandante : perfil_profesional
  personas ||--o| pacientes : identifica
  usuarios ||--o{ usuarios_roles : tiene
  roles ||--o{ usuarios_roles : asigna
  pacientes ||--o{ vuelos : requiere
  estados_vuelo ||--o{ vuelos : estado
  prioridades_vuelo ||--o{ vuelos : prioridad
  aeronaves ||--o{ vuelos : opera
  aeropuertos ||--o{ vuelos : origen_destino
  vuelos ||--o{ vuelos_tripulantes : incorpora
  usuarios ||--o{ vuelos_tripulantes : integra
  roles_tripulacion ||--o{ vuelos_tripulantes : rol
  vuelos ||--o| informacion_medica_vuelo : posee
  vuelos ||--o{ documentos_vuelo : adjunta
  tipos_documento ||--o{ documentos_vuelo : clasifica
  documentos_vuelo ||--o{ versiones_documento_vuelo : versiona
  vuelos ||--o{ rutas_vuelo : versiona
  vuelos ||--o{ informacion_hangar : versiona
  vuelos ||--o{ coordinaciones_aa2000 : versiona
  vuelos ||--o{ informes_finales_vuelo : versiona
  vuelos ||--o| obligaciones_informe_final : exige
  informes_finales_vuelo ||--o{ obligaciones_informe_final : presenta
  vuelos ||--o{ instantaneas_clima : registra
  vuelos ||--o{ notificaciones : genera
  usuarios ||--o{ notificaciones : recibe
  vuelos ||--o{ eventos_auditoria : audita
  vuelos ||--o{ bitacora_vuelos : historiza
```

La relación N:M de tripulación está materializada por `vuelos_tripulantes`; la relación N:M de roles de usuarios, por `usuarios_roles`.
# V11 — cuentas y contactos

```text
personas 1 ── N correos_electronicos
personas 1 ── N telefonos
personas 1 ── 1 usuarios 1 ── N activaciones_cuenta
usuarios N ── N roles
```

