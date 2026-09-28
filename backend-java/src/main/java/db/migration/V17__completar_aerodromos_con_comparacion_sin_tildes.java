package db.migration;

import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/** Completes upgrades run with the original V16 comparison of province names. */
public class V17__completar_aerodromos_con_comparacion_sin_tildes extends BaseJavaMigration {
 @Override public void migrate(Context context)throws Exception{String sql="INSERT INTO aeropuertos(codigo_oficial,codigo_oaci,codigo_iata,nombre,ciudad,provincia,pais,latitud,longitud,activo,provincia_id,tipo) SELECT ?,?,?,?,?,?,N'Argentina',?,?,1,id,N'AERÓDROMO' FROM provincias p WHERE (p.nombre COLLATE Latin1_General_100_CI_AI=? COLLATE Latin1_General_100_CI_AI OR p.codigo_oficial=?) AND NOT EXISTS(SELECT 1 FROM aeropuertos a WHERE a.codigo_oficial=? OR (a.codigo_oaci IS NOT NULL AND a.codigo_oaci=?) OR (a.codigo_iata IS NOT NULL AND a.codigo_iata=?))";try(BufferedReader r=new BufferedReader(new InputStreamReader(resource(),StandardCharsets.UTF_8));PreparedStatement s=context.getConnection().prepareStatement(sql)){r.readLine();String line;while((line=r.readLine())!=null){String[] a=parse(line);if(a.length<22||!"AERÓDROMO".equalsIgnoreCase(clean(a[3])))continue;String code=blank(a[0]),oaci=blank(a[1]),iata=blank(a[2]),province=clean(a[21]);s.setString(1,code);s.setString(2,oaci);s.setString(3,iata);s.setString(4,clean(a[4]));s.setString(5,clean(a[10]));s.setString(6,province);s.setBigDecimal(7,num(a[7]));s.setBigDecimal(8,num(a[6]));s.setString(9,province);s.setString(10,province.startsWith("TIERRA DEL FUEGO")?"94":"");s.setString(11,code);s.setString(12,oaci);s.setString(13,iata);s.addBatch();}s.executeBatch();}}
 private InputStream resource(){InputStream in=getClass().getClassLoader().getResourceAsStream("catalogos/aerodromos-mintrans-2026-09-28.csv");if(in==null)throw new IllegalStateException("Dataset faltante");return in;} private String blank(String value){value=clean(value);return value.isBlank()?null:value;}private String clean(String value){return value.replaceAll("^\\\"|\\\"$","").replace("\"\"","\"").trim();}private BigDecimal num(String value){try{return new BigDecimal(value.trim());}catch(Exception e){return null;}}private String[] parse(String line){java.util.ArrayList<String> fields=new java.util.ArrayList<>();StringBuilder value=new StringBuilder();boolean quoted=false;for(int i=0;i<line.length();i++){char ch=line.charAt(i);if(ch=='\"'){if(quoted&&i+1<line.length()&&line.charAt(i+1)=='\"'){value.append(ch);i++;}else quoted=!quoted;}else if(ch==';'&&!quoted){fields.add(value.toString());value.setLength(0);}else value.append(ch);}fields.add(value.toString());return fields.toArray(String[]::new);}
}
