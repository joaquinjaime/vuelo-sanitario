# Evidencias y limitaciones

## Estado relevado

| Dato | Resultado | Evidencia |
|---|---|---|
| Rama | `feature/completitud-funcional-post-v55` | `git branch --show-current` |
| Commit actual | `7a767071cff5728e2202b74223dfaa7728de90d6` | `git rev-parse HEAD` |
| Remoto | `origin` GitHub | `git remote -v` |
| Última migración en código | V60 | `db/migration/V60__endurecimiento_politicas_y_documentos_heredados.sql` |
| Instancia habitual activa | Flyway V47; 42 físicas (40 negocio + Flyway + sysdiagrams) | `docs/evidencia-i57/inventario-tablas-habitual-v47-solo-lectura.json` |
| E2E aislada histórica | Flyway V60; 46 físicas (45 negocio + Flyway) | `docs/evidencia-i57/inventario-tablas-e2e-v60.json` |
| Backend/frontend actual | contenedores healthy al relevamiento | `docker ps` |

## Discrepancias

1. **DISCREPANCIA DETECTADA:** código termina en V60 pero la base habitual sigue en V47.
2. **NO VERIFICADO:** la consigna PDF `Trabajo Integrador Final Taller III - Evaluación.pdf` no estaba disponible; se usó el texto de requerimientos adjunto.
3. **NO VERIFICADO:** no se inspeccionó una base V60 viva durante esta documentación; se utilizó evidencia versionada de E2E.
4. **NO IMPLEMENTADO:** integración automática con registros externos; la consulta es manual.
5. **PENDIENTE:** políticas profesionales reales, SMTP productivo, ClamAV completo y retención aprobada.

## Pruebas

Evidencia histórica I58: Maven 588, Vitest 255 y E2E 54/54. Estas cifras no se reejecutaron ahora. Archivos: `docs/INFORME_CERTIFICACION_FINAL_I58_2026-10-28.md` y `docs/evidencia-i58/suite-e2e-20261029T073329-resumen.json`.

## Conservación

No se ejecutaron migraciones, DDL/DML, borrados, cambios de permisos ni cambios funcionales. Las únicas escrituras de esta tarea son los archivos de documentación bajo `docs/taller-iii-entrega/`.
