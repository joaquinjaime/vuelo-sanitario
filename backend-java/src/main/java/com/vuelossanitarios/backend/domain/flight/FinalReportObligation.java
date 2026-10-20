package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity @jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_obligaciones_informe_final"))
@Table(name="obligaciones_informe_final")
public class FinalReportObligation extends BaseEntity {
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_vuelos") private Flight flight;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="id_usuario_comandante") private User commander;
 @Column(name="numero_obligacion",nullable=false) private Integer obligationNumber;
 @Enumerated(EnumType.STRING) @Column(name="estado_obligacion",nullable=false,length=20) private FinalReportStatus status;
 @Column(name="vencimiento_original",nullable=false,columnDefinition="DATETIMEOFFSET(3)") private OffsetDateTime originalDueAt;
 @Column(name="vencimiento",nullable=false,columnDefinition="DATETIMEOFFSET(3)") private OffsetDateTime dueAt;
 @Column(name="prorroga_utilizada",nullable=false) private Boolean extensionUsed=false;
 @Column(name="fecha_prorroga",columnDefinition="DATETIMEOFFSET(3)") private OffsetDateTime extendedAt;
 @Column(name="fecha_presentacion",columnDefinition="DATETIMEOFFSET(3)") private OffsetDateTime presentedAt;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_informes_finales_vuelo") private FlightFinalReport report;
 @Column(name="fecha_devolucion",columnDefinition="DATETIMEOFFSET(3)") private OffsetDateTime returnedAt;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_devolvedor") private User returnedBy;
 @Column(name="motivo_devolucion",columnDefinition="NVARCHAR(MAX)") private String returnReason;
 @Column(name="fecha_aprobacion",columnDefinition="DATETIMEOFFSET(3)") private OffsetDateTime approvedAt;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_aprobador") private User approvedBy;
 @Column(name="es_actual",nullable=false) private Boolean current=true;
 /** Usuario de Operaciones que finalizó el vuelo; destinatario principal de los avisos de gestión del cierre. */
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_usuario_finalizador") private User finisher;
 // Hibernate 6.6 no valida ROWVERSION de SQL Server como byte[]; el token se
 // conserva y protege en la base, pero no integra todavia el flujo de update.
 @Transient private byte[] rowVersion;
 public Flight getFlight(){return flight;} public void setFlight(Flight x){flight=x;} public User getCommander(){return commander;} public void setCommander(User x){commander=x;} public Integer getObligationNumber(){return obligationNumber;} public void setObligationNumber(Integer x){obligationNumber=x;} public FinalReportStatus getStatus(){return status;} public void setStatus(FinalReportStatus x){status=x;} public OffsetDateTime getOriginalDueAt(){return originalDueAt;} public void setOriginalDueAt(OffsetDateTime x){originalDueAt=x;} public OffsetDateTime getDueAt(){return dueAt;} public void setDueAt(OffsetDateTime x){dueAt=x;} public Boolean getExtensionUsed(){return extensionUsed;} public void setExtensionUsed(Boolean x){extensionUsed=x;} public OffsetDateTime getExtendedAt(){return extendedAt;} public void setExtendedAt(OffsetDateTime x){extendedAt=x;} public OffsetDateTime getPresentedAt(){return presentedAt;} public void setPresentedAt(OffsetDateTime x){presentedAt=x;} public FlightFinalReport getReport(){return report;} public void setReport(FlightFinalReport x){report=x;} public OffsetDateTime getReturnedAt(){return returnedAt;} public void setReturnedAt(OffsetDateTime x){returnedAt=x;} public User getReturnedBy(){return returnedBy;} public void setReturnedBy(User x){returnedBy=x;} public String getReturnReason(){return returnReason;} public void setReturnReason(String x){returnReason=x;} public OffsetDateTime getApprovedAt(){return approvedAt;} public void setApprovedAt(OffsetDateTime x){approvedAt=x;} public User getApprovedBy(){return approvedBy;} public void setApprovedBy(User x){approvedBy=x;} public User getFinisher(){return finisher;} public void setFinisher(User x){finisher=x;} public Boolean getCurrent(){return current;} public void setCurrent(Boolean x){current=x;}
}
