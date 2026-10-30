# Rendimiento de la consulta global de auditoría (I-5.6)

## Incidencia informada
Consulta global de 100 resultados con ~10.358 eventos: 26.972 ms (objetivo: ≤ 5.000 ms).

## Reproducción segura
Entorno: stack aislado `vuelos-sanitarios-e2e` (SQL Server 2022 en Docker, base `vuelos_sanitarios_e2e`; la base habitual no se tocó). Herramienta: `scripts/medir-auditoria.cjs` (sólo lectura) con `APP_AUDIT_DIAGNOSTICS_ENABLED=true`.

Conjunto de datos: **53.239 eventos de auditoría** (5,1 veces el volumen de la incidencia; 6,9 MiB de valores anteriores/nuevos).

| Fase | Medición |
|---|---|
| SQL — conteo (`COUNT(*)`) | 11–13 ms (167 lecturas lógicas, 1 recorrido del índice más pequeño) |
| SQL — página de 100 con las mismas columnas y uniones (`ORDER BY fecha DESC, id DESC`) | **5 ms** (`eventos_auditoria`: 317 lecturas lógicas; usa `idx_eventos_auditoria_fecha`) |
| Backend — autorización y filtros | 3,6–4,9 ms |
| Backend — repositorio: conteo | 5,4–11 ms (63 ms en un pico aislado) |
| Backend — repositorio: página | 14,5–21,5 ms (44 ms en un pico) |
| Backend — transformación, saneamiento y enriquecimiento | 23–35 ms |
| Serialización + red local (diferencia hasta el total) | ≈ 15–25 ms |
| **HTTP total, 100 resultados, en caliente** | **63–92 ms** (4 corridas: 140–192 ms desde el cliente incluyendo la conexión) |
| HTTP total, primera consulta tras arrancar (JIT y caché fría) | 334–1.149 ms |

Variantes de peor caso (3 corridas cada una, ms): más antiguos primero 419/120/130; página profunda (offset ≈ 50.000) 144/60/61; filtro tipo + operación 160/50/49; rango de fechas 334/113/113; filtro por actor 192/80/115.

## Conclusión
* **El objetivo (≤ 5.000 ms) se cumple con amplio margen** con un conjunto 5 veces mayor: peor caso observado 1,15 s en frío y < 0,45 s en las variantes en caliente.
* **La medición de 26.972 ms no se reproduce.** No se identificó ninguna causa en SQL (planes con búsquedas por índice y lecturas mínimas) ni en el backend (fases de decenas de milisegundos). No se modificó código ni índices: hacerlo sin evidencia sería actuar a ciegas.
* **Incidencia: abierta como "no reproducible".** Causa del bloqueo: se desconocen las condiciones de aquella medición (carga del anfitrión, caché fría, solapamiento con compilaciones Maven/Docker, o un entorno distinto). Para cerrarla en producción: activar `APP_AUDIT_DIAGNOSTICS_ENABLED=true` temporalmente, repetir `node scripts/medir-auditoria.cjs` sobre la base real tras la migración y adjuntar el desglose.
