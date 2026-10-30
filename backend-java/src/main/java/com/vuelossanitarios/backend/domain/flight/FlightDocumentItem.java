package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.catalog.DocumentType;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_documentos_vuelo"))
@Table(name = "documentos_vuelo")
public class FlightDocumentItem extends BaseEntity {
@ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "id_vuelos", nullable = false) private Flight flight;
@ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "id_tipos_documento", nullable = false) private DocumentType documentType;
    /** Denominación estable del documento lógico dentro de la aplicación. */
    @Column(name = "nombre_documento", nullable = false, length = 255) private String nombreDocumento;
    @Column(name = "esta_activo", nullable = false) private Boolean activo = true;
@CreationTimestamp @Column(name = "fecha_creacion", nullable = false, updatable = false) private LocalDateTime createdAt;
    /** Baja lógica (V52): el registro, sus versiones y sus archivos se conservan; la fecha se guarda en UTC como el resto del módulo. */
    @Column(name = "fecha_baja") private LocalDateTime fechaBaja;
@ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_usuario_baja") private com.vuelossanitarios.backend.domain.user.User bajaPor;
    @Column(name = "motivo_baja", length = 500) private String motivoBaja;
    public LocalDateTime getFechaBaja() { return fechaBaja; } public void setFechaBaja(LocalDateTime v) { fechaBaja = v; }
    public com.vuelossanitarios.backend.domain.user.User getBajaPor() { return bajaPor; } public void setBajaPor(com.vuelossanitarios.backend.domain.user.User v) { bajaPor = v; }
    public String getMotivoBaja() { return motivoBaja; } public void setMotivoBaja(String v) { motivoBaja = v; }
    public Flight getFlight() { return flight; } public void setFlight(Flight v) { flight = v; }
    public DocumentType getDocumentType() { return documentType; } public void setDocumentType(DocumentType v) { documentType = v; }
    public String getNombreDocumento() { return nombreDocumento; } public void setNombreDocumento(String v) { nombreDocumento = v; }
    public Boolean getActivo() { return activo; } public void setActivo(Boolean v) { activo = v; }
}
