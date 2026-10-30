#!/usr/bin/env bash
# Ensayo NEGATIVO de la actualización V47 -> V55: sobre una restauración limpia se crea el único dato que hace fallar una migración conocida (un documento
# inactivo sin versiones detiene V52 con THROW 51052) y se comprueba que (1) el diagnóstico previo lo señala como ISSUE, (2) V52 falla sin dejar cambios
# a medias (SQL Server revierte la migración completa), (3) el historial de Flyway queda en V51 sin una fila fallida, y (4) tras corregir el dato la
# migración continúa hasta V55. Mismas restricciones que el ensayo principal: sólo la restauración aislada; nunca la base habitual.
# Uso: ENSAYO_WORK=<dir> scripts/ensayo-migracion-negativa.sh
set -euo pipefail
cd "$(dirname "$0")/.."
W="${ENSAYO_WORK:?defina ENSAYO_WORK}"; mkdir -p "$W/runner" "$W/logs"
set -a; . ./.env.e2e; set +a
SQLC=vuelos-sanitarios-e2e-sqlserver-1; DB=vuelos_sanitarios_ensayo_v47
sqlsa() { MSYS_NO_PATHCONV=1 docker exec -i -e SQLCMDPASSWORD="$E2E_MSSQL_SA_PASSWORD" "$SQLC" /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -b -W -s "|" "$@"; }
docker rm -f vuelos-sanitarios-ensayo-backend >/dev/null 2>&1 || true
echo "== N1. Restauración limpia de V47"
cp "$W/restore.sql" "$W/restore-neg.sql"
sqlsa < "$W/restore-neg.sql" | tail -1
echo "== N2. Se crea el dato conflictivo: un vuelo con un documento inactivo y sin versiones (sólo en la restauración)"
cat > "$W/neg-seed.sql" <<EOF
USE [$DB];
SET NOCOUNT ON;
INSERT INTO vuelos (codigo_vuelo, id_tipos_vuelo, motivo_vuelo, id_usuario_creador, fecha_creacion, fecha_actualizacion)
SELECT TOP 1 N'V-NEGATIVO', (SELECT TOP 1 id_tipos_vuelo FROM tipos_vuelo), N'Vuelo del ensayo negativo', id_usuarios, SYSDATETIME(), SYSDATETIME() FROM usuarios ORDER BY id_usuarios;
INSERT INTO documentos_vuelo (nombre_documento, esta_activo, fecha_creacion, id_vuelos, id_tipos_documento)
SELECT N'Documento inactivo sin versiones', 0, SYSDATETIME(), (SELECT id_vuelos FROM vuelos WHERE codigo_vuelo=N'V-NEGATIVO'), (SELECT TOP 1 id_tipos_documento FROM tipos_documento);
SELECT 'documentos inactivos sin versiones', COUNT(*) FROM documentos_vuelo d WHERE esta_activo=0 AND NOT EXISTS (SELECT 1 FROM versiones_documento_vuelo v WHERE v.id_documentos_vuelo=d.id_documentos_vuelo);
GO
EOF
sqlsa < "$W/neg-seed.sql" | tail -2
echo "== N3. Diagnóstico previo: debe informar el bloqueo"
{ echo "USE [$DB];"; echo "GO"; cat "$W/prevalidate.sql"; } | sqlsa | grep -E "ISSUE|WARNING" | tee "$W/logs/negativa-prevalidacion.log"
grep -q "ISSUE|hay documentos inactivos sin versiones" "$W/logs/negativa-prevalidacion.log"
echo "== N4. Migración V48..V55: debe detenerse en V52"
export ENSAYO_WORK="$W/runner"
for v in 48 49 50 51; do
  rc=0; o=$(scripts/ensayo-flyway.sh $v 2>"$W/logs/negativa-v$v.err") || rc=$?
  if [ "$rc" -eq 0 ]; then echo "V$v aplicada ($(echo "$o" | grep -oE 'now at version v[0-9]+' | head -1)); reintentos: $(grep -c reintento "$W/logs/negativa-v$v.err" || true)"; else echo "V$v FALLÓ: $(echo "$o" | grep -E 'Exception|ERROR' | head -2 | cut -c1-240)"; exit 1; fi
done
rc=0; out=$(scripts/ensayo-flyway.sh 52 2>&1) || rc=$?
echo "V52 rc=$rc: $(echo "$out" | grep -E 'Hay documentos inactivos|51052|Migration V52' | head -2 | cut -c1-260)"
[ "$rc" -ne 0 ]
cat > "$W/neg-check.sql" <<EOF
USE [$DB];
SET NOCOUNT ON;
SELECT 'flyway_max_ok', MAX(TRY_CONVERT(int,version)) FROM flyway_schema_history WHERE success=1;
SELECT 'flyway_filas_fallidas', COUNT(*) FROM flyway_schema_history WHERE success=0;
SELECT 'documentos_vuelo_columnas', COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.documentos_vuelo');
SELECT 'documento_conflictivo_intacto', COUNT(*) FROM documentos_vuelo WHERE nombre_documento=N'Documento inactivo sin versiones' AND esta_activo=0;
GO
EOF
sqlsa < "$W/neg-check.sql" | tee "$W/logs/negativa-estado.log" | tail -4
echo "== N5. Corrección del dato (sólo ensayo: se reactiva el documento) y reanudación hasta V55"
cat > "$W/neg-fix.sql" <<EOF
USE [$DB];
UPDATE documentos_vuelo SET esta_activo=1 WHERE nombre_documento=N'Documento inactivo sin versiones';
GO
EOF
sqlsa < "$W/neg-fix.sql" | tail -1
scripts/ensayo-flyway.sh 55 2>&1 | grep -E "Successfully applied|Flyway target" | cut -c1-200 | tee "$W/logs/negativa-reanudacion.log"
sqlsa < "$W/neg-check.sql" | tail -4
