package com.vuelossanitarios.backend.domain.flight;
/**
 * Decisión sobre una versión de informe. REEMPLAZADO e HISTORICO_SIN_DECISION sólo existen en versiones anteriores a V42
 * cuya decisión no se puede demostrar; nunca equivalen a una aprobación o devolución.
 */
public enum ReportReviewStatus { PRESENTADO, DEVUELTO, APROBADO, REEMPLAZADO, HISTORICO_SIN_DECISION }
