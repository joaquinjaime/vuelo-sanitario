package com.vuelossanitarios.backend.domain.user;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity @Table(name = "activaciones_cuenta")
public class AccountActivation extends BaseEntity {
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="usuario_id",nullable=false) private User user;
 @Column(name="token_hash",nullable=false,length=255) private String tokenHash;
 @Column(name="fecha_creacion",nullable=false) private LocalDateTime createdAt;
 @Column(name="fecha_expiracion",nullable=false) private LocalDateTime expiresAt;
 @Column(name="fecha_utilizacion") private LocalDateTime usedAt;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="administrador_creador_id") private User createdBy;
 public User getUser(){return user;} public void setUser(User v){user=v;} public String getTokenHash(){return tokenHash;} public void setTokenHash(String v){tokenHash=v;}
 public LocalDateTime getCreatedAt(){return createdAt;} public void setCreatedAt(LocalDateTime v){createdAt=v;} public LocalDateTime getExpiresAt(){return expiresAt;} public void setExpiresAt(LocalDateTime v){expiresAt=v;}
 public LocalDateTime getUsedAt(){return usedAt;} public void setUsedAt(LocalDateTime v){usedAt=v;} public User getCreatedBy(){return createdBy;} public void setCreatedBy(User v){createdBy=v;}
}
