package com.vuelossanitarios.backend.domain.person;

import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Solicitud de verificación de un correo: un código de un solo uso enviado a la dirección. Sólo se guarda su HMAC; abierta mientras
 * no se haya usado ni invalidado (a lo sumo una por correo). Confirmar el código marca {@code fecha_verificacion} del correo.
 */
@Entity @Table(name = "verificaciones_correo")
public class EmailVerification {
    public static final String REPLACED = "REEMPLAZADO", EXPIRED = "VENCIDO", EXHAUSTED = "AGOTADO", ADDRESS_CHANGED = "CORREO_MODIFICADO",
        ADDRESS_REMOVED = "CORREO_RETIRADO", SEND_FAILED = "ENVIO_FALLIDO", VERIFIED_ELSEWHERE = "CORREO_VERIFICADO";

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "id_verificaciones_correo") private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "id_correos_electronicos") private EmailContact email;
    @Column(name = "direccion_normalizada", nullable = false, length = 150) private String direccionNormalizada;
    @Column(name = "codigo_hash", nullable = false, length = 64) private String codigoHash;
    /** Huella HMAC del origen de red directo; permite limitar abuso sin persistir una IP en claro. */
    @Column(name = "origen_huella", nullable = false, length = 64) private String origenHuella;
    @Column(name = "intentos_fallidos", nullable = false) private Byte intentosFallidos = 0;
    @Column(name = "fecha_creacion", nullable = false) private LocalDateTime creadaEn;
    @Column(name = "fecha_vencimiento", nullable = false) private LocalDateTime venceEn;
    @Column(name = "fecha_envio") private LocalDateTime enviadaEn;
    @Column(name = "fecha_uso") private LocalDateTime usadaEn;
    @Column(name = "fecha_invalidacion") private LocalDateTime invalidadaEn;
    @Column(name = "motivo_invalidacion", length = 30) private String motivoInvalidacion;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "id_usuario_solicitante") private User solicitante;

    public Long getId() { return id; }
    public EmailContact getEmail() { return email; } public void setEmail(EmailContact v) { email = v; }
    public String getDireccionNormalizada() { return direccionNormalizada; } public void setDireccionNormalizada(String v) { direccionNormalizada = v; }
    public String getCodigoHash() { return codigoHash; } public void setCodigoHash(String v) { codigoHash = v; }
    public String getOrigenHuella() { return origenHuella; } public void setOrigenHuella(String v) { origenHuella = v; }
    public int getIntentosFallidos() { return intentosFallidos; } public void registrarIntentoFallido() { intentosFallidos = (byte) (intentosFallidos + 1); }
    public LocalDateTime getCreadaEn() { return creadaEn; } public void setCreadaEn(LocalDateTime v) { creadaEn = v; }
    public LocalDateTime getVenceEn() { return venceEn; } public void setVenceEn(LocalDateTime v) { venceEn = v; }
    public LocalDateTime getEnviadaEn() { return enviadaEn; } public void setEnviadaEn(LocalDateTime v) { enviadaEn = v; }
    public LocalDateTime getUsadaEn() { return usadaEn; } public void setUsadaEn(LocalDateTime v) { usadaEn = v; }
    public LocalDateTime getInvalidadaEn() { return invalidadaEn; } public String getMotivoInvalidacion() { return motivoInvalidacion; }
    public User getSolicitante() { return solicitante; } public void setSolicitante(User v) { solicitante = v; }
    public boolean isAbierta() { return usadaEn == null && invalidadaEn == null; }
    public void invalidar(LocalDateTime when, String reason) { invalidadaEn = when; motivoInvalidacion = reason; }
}
