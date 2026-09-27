-- Cubre FinalReportObligationRepository.findByCommanderIdAndCurrentTrueOrderByDueAtAsc.
-- El plan real previo a esta migración hacía un escaneo clustered y Sort porque
-- el índice existente empieza por estado, columna que esta consulta no filtra.
CREATE INDEX ix_obligaciones_informe_final_comandante_actual_vencimiento
    ON dbo.obligaciones_informe_final (comandante_usuario_id, es_actual, vencimiento);
GO
