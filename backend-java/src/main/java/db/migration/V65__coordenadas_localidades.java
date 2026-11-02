package db.migration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Types;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * Carga el centroide aproximado de cada localidad desde el dataset versionado local (el mismo que sembró V16/V26); no consulta ningún servicio externo.
 * Se usa sólo para ordenar aeropuertos candidatos por distancia en línea recta respecto del paciente: no es distancia ni tiempo de traslado terrestre.
 * Las localidades sin coordenadas en el dataset (p. ej. altas manuales) quedan en NULL y se presentan como "sin datos".
 */
public class V65__coordenadas_localidades extends BaseJavaMigration {
 @Override public void migrate(Context context) throws Exception {
  Connection c=context.getConnection();
  try(InputStream in=getClass().getClassLoader().getResourceAsStream("catalogos/localidades-georef-2026-09-28.json")){
   if(in==null)throw new IllegalStateException("Dataset faltante: catalogos/localidades-georef-2026-09-28.json");
   JsonNode root=new ObjectMapper().readTree(in);
   try(PreparedStatement s=c.prepareStatement("UPDATE localidades SET latitud=?,longitud=? WHERE codigo_oficial=? AND latitud IS NULL AND longitud IS NULL")){
    int n=0;
    for(JsonNode x:root.path("localidades")){
     JsonNode centroid=x.path("centroide");
     if(!centroid.path("lat").isNumber()||!centroid.path("lon").isNumber())continue;
     s.setBigDecimal(1,BigDecimal.valueOf(centroid.path("lat").asDouble()).setScale(6,RoundingMode.HALF_UP));
     s.setBigDecimal(2,BigDecimal.valueOf(centroid.path("lon").asDouble()).setScale(6,RoundingMode.HALF_UP));
     s.setString(3,x.path("id").asText());
     s.addBatch();
     if(++n%500==0)s.executeBatch();
    }
    s.executeBatch();
   }
  }
 }
}
