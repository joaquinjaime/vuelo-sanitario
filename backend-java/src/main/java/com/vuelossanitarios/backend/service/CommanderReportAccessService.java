package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.flight.FinalReportStatus;
import com.vuelossanitarios.backend.repository.FinalReportObligationRepository;
import java.time.*;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
@Service public class CommanderReportAccessService {
 private final FinalReportObligationRepository obligations; private final Clock clock;
 public CommanderReportAccessService(FinalReportObligationRepository o,Clock c){obligations=o;clock=c;}
 public boolean isBlocked(UUID commander){return obligations.existsByCommanderIdAndCurrentTrueAndStatusInAndDueAtLessThanEqual(commander,List.of(FinalReportStatus.PENDIENTE,FinalReportStatus.DEVUELTO),now());}
 public void requireOperationalAccess(UUID commander){if(isBlocked(commander))throw new ApiException(HttpStatus.FORBIDDEN,"FUNCIONES BLOQUEADAS: INFORME FINAL VENCIDO");}
 public OffsetDateTime now(){return OffsetDateTime.ofInstant(Instant.now(clock),ZoneOffset.UTC);}
}
