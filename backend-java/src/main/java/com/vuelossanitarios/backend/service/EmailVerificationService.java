package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.person.ContactNormalizer;
import com.vuelossanitarios.backend.domain.person.EmailContact;
import com.vuelossanitarios.backend.domain.person.EmailVerification;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.mail.MailTransport;
import com.vuelossanitarios.backend.repository.EmailContactRepository;
import com.vuelossanitarios.backend.repository.EmailVerificationRepository;
import com.vuelossanitarios.backend.repository.PersonRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Verificación de la recepción de un correo mediante un código de un solo uso enviado a esa dirección. Sólo quien tiene sesión como
 * titular del contacto puede confirmarlo (un identificador ajeno responde 404, igual que uno inexistente), de modo que no se
 * confirman contactos de otra persona ni se revela si una dirección pertenece a otra cuenta.
 *
 * <ul>
 * <li>Código de 8 caracteres de un alfabeto sin ambigüedades (≈ 39,6 bits) generado con {@link SecureRandom}. En la base sólo se guarda su
 *     HMAC-SHA256 con una clave derivada del secreto del servidor, ligado al correo y a la dirección normalizada: si la dirección cambia, el
 *     código ya no sirve. Nunca se registra en logs ni en auditoría.</li>
 * <li>Vence ({@code app.verification.code-minutes}), se usa una sola vez, admite {@code max-attempts} errores y se reemplaza al reenviar
 *     (una verificación abierta por correo, garantizado por un índice filtrado). Persistente: sobrevive a reiniciar el backend.</li>
 * <li>Límites de envío: un mensaje cada {@code resend-seconds} por correo, {@code max-per-email-per-day} por correo y
 *     {@code max-per-user-per-day} por usuario cada 24 h. El rechazo por abuso se audita.</li>
 * <li>Que el servidor SMTP acepte el mensaje no prueba la entrega: se guarda como "aceptado por el servidor" y el correo sólo queda
 *     verificado cuando alguien devuelve el código. Sin SMTP configurado nada se envía ni se simula ({@code MAIL_NOT_CONFIGURED}).</li>
 * <li>Los fallos (código incorrecto, intentos agotados, límite de envíos) se confirman en su propia transacción: el contador y la
 *     auditoría no se pierden con la respuesta de error.</li>
 * </ul>
 */
@Service public class EmailVerificationService {
 private static final Logger log=LoggerFactory.getLogger(EmailVerificationService.class);
 private static final ObjectMapper JSON=new ObjectMapper();
 private static final String ALPHABET="ABCDEFGHJKMNPQRSTUVWXYZ23456789";
 static final int CODE_LENGTH=8;
 public static final String VERIFIED="VERIFICADO",PENDING="PENDIENTE",EXPIRED="EXPIRADO",UNVERIFIED="SIN_VERIFICAR";
 public static final String SENT="ENVIADO",NOT_CONFIGURED="NO_CONFIGURADO",FAILED="FALLIDO",RATE_LIMITED="LIMITE_ALCANZADO";
 private final EmailVerificationRepository verifications; private final EmailContactRepository emails; private final PersonRepository persons; private final UserRepository users;
 private final AuditService audit; private final Clock clock; private final MailTransport mail; private final TransactionTemplate tx;
 private final SecureRandom random=new SecureRandom(); private final byte[] key;
 private final long codeMinutes,resendSeconds; private final int maxAttempts,maxPerEmail,maxPerUser; private final String publicUrl;

 public EmailVerificationService(EmailVerificationRepository v,EmailContactRepository e,PersonRepository p,UserRepository u,AuditService a,Clock c,MailTransport m,PlatformTransactionManager txm,
   @Value("${app.jwt.secret}") String secret,@Value("${app.verification.code-minutes:30}") long codeMinutes,@Value("${app.verification.resend-seconds:60}") long resendSeconds,
   @Value("${app.verification.max-attempts:5}") int maxAttempts,@Value("${app.verification.max-per-email-per-day:5}") int maxPerEmail,@Value("${app.verification.max-per-user-per-day:10}") int maxPerUser,
   @Value("${app.mail.public-url:}") String publicUrl){
  verifications=v;emails=e;persons=p;users=u;audit=a;clock=c;mail=m;tx=new TransactionTemplate(txm);
  this.codeMinutes=codeMinutes;this.resendSeconds=resendSeconds;this.maxAttempts=maxAttempts;this.maxPerEmail=maxPerEmail;this.maxPerUser=maxPerUser;this.publicUrl=publicUrl==null?"":publicUrl.trim();
  key=hmac(secret.getBytes(StandardCharsets.UTF_8),"vuelos-sanitarios:email-verification:v1".getBytes(StandardCharsets.UTF_8));
 }

 public boolean mailConfigured(){return mail.configured();}

 /** Resultado de emitir un código; {@code retryAfterSeconds} sólo con {@link #RATE_LIMITED}. */
 public record Issued(String status,long retryAfterSeconds){}
 private record Pending(Long verificationId,String address,String code){}
 private record Phase(String status,Pending pending,long retryAfterSeconds){}

 // ---- estado visible ----
 /** Estado de verificación de cada correo vigente, con una sola consulta de las últimas verificaciones. */
 public Map<Long,String> states(Collection<EmailContact> list){
  Map<Long,String> out=new HashMap<>();if(list==null||list.isEmpty())return out;
  Map<Long,EmailVerification> latest=new HashMap<>();
  var ids=list.stream().filter(x->!x.isVerificado()).map(EmailContact::getId).toList();
  if(!ids.isEmpty())for(EmailVerification v:verifications.findLatestByEmailIds(ids))latest.put(v.getEmail().getId(),v);
  LocalDateTime now=now();
  for(EmailContact e:list)out.put(e.getId(),e.isVerificado()?VERIFIED:stateOf(latest.get(e.getId()),now));
  return out;
 }
 public String stateOf(EmailContact e){return states(java.util.List.of(e)).get(e.getId());}
 private String stateOf(EmailVerification v,LocalDateTime now){
  if(v==null)return UNVERIFIED;
  if(v.isAbierta())return now.isBefore(v.getVenceEn())&&v.getEnviadaEn()!=null?PENDING:(now.isBefore(v.getVenceEn())?UNVERIFIED:EXPIRED);
  return EmailVerification.EXPIRED.equals(v.getMotivoInvalidacion())||EmailVerification.EXHAUSTED.equals(v.getMotivoInvalidacion())?EXPIRED:UNVERIFIED;
 }

 // ---- emisión (alta, solicitud y reenvío) ----
 /** Emite y envía un código al correo del propio usuario. No es transaccional: el envío SMTP ocurre fuera de toda transacción de base de datos. */
 public Issued issue(Long userId,Long emailId,boolean resendOperation){
  Phase phase=tx.execute(s->prepare(userId,emailId,resendOperation));
  if(!"OK".equals(phase.status()))return new Issued(phase.status(),phase.retryAfterSeconds());
  Pending p=phase.pending();String result=SENT;
  try{
   mail.send(p.address(),"Código para verificar su correo — Vuelos Sanitarios",body(p.code()));
  }catch(RuntimeException e){result=FAILED;log.warn("Verificación {}: el envío falló ({})",p.verificationId(),e.getClass().getSimpleName());}
  String finalResult=result;
  tx.executeWithoutResult(s->settle(userId,emailId,p.verificationId(),finalResult));
  return new Issued(result,0);
 }

 private Phase prepare(Long userId,Long emailId,boolean resend){
  User u=users.findWithPersonById(userId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));
  persons.lockById(u.getPerson().getId());
  EmailContact e=emails.findActiveByIdAndPersonId(emailId,u.getPerson().getId()).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Correo inexistente"));
  if(e.isVerificado())throw new ApiException(HttpStatus.CONFLICT,"EMAIL_ALREADY_VERIFIED","Este correo ya está verificado",Map.of());
  if(!mail.configured())return new Phase(NOT_CONFIGURED,null,0);
  LocalDateTime now=now();
  long wait=verifications.lastIssuedAt(emailId).map(last->Math.max(0,resendSeconds-Duration.between(last,now).getSeconds())).orElse(0L);
  boolean limited=wait>0||verifications.countIssuedSince(emailId,now.minusHours(24))>=maxPerEmail||verifications.countIssuedByUserSince(userId,now.minusHours(24))>=maxPerUser;
  if(limited){
   audit.record(null,u,"PERSON_EMAIL",emailId,"VERIFY_RATE_LIMITED",null,json("valor",ContactNormalizer.maskEmail(e.getDireccion())));
   return new Phase(RATE_LIMITED,null,wait>0?wait:resendSeconds);
  }
  boolean replaced=false;
  EmailVerification open=verifications.findOpenByEmailId(emailId).orElse(null);
  if(open!=null){open.invalidar(now,EmailVerification.REPLACED);verifications.saveAndFlush(open);replaced=true;}
  String code=newCode();
  EmailVerification v=new EmailVerification();v.setEmail(e);v.setSolicitante(u);v.setDireccionNormalizada(e.getDireccionNormalizada());v.setCodigoHash(hash(emailId,e.getDireccionNormalizada(),code));v.setCreadaEn(now);v.setVenceEn(now.plusMinutes(codeMinutes));
  v=verifications.saveAndFlush(v);
  audit.record(null,u,"PERSON_EMAIL",emailId,(resend||replaced)?"VERIFY_RESEND":"VERIFY_REQUEST",null,json("valor",ContactNormalizer.maskEmail(e.getDireccion())));
  return new Phase("OK",new Pending(v.getId(),e.getDireccion(),code),0);
 }

 /** Registra el resultado del envío: aceptado por el servidor SMTP, o código invalidado si falló (para que no quede un código que nadie recibió). */
 private void settle(Long userId,Long emailId,Long verificationId,String result){
  EmailVerification v=verifications.findById(verificationId).orElse(null);if(v==null||!v.isAbierta())return;
  LocalDateTime now=now();
  if(SENT.equals(result)){v.setEnviadaEn(now);verifications.saveAndFlush(v);return;}
  v.invalidar(now,EmailVerification.SEND_FAILED);verifications.saveAndFlush(v);
  User u=users.findById(userId).orElseThrow();
  audit.record(null,u,"PERSON_EMAIL",emailId,"VERIFY_SEND_FAILED",null,json("valor",ContactNormalizer.maskEmail(v.getEmail().getDireccion())));
 }

 // ---- confirmación ----
 private record Confirmation(String status,int remaining){}
 public static final String OK="OK",WRONG="WRONG",EXPIRED_CODE="EXPIRED",LOCKED="LOCKED",NO_CODE="NO_CODE";

 /** Confirma el código recibido por correo; marca el correo como verificado. Lanza {@link ApiException} (ya fuera de la transacción) si no corresponde. */
 public void confirm(Long userId,Long emailId,String rawCode){
  Confirmation result=tx.execute(s->confirmInTransaction(userId,emailId,rawCode));
  switch(result.status()){
   case OK->{return;}
   case WRONG->throw new ApiException(HttpStatus.BAD_REQUEST,"VERIFICATION_CODE_INVALID","El código no es correcto. Intentos restantes: "+result.remaining(),Map.of("intentosRestantes",result.remaining()));
   case EXPIRED_CODE->throw new ApiException(HttpStatus.CONFLICT,"VERIFICATION_EXPIRED","El código venció. Solicite uno nuevo.",Map.of());
   case LOCKED->throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"VERIFICATION_LOCKED","Se agotaron los intentos con ese código. Solicite uno nuevo.",Map.of());
   default->throw new ApiException(HttpStatus.CONFLICT,"VERIFICATION_NOT_REQUESTED","No hay un código vigente para este correo. Solicite uno nuevo.",Map.of());
  }
 }

 private Confirmation confirmInTransaction(Long userId,Long emailId,String rawCode){
  User u=users.findWithPersonById(userId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));
  persons.lockById(u.getPerson().getId());
  EmailContact e=emails.findActiveByIdAndPersonId(emailId,u.getPerson().getId()).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Correo inexistente"));
  if(e.isVerificado())throw new ApiException(HttpStatus.CONFLICT,"EMAIL_ALREADY_VERIFIED","Este correo ya está verificado",Map.of());
  LocalDateTime now=now();
  EmailVerification v=verifications.findOpenByEmailId(emailId).orElse(null);
  if(v==null)return new Confirmation(NO_CODE,0);
  if(!v.getDireccionNormalizada().equals(e.getDireccionNormalizada())){v.invalidar(now,EmailVerification.ADDRESS_CHANGED);verifications.saveAndFlush(v);return new Confirmation(NO_CODE,0);}
  String masked=ContactNormalizer.maskEmail(e.getDireccion());
  if(!now.isBefore(v.getVenceEn())){v.invalidar(now,EmailVerification.EXPIRED);verifications.saveAndFlush(v);audit.record(null,u,"PERSON_EMAIL",emailId,"VERIFY_EXPIRED",null,json("valor",masked));return new Confirmation(EXPIRED_CODE,0);}
  if(v.getIntentosFallidos()>=maxAttempts){v.invalidar(now,EmailVerification.EXHAUSTED);verifications.saveAndFlush(v);return new Confirmation(LOCKED,0);}
  String candidate=normalizeCode(rawCode);
  boolean match=candidate.length()==CODE_LENGTH&&MessageDigest.isEqual(hash(emailId,e.getDireccionNormalizada(),candidate).getBytes(StandardCharsets.US_ASCII),v.getCodigoHash().getBytes(StandardCharsets.US_ASCII));
  if(!match){
   v.registrarIntentoFallido();
   if(v.getIntentosFallidos()>=maxAttempts){v.invalidar(now,EmailVerification.EXHAUSTED);verifications.saveAndFlush(v);audit.record(null,u,"PERSON_EMAIL",emailId,"VERIFY_LOCKED",null,json("valor",masked));return new Confirmation(LOCKED,0);}
   verifications.saveAndFlush(v);
   return new Confirmation(WRONG,maxAttempts-v.getIntentosFallidos());
  }
  v.setUsadaEn(now);verifications.saveAndFlush(v);
  e.setFechaVerificacion(now);emails.saveAndFlush(e);
  audit.record(null,u,"PERSON_EMAIL",emailId,"VERIFY_CONFIRM",json("verificacion",UNVERIFIED),json("valor",masked,"verificacion",VERIFIED));
  return new Confirmation(OK,0);
 }

 // ---- invalidaciones por cambios del correo (se llaman dentro de la transacción de PersonContactService) ----
 /** Invalida el código abierto del correo (cambió la dirección o se retiró). */
 public void invalidateOpen(Long emailId,String reason){
  verifications.findOpenByEmailId(emailId).ifPresent(v->{v.invalidar(now(),reason);verifications.saveAndFlush(v);});
 }

 // ---- apoyo ----
 private LocalDateTime now(){return LocalDateTime.now(clock);}
 static String normalizeCode(String raw){return raw==null?"":raw.replaceAll("[\\s-]","").toUpperCase(Locale.ROOT);}
 private String newCode(){StringBuilder b=new StringBuilder(CODE_LENGTH);for(int i=0;i<CODE_LENGTH;i++)b.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));return b.toString();}
 private String hash(Long emailId,String address,String code){return HexFormat.of().formatHex(hmac(key,(emailId+":"+address+":"+code).getBytes(StandardCharsets.UTF_8)));}
 private static byte[] hmac(byte[] k,byte[] message){try{Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(k,"HmacSHA256"));return mac.doFinal(message);}catch(GeneralSecurityException ex){throw new IllegalStateException(ex);}}
 private String body(String code){
  String shown=code.substring(0,4)+"-"+code.substring(4);
  return "Su código para verificar este correo en Vuelos Sanitarios es:\n\n    "+shown+"\n\nVence en "+codeMinutes+" minutos y sólo puede usarse una vez. Ingréselo en \"Mi cuenta\""+(publicUrl.isEmpty()?"":" ("+publicUrl+")")+
   ".\n\nSi usted no lo solicitó, ignore este mensaje: el correo no se verificará sin este código.";
 }
 private String json(Object... pairs){Map<String,Object> m=new LinkedHashMap<>();for(int i=0;i<pairs.length;i+=2)m.put(String.valueOf(pairs[i]),pairs[i+1]);try{return JSON.writeValueAsString(m);}catch(JsonProcessingException e){throw new IllegalStateException(e);}}
}
