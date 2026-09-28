package com.vuelossanitarios.backend.migration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class GeographicCatalogDatasetTest {
 private final ObjectMapper json = new ObjectMapper();
 @Test void officialSnapshotsHaveExpectedReferencesAndNoOrphanLocalities() throws Exception {
  JsonNode provinces = json.readTree(resource("catalogos/provincias-georef-2026-09-28.json")).path("provincias");
  JsonNode localities = json.readTree(resource("catalogos/localidades-georef-2026-09-28.json")).path("localidades");
  assertEquals(24, provinces.size()); assertEquals(4037, localities.size());
  Set<String> provinceIds = new HashSet<>(), localityIds = new HashSet<>();
  provinces.forEach(x -> assertTrue(provinceIds.add(x.path("id").asText())));
  localities.forEach(x -> { assertTrue(localityIds.add(x.path("id").asText())); assertTrue(provinceIds.contains(x.path("provincia").path("id").asText())); });
  boolean tucumanFound=false; for(JsonNode locality:localities) if("Tucumán".equals(locality.path("provincia").path("nombre").asText()) && locality.path("nombre").asText().contains("Tucumán")){tucumanFound=true;break;} assertTrue(tucumanFound);
 }
 @Test void aviationSnapshotExcludesHeliportsFromThisStage() throws Exception {
  int aerodromes=0, heliports=0; try(BufferedReader reader=new BufferedReader(new InputStreamReader(resource("catalogos/aerodromos-mintrans-2026-09-28.csv"), StandardCharsets.UTF_8))){reader.readLine();String line;while((line=reader.readLine())!=null){String[] fields=line.split(";",-1);if(fields.length<4)continue;if(fields[3].replace("\"","").equalsIgnoreCase("Aeródromo"))aerodromes++;if(fields[3].replace("\"","").equalsIgnoreCase("Helipuerto"))heliports++;}}
  assertEquals(566,aerodromes); assertEquals(127,heliports);
 }
 private InputStream resource(String path){InputStream input=getClass().getClassLoader().getResourceAsStream(path);assertNotNull(input,path);return input;}
}
