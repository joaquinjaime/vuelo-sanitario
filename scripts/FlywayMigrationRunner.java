import org.flywaydb.core.Flyway;

/** Standalone Flyway runner; validate mode is read-only and permits pending versions. */
public final class FlywayMigrationRunner {
    public static void main(String[] args) {
        if (args.length < 1 || args.length > 2 || (args.length == 2 && !args[1].equals("validate")))
            throw new IllegalArgumentException("Pass a numeric target and optionally 'validate'");
        boolean validateOnly = args.length == 2;
        String url = required("MIGRATION_JDBC_URL");
        String user = required("MIGRATION_SQL_USERNAME");
        String password = required("MIGRATION_JDBC_PASSWORD");
        String location = required("MIGRATION_LOCATION");
        String database = null;
        for (String part : url.split(";")) {
            if (part.regionMatches(true, 0, "databaseName=", 0, 13)) database = part.substring(13).trim();
        }
        if (database == null || database.isBlank()) throw new IllegalArgumentException("Use an explicit databaseName");
        // Cada actualización autorizada de la base habitual tiene su propia contraseña de autorización, ligada a la versión objetivo:
        // una autorización anterior (V32 a V47, V47 a V55) no habilita una migración posterior (V47 a V60) ni a la inversa.
        String authorization = System.getenv("MIGRATION_HABITUAL_AUTHORIZATION");
        boolean authorized = (args[0].equals("47") && "V32_TO_V47_AUTHORIZED".equals(authorization))
                || (args[0].equals("55") && "V47_TO_V55_AUTHORIZED".equals(authorization))
                || (args[0].equals("60") && "V47_TO_V60_AUTHORIZED".equals(authorization));
        if (!validateOnly && database.equalsIgnoreCase("vuelos_sanitarios") && !authorized)
            throw new IllegalStateException("Habitual database migration requires explicit maintenance authorization for the exact target version");
        var config = Flyway.configure()
                .dataSource(url, user, password)
                .locations(location.startsWith("classpath:") || location.startsWith("filesystem:")
                        ? location : "filesystem:" + location)
                .target(args[0]);
        if (validateOnly) config.ignoreMigrationPatterns("*:pending");
        var flyway = config.load();
        if (validateOnly) {
            flyway.validate();
            System.out.printf("Flyway target=%s, validation-only=success, pending versions permitted%n", args[0]);
            return;
        }
        var result = flyway.migrate();
        System.out.printf("Flyway target=%s, migrations executed=%d, success=%s%n",
                args[0], result.migrationsExecuted, result.success);
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("Set environment variable " + name);
        return value;
    }
}
