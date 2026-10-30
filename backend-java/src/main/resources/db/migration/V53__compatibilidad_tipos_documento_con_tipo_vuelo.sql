-- V53: compatibilidad entre tipos documentales y tipos de vuelo.
-- Un parte médico describe a un paciente: sólo tiene sentido en un vuelo sanitario (con extensión vuelos_sanitarios). Los demás
-- tipos (autorización, plan de vuelo, otro) son de uso operativo general y se admiten en ambos. El atributo pertenece al tipo, de
-- modo que el catálogo es la única fuente de la regla y un tipo nuevo nace sin restricción hasta que se defina su finalidad.
-- Los documentos históricos no se reclasifican ni se modifican (las bases conocidas no tienen combinaciones incompatibles).
ALTER TABLE dbo.tipos_documento ADD
    solo_vuelo_sanitario BIT NOT NULL CONSTRAINT df_tipos_documento_solo_vuelo_sanitario DEFAULT 0;
GO

UPDATE dbo.tipos_documento SET solo_vuelo_sanitario = 1 WHERE codigo_tipo_documento = N'PARTE_MEDICO';
GO
