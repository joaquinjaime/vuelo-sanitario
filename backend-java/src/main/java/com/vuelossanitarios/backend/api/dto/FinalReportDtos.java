package com.vuelossanitarios.backend.api.dto;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
public final class FinalReportDtos { private FinalReportDtos(){}
 public record Submit(@Size(max=10000) String texto,@DecimalMin("0.0") BigDecimal horasVuelo,@DecimalMin("0.0") BigDecimal combustibleConsumidoLitros,@Size(max=10000) String incidentes){}
 public record Review(@NotNull Boolean aprobar,@Size(max=10000) String motivoDevolucion){}
 public record ObligationView(UUID id,UUID flightId,String flightCode,String status,OffsetDateTime vencimiento,OffsetDateTime vencimientoOriginal,boolean prorrogaUsada,OffsetDateTime presentadoEn,String motivoDevolucion,boolean bloqueado){}
}
