#!/usr/bin/env bash
# Ensayo de migración: ejecuta Flyway (FlywayMigrationRunner) hasta la versión indicada, o sólo valida, SOBRE LA RESTAURACIÓN AISLADA
# `vuelos_sanitarios_ensayo_v47` de la instancia SQL Server E2E. Nunca apunta a la base habitual: la URL está fija en este archivo y el
# propio runner exige una autorización explícita distinta para `vuelos_sanitarios`.
# Uso: scripts/ensayo-flyway.sh <versión> [validate]      (lee E2E_MSSQL_SA_PASSWORD de .env.e2e sin mostrarla)
set -euo pipefail
cd "$(dirname "$0")/.."
target="${1:?indique la versión objetivo}"; mode="${2:-}"
set -a; . ./.env.e2e; set +a
work="${ENSAYO_WORK:?defina ENSAYO_WORK (directorio temporal con el runner compilado)}"
m2="${M2_REPO:-$HOME/.m2/repository}"
jars=(org/flywaydb/flyway-core/10.20.1/flyway-core-10.20.1.jar org/flywaydb/flyway-sqlserver/10.20.1/flyway-sqlserver-10.20.1.jar
  com/microsoft/sqlserver/mssql-jdbc/12.8.1.jre11/mssql-jdbc-12.8.1.jre11.jar com/fasterxml/jackson/core/jackson-databind/2.18.3/jackson-databind-2.18.3.jar
  com/fasterxml/jackson/core/jackson-core/2.18.3/jackson-core-2.18.3.jar com/fasterxml/jackson/core/jackson-annotations/2.18.3/jackson-annotations-2.18.3.jar
  com/fasterxml/jackson/dataformat/jackson-dataformat-toml/2.18.3/jackson-dataformat-toml-2.18.3.jar org/slf4j/slf4j-api/2.0.17/slf4j-api-2.0.17.jar)
if [ ! -f "$work/FlywayMigrationRunner.class" ]; then
  cp_host=""; for j in "${jars[@]}"; do cp_host="$cp_host;$(cygpath -w "$m2/$j" 2>/dev/null || echo "$m2/$j")"; done
  javac -cp "${cp_host#;}" -d "$work" scripts/FlywayMigrationRunner.java
fi
cp_in=""; for j in "${jars[@]}"; do cp_in="$cp_in:/m2/$j"; done
# Las clases compiladas se copian a una carpeta propia y estable: montar directamente backend-java/target/classes (que Maven recrea) en Docker Desktop
# (Windows) a veces deja una vista vacía u obsoleta y Flyway informa "No migration with a target version ... could be found" sin haber tocado la base.
# Ese único error se reintenta (hasta 4 veces); cualquier otro error se informa de inmediato.
rm -rf "$work/classes"; cp -r backend-java/target/classes "$work/classes"
# I-5.8: ENSAYO_MIGRATION_ACCOUNT=migrator aplica las migraciones con la cuenta de migraciones (db_owner), igual que el procedimiento de producción; por omisión sigue usando sa.
if [ "${ENSAYO_MIGRATION_ACCOUNT:-sa}" = "migrator" ]; then mig_user="${MIGRATION_DB_USERNAME:?falta MIGRATION_DB_USERNAME en .env.e2e}"; export MIGRATION_JDBC_PASSWORD="${MIGRATION_DB_PASSWORD:?falta MIGRATION_DB_PASSWORD en .env.e2e}"
else mig_user=sa; export MIGRATION_JDBC_PASSWORD="$E2E_MSSQL_SA_PASSWORD"; fi
run_flyway() {
MSYS_NO_PATHCONV=1 docker run --rm --name "vuelos-sanitarios-ensayo-flyway-$$-$RANDOM" --network vuelos-sanitarios-e2e_internal --memory 320m \
  -e MIGRATION_JDBC_URL='jdbc:sqlserver://sqlserver:1433;databaseName=vuelos_sanitarios_ensayo_v47;encrypt=true;trustServerCertificate=true' \
  -e MIGRATION_SQL_USERNAME="$mig_user" -e MIGRATION_JDBC_PASSWORD -e MIGRATION_LOCATION='classpath:db/migration' \
  -v "$(cygpath -w "$m2")":/m2:ro -v "$(cygpath -w "$work")":/runner:ro \
  --entrypoint java vuelos-sanitarios-e2e-backend:latest -Xmx200m -cp "/runner:/runner/classes${cp_in}" FlywayMigrationRunner "$target" $mode
}
for attempt in 1 2 3 4; do
  rc=0; out=$(run_flyway 2>&1) || rc=$?
  if [ "$rc" -ne 0 ] && echo "$out" | grep -q "could be found"; then echo "(reintento $attempt: el montaje de clases no estaba listo)" >&2; sleep 3; continue; fi
  echo "$out"; exit "$rc"
done
echo "$out"; exit 1
