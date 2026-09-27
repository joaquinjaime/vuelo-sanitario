package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "informacion_medica_vuelo")
public class FlightMedicalInfo extends BaseEntity {
    @OneToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "vuelo_id", nullable = false, unique = true)
    private Flight flight;
    @Column(name = "diagnostico", columnDefinition = "NVARCHAR(MAX)") private String diagnostico;
    @Column(name = "condicion_medica", length = 100) private String condicionMedica;
    @Column(name = "requiere_equipamiento_especial", nullable = false) private Boolean requiereEquipamientoEspecial = false;
    @Column(name = "observaciones", columnDefinition = "NVARCHAR(MAX)") private String observaciones;
@CreationTimestamp @Column(name = "fecha_creacion", nullable = false, updatable = false) private LocalDateTime createdAt;
@UpdateTimestamp @Column(name = "fecha_actualizacion", nullable = false) private LocalDateTime updatedAt;
    public Flight getFlight() { return flight; } public void setFlight(Flight v) { flight = v; }
    public String getDiagnostico() { return diagnostico; } public void setDiagnostico(String v) { diagnostico = v; }
    public String getCondicionMedica() { return condicionMedica; } public void setCondicionMedica(String v) { condicionMedica = v; }
    public Boolean getRequiereEquipamientoEspecial() { return requiereEquipamientoEspecial; } public void setRequiereEquipamientoEspecial(Boolean v) { requiereEquipamientoEspecial = v; }
    public String getObservaciones() { return observaciones; } public void setObservaciones(String v) { observaciones = v; }
}
