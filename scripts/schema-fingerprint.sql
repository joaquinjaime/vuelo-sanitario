-- Read-only canonical schema metadata for comparing a live database to a restore.
-- Use sqlcmd -h -1 -W -s "|"; hash the ordered output, not individual business rows.
SET NOCOUNT ON;
SELECT N'DATABASE', collation_name, compatibility_level
FROM sys.databases WHERE database_id=DB_ID();

SELECT N'COLUMN',s.name,t.name,c.column_id,c.name,TYPE_NAME(c.user_type_id),
       c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.is_computed,
       COALESCE(c.collation_name,N''),
       CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),COALESCE(dc.definition,N''))),2)
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.columns c ON c.object_id=t.object_id
LEFT JOIN sys.default_constraints dc ON dc.object_id=c.default_object_id
WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,c.column_id;

SELECT N'INDEX',s.name,t.name,i.name,i.type_desc,i.is_unique,i.is_primary_key,
       i.is_unique_constraint,i.is_disabled,
       CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),COALESCE(i.filter_definition,N''))),2),
       ic.index_column_id,c.name,ic.key_ordinal,ic.is_descending_key,ic.is_included_column
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.indexes i ON i.object_id=t.object_id
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,i.name,ic.index_column_id;

SELECT N'FK',s.name,t.name,fk.name,c.name,rs.name,rt.name,rc.name,
       fkc.constraint_column_id,fk.delete_referential_action,fk.update_referential_action,
       fk.is_disabled,fk.is_not_trusted
FROM sys.foreign_keys fk JOIN sys.tables t ON t.object_id=fk.parent_object_id
JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
JOIN sys.columns c ON c.object_id=t.object_id AND c.column_id=fkc.parent_column_id
JOIN sys.tables rt ON rt.object_id=fkc.referenced_object_id
JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fkc.referenced_column_id
ORDER BY s.name,t.name,fk.name,fkc.constraint_column_id;

SELECT N'CHECK',s.name,t.name,ck.name,ck.is_disabled,ck.is_not_trusted,
       CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),ck.definition)),2)
FROM sys.check_constraints ck JOIN sys.tables t ON t.object_id=ck.parent_object_id
JOIN sys.schemas s ON s.schema_id=t.schema_id ORDER BY s.name,t.name,ck.name;

SELECT N'MODULE',s.name,o.name,o.type,
       CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),sm.definition)),2),
       COALESCE(tr.is_disabled,0)
FROM sys.sql_modules sm JOIN sys.objects o ON o.object_id=sm.object_id
JOIN sys.schemas s ON s.schema_id=o.schema_id
LEFT JOIN sys.triggers tr ON tr.object_id=o.object_id
WHERE o.is_ms_shipped=0 ORDER BY s.name,o.name;

SELECT N'ROLE',r.name,m.name
FROM sys.database_role_members rm JOIN sys.database_principals r ON r.principal_id=rm.role_principal_id
JOIN sys.database_principals m ON m.principal_id=rm.member_principal_id ORDER BY r.name,m.name;

SELECT N'FLYWAY',version,type,COALESCE(CONVERT(varchar(30),checksum),''),success
FROM dbo.flyway_schema_history ORDER BY installed_rank;
