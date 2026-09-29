package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.domain.catalog.Aircraft;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import com.vuelossanitarios.backend.repository.AircraftRepository;
import com.vuelossanitarios.backend.repository.AirportRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Regresión: con open-in-view=false, el listado administrativo de aeronaves fallaba con 500
 * (LazyInitializationException) cuando una aeronave tenía aeropuerto actual. Como el panel
 * ADMIN cargaba usuarios y aeronaves juntos, ese 500 dejaba vacía la lista de usuarios.
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:aircraftcatalog;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver",
  "spring.datasource.username=sa",
  "spring.datasource.password=",
  "spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop",
  "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
  "spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456",
  "app.bootstrap-admin.username=",
  "app.bootstrap-admin.password=",
  "app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class AircraftCatalogIntegrationTest {
 @Autowired MockMvc mvc;
 @Autowired AircraftRepository aircraft;
 @Autowired AirportRepository airports;

 @Test @WithMockUser(roles="ADMINISTRADOR")
 void adminAircraftListIncludesInactiveAircraftWithTheirCurrentAirport() throws Exception {
  Airport airport=new Airport(); airport.setNombre("Aeropuerto Regresión"); airport.setCodigoOaci("SZRG"); airport.setCodigoIata("RGX"); airports.save(airport);
  Aircraft located=new Aircraft(); located.setMatricula("LV-RGB"); located.setModelo("King Air"); located.setTipo("Turbohélice"); located.setActivo(false); located.setAeropuertoActual(airport); aircraft.save(located);
  Aircraft unlocated=new Aircraft(); unlocated.setMatricula("LV-RGA"); unlocated.setModelo("Learjet"); unlocated.setTipo("Jet"); aircraft.save(unlocated);

  mvc.perform(get("/api/catalogs/aircraft/admin"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$[?(@.matricula=='LV-RGB')].aeropuertoActual").value("Aeropuerto Regresión"))
   .andExpect(jsonPath("$[?(@.matricula=='LV-RGB')].activo").value(false))
   .andExpect(jsonPath("$[?(@.matricula=='LV-RGA')].aeropuertoActual").value((Object) null));
 }

 @Test @WithMockUser(roles="CENTRO_OPERACIONES")
 void operationalAircraftListSerializesTheCurrentAirportOutsideASession() throws Exception {
  Airport airport=new Airport(); airport.setNombre("Aeropuerto Operativo"); airport.setCodigoOaci("SZOP"); airport.setCodigoIata("OPX"); airports.save(airport);
  Aircraft x=new Aircraft(); x.setMatricula("LV-OPS"); x.setModelo("King Air"); x.setTipo("Turbohélice"); x.setAeropuertoActual(airport); aircraft.save(x);

  mvc.perform(get("/api/catalogs/aircraft"))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$[?(@.matricula=='LV-OPS')].aeropuertoActual").value("Aeropuerto Operativo"));
 }
}
