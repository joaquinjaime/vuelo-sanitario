package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.domain.person.CredentialPolicy;
import com.vuelossanitarios.backend.domain.person.ProfessionalCredential;
import java.text.Normalizer;
import java.util.*;
import java.util.function.Predicate;

/**
 * Única regla de suficiencia profesional: decide si alguna habilitación vigente de la persona satisface alguna política activa
 * aplicable a la función y al contexto operativo (tipo de vuelo y categoría de aeronave). No contiene requisitos regulatorios propios:
 * todo lo exigible vive en {@code politicas_habilitacion}. Sin políticas aplicables jamás concluye que la persona esté habilitada.
 */
public final class CredentialSufficiency {
 private CredentialSufficiency(){}
 /** {@code strict}: se evalúa un vuelo concreto, por lo que un dato de contexto ausente impide concluir. Si no, la consulta es informativa y lo ignora. */
 public record Context(String flightTypeCode,String aircraftCategory,boolean strict){
  public static final Context ANY=new Context(null,null,false);
  public static Context of(String flightTypeCode,String aircraftCategory){return new Context(flightTypeCode,aircraftCategory,true);}
 }
 public record Outcome(boolean sufficient,String code,String message,ProfessionalCredential credential,CredentialPolicy policy){
  static Outcome denied(String code,String message){return new Outcome(false,code,message,null,null);}
 }
 public static String norm(String value){
  if(value==null)return null;
  String s=Normalizer.normalize(value.trim(),Normalizer.Form.NFD).replaceAll("\\p{M}+","").replaceAll("\\s+"," ").toUpperCase(Locale.ROOT);
  return s.isEmpty()?null:s;
 }
 private static boolean scoped(String ruleValue,String contextValue,Context ctx){
  return ruleValue==null||(contextValue==null?!ctx.strict():norm(ruleValue).equals(norm(contextValue)));
 }
 /** @param current habilitaciones verificadas y con vigencia ya comprobada por el llamador. */
 public static Outcome evaluate(List<CredentialPolicy> activeRules,List<ProfessionalCredential> current,Context ctx,Predicate<ProfessionalCredential> externalCheckPassed){
  if(activeRules.isEmpty())return Outcome.denied("POLITICA_HABILITACION_NO_CONFIGURADA","No hay una política de suficiencia configurada para esta función; un administrador debe definirla antes de habilitar asignaciones");
  boolean contextMissing=false;List<CredentialPolicy> applicable=new ArrayList<>();
  for(CredentialPolicy rule:activeRules){
   String type=rule.flightType==null?null:rule.flightType.getCodigo();
   boolean typeMissing=type!=null&&ctx.flightTypeCode()==null&&ctx.strict(),categoryMissing=rule.aircraftCategory!=null&&ctx.aircraftCategory()==null&&ctx.strict();
   if(typeMissing||categoryMissing){contextMissing=true;continue;}
   if(scoped(type,ctx.flightTypeCode(),ctx)&&scoped(rule.aircraftCategory,ctx.aircraftCategory(),ctx))applicable.add(rule);
  }
  if(applicable.isEmpty())return contextMissing
   ?Outcome.denied("CONTEXTO_OPERATIVO_INCOMPLETO","La política exige conocer la aeronave del vuelo para evaluar la habilitación; asigne la aeronave primero")
   :Outcome.denied("POLITICA_HABILITACION_NO_CONFIGURADA","No hay una política de suficiencia configurada para este tipo de operación y categoría de aeronave");
  String failure="HABILITACION_NO_SUFICIENTE",failureMessage="Ninguna habilitación vigente es suficiente para este tipo de operación y aeronave";
  for(ProfessionalCredential c:current)for(CredentialPolicy rule:applicable){
   if(!Objects.equals(norm(c.type),norm(rule.credentialType)))continue;
   if(rule.aircraftCategory!=null&&!Objects.equals(norm(c.aircraftCategory),norm(rule.aircraftCategory)))continue;
   if(Boolean.TRUE.equals(rule.requiresJurisdiction)&&c.jurisdiction==null){failure="JURISDICCION_NO_REGISTRADA";failureMessage="La política exige la jurisdicción de la matrícula y la habilitación no la tiene registrada";continue;}
   if(Boolean.TRUE.equals(rule.requiresExternalCheck)&&!externalCheckPassed.test(c)){failure="CONSULTA_EXTERNA_REQUERIDA";failureMessage="La política exige una consulta externa registrada con resultado coincidente";continue;}
   return new Outcome(true,"ELEGIBLE","Habilitación verificada, vigente y suficiente",c,rule);
  }
  return Outcome.denied(failure,failureMessage);
 }
}
