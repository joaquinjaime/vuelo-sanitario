package com.vuelossanitarios.backend.domain.user;

import jakarta.persistence.Column;
import jakarta.persistence.Id;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Tabla intermedia N:M entre User y Role. Se modela como entidad propia
 * (en vez de un @ManyToMany simple) porque guarda una columna extra
 * (assigned_at).
 */
@Entity
@Table(name = "usuarios_roles")
public class UserRole {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_usuarios_roles")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "id_usuarios", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "id_roles", nullable = false)
    private Role role;

    @CreationTimestamp
@Column(name = "fecha_asignacion", nullable = false, updatable = false)
    private LocalDateTime assignedAt;

    public UserRole() {
    }

    public UserRole(User user, Role role) {
        this.user = user;
        this.role = role;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }

    public LocalDateTime getAssignedAt() { return assignedAt; }
    public void setAssignedAt(LocalDateTime assignedAt) { this.assignedAt = assignedAt; }
}
