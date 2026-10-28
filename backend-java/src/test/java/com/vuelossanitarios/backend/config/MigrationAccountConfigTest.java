package com.vuelossanitarios.backend.config;

import static org.junit.jupiter.api.Assertions.*;

import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

/** Flyway usa su propia cuenta cuando está configurada; nunca se acepta la misma identidad ni la ausencia de cuenta en producción. */
class MigrationAccountConfigTest {
 private static final String URL="jdbc:sqlserver://sqlserver:1433;databaseName=vuelos;encrypt=true;trustServerCertificate=true";
 private final MigrationAccountConfig config=new MigrationAccountConfig();

 private FluentConfiguration customize(String appUser,String migUser,String migPass,String env){
  FluentConfiguration c=Flyway.configure();
  config.migrationAccount(URL,appUser,migUser,migPass,env).customize(c);
  return c;
 }

 @Test void flywayReceivesItsOwnDataSourceWhenAMigrationAccountExists(){
  FluentConfiguration c=customize("vuelos_app","vuelos_migrator","distinta-1","desarrollo");
  assertNotNull(c.getDataSource(),"Flyway debe tener un DataSource propio");
  assertTrue(c.getDataSource().toString().length()>0);
 }
 @Test void theSameAccountForBothRolesIsRefused(){
  var e=assertThrows(IllegalStateException.class,()->customize("Vuelos_App","vuelos_app","x","desarrollo"));
  assertTrue(e.getMessage().contains("distinta"));
 }
 @Test void aMigrationAccountWithoutPasswordIsRefused(){
  assertThrows(IllegalStateException.class,()->customize("vuelos_app","vuelos_migrator","","pruebas"));
 }
 @Test void productionNeverFallsBackToTheApplicationAccount(){
  assertThrows(IllegalStateException.class,()->customize("vuelos_app","","","produccion"));
  assertThrows(IllegalStateException.class,()->customize("vuelos_app","  ","","PRODUCCION"));
 }
 @Test void developmentWithoutMigrationAccountKeepsTheApplicationDataSource(){
  FluentConfiguration c=customize("vuelos_app","","","desarrollo");
  assertNull(c.getDataSource(),"sin cuenta de migración no se reemplaza el DataSource (compatibilidad de desarrollo local)");
 }
}
