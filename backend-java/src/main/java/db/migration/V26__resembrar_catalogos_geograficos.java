package db.migration;

import org.flywaydb.core.api.migration.Context;

/** Reejecuta los datasets versionados después del corte destructivo V24. */
public class V26__resembrar_catalogos_geograficos extends V16__seed_catalogos_geograficos {
    @Override public void migrate(Context context) throws Exception {
        var connection = context.getConnection();
        seedProvinces(connection);
        seedLocalities(connection);
        seedAerodromes(connection);
    }
}
