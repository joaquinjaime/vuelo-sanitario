package com.vuelos.sanitarios.model;

import jakarta.persistence.*;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

@Entity
@Table(name = "usuario")
public class Usuario implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_usuario")
    private Integer idUsuario;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "id_persona", nullable = false)
    private Persona persona;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "id_rol", nullable = false)
    private Rol rol;

    @Column(nullable = false, unique = true, length = 50)
    private String username;

    @Column(name = "password_hash", nullable = false)
    private String password;

    @Column(name = "nombre_licencia", length = 50)
    private String nombreLicencia;

    @Column(name = "fecha_alta")
    private LocalDate fechaAlta;

    @Column(name = "activo_sistema")
    private Boolean activoSistema;

    public Usuario() {}

    public Usuario(Integer idUsuario, Persona persona, Rol rol, String username, String password, String nombreLicencia, LocalDate fechaAlta, Boolean activoSistema) {
        this.idUsuario = idUsuario;
        this.persona = persona;
        this.rol = rol;
        this.username = username;
        this.password = password;
        this.nombreLicencia = nombreLicencia;
        this.fechaAlta = fechaAlta;
        this.activoSistema = activoSistema;
    }

    public Integer getIdUsuario() { return idUsuario; }
    public void setIdUsuario(Integer idUsuario) { this.idUsuario = idUsuario; }
    public Persona getPersona() { return persona; }
    public void setPersona(Persona persona) { this.persona = persona; }
    public Rol getRol() { return rol; }
    public void setRol(Rol rol) { this.rol = rol; }
    @Override public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    @Override public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public String getNombreLicencia() { return nombreLicencia; }
    public void setNombreLicencia(String nombreLicencia) { this.nombreLicencia = nombreLicencia; }
    public LocalDate getFechaAlta() { return fechaAlta; }
    public void setFechaAlta(LocalDate fechaAlta) { this.fechaAlta = fechaAlta; }
    public Boolean getActivoSistema() { return activoSistema; }
    public void setActivoSistema(Boolean activoSistema) { this.activoSistema = activoSistema; }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + rol.getNombreRol().name()));
    }

    @Override public boolean isAccountNonExpired()     { return true; }
    @Override public boolean isAccountNonLocked()      { return true; }
    @Override public boolean isCredentialsNonExpired() { return true; }
    @Override public boolean isEnabled()               { return Boolean.TRUE.equals(activoSistema); }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idUsuario;
        private Persona persona;
        private Rol rol;
        private String username;
        private String password;
        private String nombreLicencia;
        private LocalDate fechaAlta;
        private Boolean activoSistema;

        public Builder idUsuario(Integer idUsuario) { this.idUsuario = idUsuario; return this; }
        public Builder persona(Persona persona) { this.persona = persona; return this; }
        public Builder rol(Rol rol) { this.rol = rol; return this; }
        public Builder username(String username) { this.username = username; return this; }
        public Builder password(String password) { this.password = password; return this; }
        public Builder nombreLicencia(String nombreLicencia) { this.nombreLicencia = nombreLicencia; return this; }
        public Builder fechaAlta(LocalDate fechaAlta) { this.fechaAlta = fechaAlta; return this; }
        public Builder activoSistema(Boolean activoSistema) { this.activoSistema = activoSistema; return this; }

        public Usuario build() {
            return new Usuario(idUsuario, persona, rol, username, password, nombreLicencia, fechaAlta, activoSistema);
        }
    }
}
