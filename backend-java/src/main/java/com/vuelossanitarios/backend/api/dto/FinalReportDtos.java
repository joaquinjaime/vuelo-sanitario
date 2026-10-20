package com.vuelossanitarios.backend.api.dto;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
public final class FinalReportDtos { private FinalReportDtos(){}
 public record Submit(@Size(max=10000) String texto,@DecimalMin("0.0") @DecimalMax("999.99") BigDecimal horasVuelo,@DecimalMin("0.0") @DecimalMax("99999999.99") BigDecimal combustibleConsumidoLitros,@Size(max=10000) String incidentes){}
 public record Review(@NotNull Boolean aprobar,@Size(max=10000) String motivoDevolucion){}
 /** Vista de una obligación. `vencida` y `segundosRestantes` los calcula siempre el servidor con su reloj. */
 public record ObligationView(Long id,Long flightId,String flightCode,String status,OffsetDateTime vencimiento,OffsetDateTime vencimientoOriginal,boolean prorrogaUsada,OffsetDateTime presentadoEn,String motivoDevolucion,boolean bloqueado,
   String estadoVuelo,String tipoVuelo,Long comandanteId,String comandante,boolean vencida,Long segundosRestantes,int versiones,OffsetDateTime aprobadoEn){}
 /** Adjunto PDF de una versión; la descarga es autenticada y nunca expone la ubicación de almacenamiento. */
 public record AttachmentView(String nombre,long tamanioBytes,String sha256,String urlDescarga){}
 /** formato: TEXTO, PDF o TEXTO_Y_PDF. origenDecision distingue decisiones del flujo actual de datos históricos. */
 public record ReportVersionView(Long id,int version,boolean vigente,String estado,String origenDecision,String formato,BigDecimal horasVuelo,BigDecimal combustibleConsumidoLitros,String incidentes,String texto,AttachmentView adjunto,String presentadoPor,LocalDateTime presentadoEn,String motivoDevolucion,OffsetDateTime revisadoEn,String revisor){}
 public record ObligationDetail(ObligationView obligacion,List<ReportVersionView> versiones){}
 /** Estado administrativo del cierre de un vuelo, distinto de su estado operativo. */
 public record ClosureView(Long obligacionId,String estadoAdministrativo,String estadoInforme,OffsetDateTime vencimiento,boolean vencida,boolean comandanteBloqueado,int versiones,OffsetDateTime aprobadoEn,LocalDateTime salidaReal,LocalDateTime llegadaReal){}
}
