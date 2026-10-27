-- V57: unicidad de la licencia aeronáutica del comandante (I-5.4, perfiles_comandante).
-- V12 creó el índice único sobre la licencia normalizada (mayúsculas, sin espacios laterales), pero la reconstrucción de tablas de V24/V27 no lo
-- conservó: desde entonces la unicidad dependía sólo de una consulta previa en AuthService, que dos altas simultáneas con la misma licencia podían
-- superar ambas. Esta migración restablece la garantía en la base. No modifica datos: si existieran licencias duplicadas, se detiene con un mensaje
-- para que se resuelvan manualmente (no se elige cuál conservar ni se altera ningún perfil).
IF EXISTS (SELECT 1 FROM dbo.perfiles_comandante GROUP BY numero_licencia_normalizada HAVING COUNT(*) > 1)
    THROW 51057, N'V57: existen licencias aeronáuticas duplicadas en perfiles_comandante; resuélvalas manualmente antes de migrar (SELECT numero_licencia_normalizada, COUNT(*) FROM dbo.perfiles_comandante GROUP BY numero_licencia_normalizada HAVING COUNT(*) > 1).', 1;
GO
CREATE UNIQUE INDEX uq_perfiles_comandante_numero_licencia ON dbo.perfiles_comandante (numero_licencia_normalizada);
GO
