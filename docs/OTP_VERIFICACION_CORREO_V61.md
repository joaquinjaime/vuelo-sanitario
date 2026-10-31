# OTP de correo V61

La verificación de contactos de correo usa un OTP de exactamente seis dígitos (`000000` a `999999`) generado con `SecureRandom`. El valor sólo existe en memoria hasta que se entrega al transporte SMTP; la base persiste un HMAC-SHA256 contextualizado con la clave JWT de servidor, el contacto y la dirección normalizada. No se incluye el OTP en respuestas, URL, auditoría ni logs.

El OTP vence a los 10 minutos, puede confirmarse una única vez y queda invalidado al reenviarlo, modificar o retirar el contacto, fallar el envío o acumular cinco errores. Los reenvíos se limitan a un mínimo de 60 segundos y a ventanas persistentes por correo y por cuenta. SQL Server conserva la restricción de una solicitud abierta por correo y desde V61 impone también el tope de cinco intentos.

V61 invalida las solicitudes V54 que seguían abiertas porque su HMAC correspondía al formato alfanumérico anterior; no se borran registros y el usuario puede pedir un OTP nuevo. `EMAIL_VERIFICATION_CODE_MINUTES`, `EMAIL_VERIFICATION_MAX_ATTEMPTS` y `EMAIL_VERIFICATION_RESEND_SECONDS` deben conservar respectivamente 10, 5 y al menos 60: el backend rechaza configuraciones inseguras al iniciar.

El correo se entrega como texto plano por la infraestructura SMTP existente, con asunto `Verificación de correo electrónico — Vuelos Sanitarios`. Mailpit valida aceptación SMTP en los E2E; no constituye prueba de entrega a un proveedor externo.
