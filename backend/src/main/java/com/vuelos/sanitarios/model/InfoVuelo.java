package com.vuelos.sanitarios.model;

import com.vuelos.sanitarios.enums.TipoInfoVuelo;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "info_vuelo")
public class InfoVuelo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_formulario")
    private Integer idFormulario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_vuelo", nullable = false)
    private Vuelo vuelo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_usuario", nullable = false)
    private Usuario usuario;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TipoInfoVuelo tipo;

    @Column(columnDefinition = "TEXT")
    private String contenido;

    @Column(columnDefinition = "BYTEA")
    private byte[] pdf;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public InfoVuelo() {}

    public InfoVuelo(Integer idFormulario, Vuelo vuelo, Usuario usuario, TipoInfoVuelo tipo, String contenido, byte[] pdf, LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.idFormulario = idFormulario;
        this.vuelo = vuelo;
        this.usuario = usuario;
        this.tipo = tipo;
        this.contenido = contenido;
        this.pdf = pdf;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public Integer getIdFormulario() { return idFormulario; }
    public void setIdFormulario(Integer idFormulario) { this.idFormulario = idFormulario; }
    public Vuelo getVuelo() { return vuelo; }
    public void setVuelo(Vuelo vuelo) { this.vuelo = vuelo; }
    public Usuario getUsuario() { return usuario; }
    public void setUsuario(Usuario usuario) { this.usuario = usuario; }
    public TipoInfoVuelo getTipo() { return tipo; }
    public void setTipo(TipoInfoVuelo tipo) { this.tipo = tipo; }
    public String getContenido() { return contenido; }
    public void setContenido(String contenido) { this.contenido = contenido; }
    public byte[] getPdf() { return pdf; }
    public void setPdf(byte[] pdf) { this.pdf = pdf; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idFormulario;
        private Vuelo vuelo;
        private Usuario usuario;
        private TipoInfoVuelo tipo;
        private String contenido;
        private byte[] pdf;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public Builder idFormulario(Integer idFormulario) { this.idFormulario = idFormulario; return this; }
        public Builder vuelo(Vuelo vuelo) { this.vuelo = vuelo; return this; }
        public Builder usuario(Usuario usuario) { this.usuario = usuario; return this; }
        public Builder tipo(TipoInfoVuelo tipo) { this.tipo = tipo; return this; }
        public Builder contenido(String contenido) { this.contenido = contenido; return this; }
        public Builder pdf(byte[] pdf) { this.pdf = pdf; return this; }
        public Builder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }
        public Builder updatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; return this; }

        public InfoVuelo build() {
            return new InfoVuelo(idFormulario, vuelo, usuario, tipo, contenido, pdf, createdAt, updatedAt);
        }
    }
}
