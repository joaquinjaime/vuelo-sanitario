-- V3__fix_password_hashes.sql
-- Corrige los hashes BCrypt para que coincidan con la password "Admin1234!"
-- Generado con bcryptjs: $2b$10$DdQjbsvIbA7/CoWaT7NmMuYOl.E8ZV8Ec50Zu.UNBMkHXkzqFQLIi

UPDATE usuario SET password_hash = '$2b$10$DdQjbsvIbA7/CoWaT7NmMuYOl.E8ZV8Ec50Zu.UNBMkHXkzqFQLIi'
WHERE username IN ('dts_admin', 'cmd_mendez', 'ops_fernandez');
