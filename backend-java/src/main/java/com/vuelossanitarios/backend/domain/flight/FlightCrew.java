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
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_vuelos_tripulantes"))
@Table(name = "vuelos_tripulantes", uniqueConstraints = {
        @UniqueConstraint(name = "uq_flight_crew", columnNames = {"id_vuelos", "id_usuarios", "id_roles_tripulacion"})
})
public class FlightCrew extends BaseEntity {

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
}
