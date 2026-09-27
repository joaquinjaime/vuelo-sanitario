package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.catalog.DocumentType;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "documentos_vuelo")
public class FlightDocumentItem extends BaseEntity {
@ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "vuelo_id", nullable = false) private Flight flight;
@ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "tipo_documento_id", nullable = false) private DocumentType documentType;
    @Enumerated(EnumType.STRING) @Column(name = "modalidad", nullable = false, length = 10) private DocumentModality modalidad;
    @Column(name = "titulo", nullable = false, length = 255) private String titulo;
    @Column(name = "activo", nullable = false) private Boolean activo = true;
@CreationTimestamp @Column(name = "fecha_creacion", nullable = false, updatable = false) private LocalDateTime createdAt;
    public Flight getFlight() { return flight; } public void setFlight(Flight v) { flight = v; }
    public DocumentType getDocumentType() { return documentType; } public void setDocumentType(DocumentType v) { documentType = v; }
    public DocumentModality getModalidad() { return modalidad; } public void setModalidad(DocumentModality v) { modalidad = v; }
    public String getTitulo() { return titulo; } public void setTitulo(String v) { titulo = v; }
    public Boolean getActivo() { return activo; } public void setActivo(Boolean v) { activo = v; }
}
