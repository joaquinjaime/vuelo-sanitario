#!/usr/bin/env bash
# Ensayo reproducible de la actualización V47 -> V59 sobre una RESTAURACIÓN aislada de la base habitual. No toca la base habitual ni crea otra
# instancia de SQL Server: usa una base nueva (`vuelos_sanitarios_ensayo_v47`) dentro de la instancia E2E existente.
# Variante V59 (I-5.6). Requisitos: el respaldo COPY_ONLY verificado de V47 ya copiado a /var/opt/mssql/backup/ensayo_v47_copyonly.bak del contenedor SQL E2E; el backend E2E
# existente (sólo se lee su configuración) y la imagen vuelos-sanitarios-backend:release-v47-20261023. ENSAYO_WORK: directorio temporal con secretos
# (se debe eliminar al terminar). Uso: ENSAYO_WORK=<dir> scripts/ensayo-migracion-v47-v59.sh
set -euo pipefail
cd "$(dirname "$0")/.."
W="${ENSAYO_WORK:?defina ENSAYO_WORK}"; mkdir -p "$W/runner" "$W/logs"
set -a; . ./.env.e2e; set +a
SQLC=vuelos-sanitarios-e2e-sqlserver-1; BK=vuelos-sanitarios-ensayo-backend; DB=vuelos_sanitarios_ensayo_v47
sqlsa() { MSYS_NO_PATHCONV=1 docker exec -i -e SQLCMDPASSWORD="$E2E_MSSQL_SA_PASSWORD" "$SQLC" /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -b -W -s "|" "$@"; }
wait_started() { for _ in $(seq 1 70); do docker logs --since 3m "$BK" 2>&1 | grep -qE "Started BackendApplication" && return 0; docker logs --since 3m "$BK" 2>&1 | grep -qE "APPLICATION FAILED|Application run failed" && { echo "el backend no arrancó"; return 1; }; sleep 4; done; return 1; }
echo "== 1. Restauración limpia del respaldo V47 en $DB"
docker rm -f "$BK" >/dev/null 2>&1 || true
cat > "$W/restore.sql" <<EOF
SET NOCOUNT ON;
IF DB_ID(N'$DB') IS NOT NULL ALTER DATABASE [$DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
GO
RESTORE DATABASE [$DB] FROM DISK=N'/var/opt/mssql/backup/ensayo_v47_copyonly.bak' WITH CHECKSUM, RECOVERY, REPLACE,
 MOVE N'vuelos_sanitarios' TO N'/var/opt/mssql/data/$DB.mdf', MOVE N'vuelos_sanitarios_log' TO N'/var/opt/mssql/data/${DB}_log.ldf';
GO
ALTER DATABASE [$DB] SET RECOVERY SIMPLE; ALTER DATABASE [$DB] SET MULTI_USER;
GO
USE [$DB]; ALTER USER [joaquin] WITH LOGIN = [joaquin];
SELECT 'restaurada en Flyway', MAX(TRY_CONVERT(int,version)) FROM flyway_schema_history;
GO
EOF
sqlsa < "$W/restore.sql" | tail -2
echo "== 2. Backend V47 (imagen release) contra la restauración; siembra con el contrato V47"
docker inspect vuelos-sanitarios-e2e-backend-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E "^(APP_|BOOTSTRAP_|CORS_|DB_|DOCUMENT|EMAIL_|FINAL_|JWT_|MAIL_|MAX_PDF|SPRING_)" > "$W/ensayo.env"
sed -i "s#^DB_URL=.*#DB_URL=jdbc:sqlserver://sqlserver:1433;databaseName=$DB;encrypt=true;trustServerCertificate=true#; s#^APP_PUBLIC_URL=.*#APP_PUBLIC_URL=http://127.0.0.1:18090#; s#^MAIL_ENABLED=.*#MAIL_ENABLED=false#" "$W/ensayo.env"
docker volume rm -f vuelos-sanitarios-ensayo_documents >/dev/null 2>&1 || true; docker volume create vuelos-sanitarios-ensayo_documents >/dev/null
MSYS_NO_PATHCONV=1 docker run --rm --user root --entrypoint chown -v vuelos-sanitarios-ensayo_documents:/data/documents vuelos-sanitarios-backend:release-v47-20261023 999:999 /data/documents
docker run -d --name "$BK" --network vuelos-sanitarios-e2e_internal --env-file "$W/ensayo.env" -e JAVA_TOOL_OPTIONS=-Xmx400m -p 127.0.0.1:18090:8080 -v vuelos-sanitarios-ensayo_documents:/data/documents vuelos-sanitarios-backend:release-v47-20261023 >/dev/null
wait_started
export E2E_BASE=http://127.0.0.1:18090/api E2E_DB_NAME=$DB E2E_SQL_CONTAINER=$SQLC E2E_BACKEND_CONTAINER=$BK ENSAYO_STATE="$W/ensayo-state.json"
export E2E_FIXED_MARK="ens$(date +%H%M)" E2E_FIXED_PASSWORD="Ens-$(head -c 12 /dev/urandom | base64 | tr -d '/+=')"
node scripts/ensayo-sembrar-v47.cjs 2>&1 | tail -8 | cut -c1-600 | tee "$W/logs/siembra.log"
docker stop "$BK" >/dev/null; docker rm "$BK" >/dev/null
echo "== 3. Fotografía previa (V47 con datos sembrados)"
node scripts/ensayo-snapshot.cjs "$W/snap-pre.json" | tee "$W/logs/snap-pre.log"
echo "== 3b. Diagnóstico previo (el mismo T-SQL de scripts/prevalidate-migrations.ps1) sobre la restauración V47"
node -e "const t=require('fs').readFileSync('scripts/prevalidate-migrations.ps1','utf8').replace(/\r\n/g,'\n');const i=t.indexOf(\"@'\n\")+3,j=t.indexOf(\"\n'@\",i);require('fs').writeFileSync(process.argv[1],t.slice(i,j)+'\nGO\n')" "$W/prevalidate.sql"
{ echo "USE [$DB];"; echo "GO"; cat "$W/prevalidate.sql"; } | sqlsa | tee "$W/logs/prevalidacion.log"
echo "== 4. Validación de checksums y migración V48..V59, una por una"
export ENSAYO_WORK="$W/runner"
vout=$(scripts/ensayo-flyway.sh 59 validate 2>&1) || { echo "$vout" | grep -vE "^[[:space:]]+at " | tail -15; echo "LA VALIDACIÓN DE CHECKSUMS FALLÓ"; exit 1; }
echo "$vout" | grep -E "Successfully validated|Flyway target" | cut -c1-200
: > "$W/logs/migrate.log"
for v in 48 49 50 51 52 53 54 55 56 57 58 59; do
  t0=$(date +%s); rc=0; out=$(scripts/ensayo-flyway.sh $v 2>&1) || rc=$?; t1=$(date +%s)
  echo "V$v rc=$rc ($((t1-t0)) s, incluye arranque de la JVM): $(echo "$out" | grep -E 'Successfully applied|ERROR|Msg ' | head -2 | cut -c1-200)" | tee -a "$W/logs/migrate.log"
  [ "$rc" -eq 0 ] || { echo "$out" | tail -20; echo "MIGRACIÓN FALLIDA EN V$v: ensayo detenido"; exit 1; }
done
echo "== 5. Fotografía posterior y comparación"
node scripts/ensayo-snapshot.cjs "$W/snap-post.json" "$W/snap-pre.json" | tee "$W/logs/snap-post.log"
echo "== 6. Backend V59 (build actual, con ClamAV real) sobre la restauración migrada"
sed -i "s#^MAIL_ENABLED=.*#MAIL_ENABLED=true#" "$W/ensayo.env"
sed -i "/^APP_ANTIMALWARE_/d" "$W/ensayo.env"; printf 'APP_ANTIMALWARE_ENABLED=true
APP_ANTIMALWARE_HOST=clamav
APP_ANTIMALWARE_TIMEOUT_MS=15000
' >> "$W/ensayo.env"
docker run -d --name "$BK" --network vuelos-sanitarios-e2e_internal --env-file "$W/ensayo.env" -e JAVA_TOOL_OPTIONS=-Xmx400m -p 127.0.0.1:18090:8080 -v vuelos-sanitarios-ensayo_documents:/data/documents vuelos-sanitarios-e2e-backend:latest >/dev/null
wait_started
echo "== 7. Prueba funcional"
node scripts/ensayo-funcional-v59.cjs 2>&1 | tee "$W/logs/funcional.log" | tail -16 | cut -c1-400
