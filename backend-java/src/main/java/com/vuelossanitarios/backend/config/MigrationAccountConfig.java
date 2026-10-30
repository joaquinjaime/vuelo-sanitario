package com.vuelossanitarios.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Separa la identidad que migra el esquema de la que opera la aplicación (mínimo privilegio).
 * Cuando Flyway corre dentro de la aplicación (desarrollo/E2E) lo hace con app.migration.username (db_owner); el acceso normal a datos usa
 * spring.datasource.* (db_datareader/db_datawriter, sin DDL). En producción las migraciones no corren al arrancar (SPRING_FLYWAY_ENABLED=false): las aplica el
 * procedimiento controlado con la cuenta de migraciones y el backend ni siquiera recibe esas credenciales.
 */
@Configuration
public class MigrationAccountConfig {
 private static final Logger log=LoggerFactory.getLogger(MigrationAccountConfig.class);

 @Bean FlywayConfigurationCustomizer migrationAccount(@Value("${spring.datasource.url}") String url,@Value("${spring.datasource.username:}") String appUser,
   @Value("${app.migration.username:}") String migrationUser,@Value("${app.migration.password:}") String migrationPassword,@Value("${app.environment:desarrollo}") String environment){
  return configuration->{
   boolean production="produccion".equalsIgnoreCase(environment.trim());
   if(migrationUser.isBlank()){
    if(production) throw new IllegalStateException("Con app.environment=produccion las migraciones requieren una cuenta propia (MIGRATION_DB_USERNAME) distinta de la de la aplicación; en producción deben aplicarse con el procedimiento controlado (SPRING_FLYWAY_ENABLED=false).");
    log.warn("Flyway usará la cuenta de la aplicación porque MIGRATION_DB_USERNAME no está configurada: sólo es aceptable en desarrollo local (se recomienda separar las cuentas).");
    return;
   }
   if(migrationUser.equalsIgnoreCase(appUser)) throw new IllegalStateException("La cuenta de migraciones debe ser distinta de la cuenta de la aplicación.");
   if(migrationPassword.isBlank()) throw new IllegalStateException("MIGRATION_DB_PASSWORD no está configurada.");
   configuration.dataSource(url,migrationUser,migrationPassword);
   log.info("Flyway usará la cuenta de migraciones dedicada (distinta de la cuenta de la aplicación).");
  };
 }
}
