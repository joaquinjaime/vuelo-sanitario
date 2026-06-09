package com.vuelos.sanitarios.dto.response;

public class AuthResponse {
    private String token;
    private String refreshToken;
    private Integer idUsuario;
    private String username;
    private String nombreCompleto;
    private String rol;
    private String nombreLicencia;

    public AuthResponse() {}

    public AuthResponse(String token, String refreshToken, Integer idUsuario, String username, String nombreCompleto, String rol, String nombreLicencia) {
        this.token = token;
        this.refreshToken = refreshToken;
        this.idUsuario = idUsuario;
        this.username = username;
        this.nombreCompleto = nombreCompleto;
        this.rol = rol;
        this.nombreLicencia = nombreLicencia;
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getRefreshToken() { return refreshToken; }
    public void setRefreshToken(String refreshToken) { this.refreshToken = refreshToken; }
    public Integer getIdUsuario() { return idUsuario; }
    public void setIdUsuario(Integer idUsuario) { this.idUsuario = idUsuario; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getNombreCompleto() { return nombreCompleto; }
    public void setNombreCompleto(String nombreCompleto) { this.nombreCompleto = nombreCompleto; }
    public String getRol() { return rol; }
    public void setRol(String rol) { this.rol = rol; }
    public String getNombreLicencia() { return nombreLicencia; }
    public void setNombreLicencia(String nombreLicencia) { this.nombreLicencia = nombreLicencia; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String token;
        private String refreshToken;
        private Integer idUsuario;
        private String username;
        private String nombreCompleto;
        private String rol;
        private String nombreLicencia;

        public Builder token(String token) { this.token = token; return this; }
        public Builder refreshToken(String refreshToken) { this.refreshToken = refreshToken; return this; }
        public Builder idUsuario(Integer idUsuario) { this.idUsuario = idUsuario; return this; }
        public Builder username(String username) { this.username = username; return this; }
        public Builder nombreCompleto(String nombreCompleto) { this.nombreCompleto = nombreCompleto; return this; }
        public Builder rol(String rol) { this.rol = rol; return this; }
        public Builder nombreLicencia(String nombreLicencia) { this.nombreLicencia = nombreLicencia; return this; }

        public AuthResponse build() {
            return new AuthResponse(token, refreshToken, idUsuario, username, nombreCompleto, rol, nombreLicencia);
        }
    }
}
