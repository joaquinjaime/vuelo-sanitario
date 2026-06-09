package com.vuelos.sanitarios.enums;

public enum EstadoVuelo {
    PLANEAMIENTO,
    VIGENTE,
    EN_EJECUCION,
    FINALIZADO,
    CANCELADO;

    public boolean puedeTransicionarA(EstadoVuelo nuevo) {
        return switch (this) {
            case PLANEAMIENTO  -> nuevo == VIGENTE    || nuevo == CANCELADO;
            case VIGENTE       -> nuevo == EN_EJECUCION || nuevo == CANCELADO;
            case EN_EJECUCION  -> nuevo == FINALIZADO;
            default            -> false;
        };
    }
}
