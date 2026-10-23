import org.flywaydb.core.Flyway;

/** Small source-file-mode runner used by validate-migration-upgrade.ps1. */
public final class FlywayMigrationRunner {
    public static void main(String[] args) {
        if (args.length != 1) throw new IllegalArgumentException("Pass one numeric Flyway target, e.g. 32 or 47");
        String url = required("MIGRATION_JDBC_URL");
        String user = required("MIGRATION_SQL_USERNAME");
        String password = required("MIGRATION_JDBC_PASSWORD");
        String location = required("MIGRATION_LOCATION");
        var result = Flyway.configure()
                .dataSource(url, user, password)
                .locations("filesystem:" + location)
                .target(args[0])
                .load()
                .migrate();
        System.out.printf("Flyway target=%s, migrations executed=%d, success=%s%n",
                args[0], result.migrationsExecuted, result.success);
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("Set environment variable " + name);
        return value;
    }
}
