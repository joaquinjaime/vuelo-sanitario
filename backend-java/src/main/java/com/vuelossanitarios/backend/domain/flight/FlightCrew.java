package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Participación de una persona en un vuelo. La asignación vigente tiene {@code fechaBaja == null}; retirar o reemplazar
 * a un tripulante registra la baja (quién, cuándo y por qué) y conserva la fila como historial. La unicidad de la
 * asignación vigente por vuelo y usuario la garantiza el índice filtrado de V45.
 */
@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_vuelos_tripulantes"))
@Table(name = "vuelos_tripulantes")
public class FlightCrew extends BaseEntity {

    public static final String BAJA_RETIRO = "RETIRO";
    public static final String BAJA_REEMPLAZO = "REEMPLAZO";
    public static final String BAJA_CAMBIO_COMANDANTE = "CAMBIO_COMANDANTE";

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "id_vuelos", nullable = false)
    private Flight flight;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "id_usuarios", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "id_roles_tripulacion", nullable = false)
    private CrewRole crewRole;

    @ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "id_usuario_asignador")
    private User asignadoPor;

    @CreationTimestamp
@Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "fecha_baja")
    private LocalDateTime fechaBaja;

    @ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "id_usuario_baja")
    private User bajaPor;

    @Column(name = "motivo_baja", length = 30)
    private String motivoBaja;

    public FlightCrew() {
    }

    public Flight getFlight() { return flight; }
    public void setFlight(Flight flight) { this.flight = flight; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public CrewRole getCrewRole() { return crewRole; }
    public void setCrewRole(CrewRole crewRole) { this.crewRole = crewRole; }

    public User getAsignadoPor() { return asignadoPor; }
    public void setAsignadoPor(User asignadoPor) { this.asignadoPor = asignadoPor; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getFechaBaja() { return fechaBaja; }
    public User getBajaPor() { return bajaPor; }
    public String getMotivoBaja() { return motivoBaja; }
    public boolean isVigente() { return fechaBaja == null; }

    /** Libera el recurso sin borrar la participación histórica. */
    public void darDeBaja(LocalDateTime when, User actor, String reason) {
        this.fechaBaja = when;
        this.bajaPor = actor;
        this.motivoBaja = reason;
    }
}
