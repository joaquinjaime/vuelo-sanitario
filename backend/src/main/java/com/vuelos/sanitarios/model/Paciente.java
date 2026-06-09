package com.vuelos.sanitarios.model;

import jakarta.persistence.*;

@Entity
@Table(name = "paciente")
public class Paciente {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_paciente")
    private Integer idPaciente;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_persona", nullable = false)
    private Persona persona;

    @Column(columnDefinition = "TEXT")
    private String diagnostico;

    @Column(name = "condicion_medica", columnDefinition = "TEXT")
    private String condicionMedica;

    @Column(name = "requerimientos_especiales", columnDefinition = "TEXT")
    private String requerimientosEspeciales;

    public Paciente() {}

    public Paciente(Integer idPaciente, Persona persona, String diagnostico, String condicionMedica, String requerimientosEspeciales) {
        this.idPaciente = idPaciente;
        this.persona = persona;
        this.diagnostico = diagnostico;
        this.condicionMedica = condicionMedica;
        this.requerimientosEspeciales = requerimientosEspeciales;
    }

    public Integer getIdPaciente() { return idPaciente; }
    public void setIdPaciente(Integer idPaciente) { this.idPaciente = idPaciente; }
    public Persona getPersona() { return persona; }
    public void setPersona(Persona persona) { this.persona = persona; }
    public String getDiagnostico() { return diagnostico; }
    public void setDiagnostico(String diagnostico) { this.diagnostico = diagnostico; }
    public String getCondicionMedica() { return condicionMedica; }
    public void setCondicionMedica(String condicionMedica) { this.condicionMedica = condicionMedica; }
    public String getRequerimientosEspeciales() { return requerimientosEspeciales; }
    public void setRequerimientosEspeciales(String requerimientosEspeciales) { this.requerimientosEspeciales = requerimientosEspeciales; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idPaciente;
        private Persona persona;
        private String diagnostico;
        private String condicionMedica;
        private String requerimientosEspeciales;

        public Builder idPaciente(Integer idPaciente) { this.idPaciente = idPaciente; return this; }
        public Builder persona(Persona persona) { this.persona = persona; return this; }
        public Builder diagnostico(String diagnostico) { this.diagnostico = diagnostico; return this; }
        public Builder condicionMedica(String condicionMedica) { this.condicionMedica = condicionMedica; return this; }
        public Builder requerimientosEspeciales(String requerimientosEspeciales) { this.requerimientosEspeciales = requerimientosEspeciales; return this; }

        public Paciente build() {
            return new Paciente(idPaciente, persona, diagnostico, condicionMedica, requerimientosEspeciales);
        }
    }
}
