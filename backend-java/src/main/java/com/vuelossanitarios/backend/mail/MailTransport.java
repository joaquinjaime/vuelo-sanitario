package com.vuelossanitarios.backend.mail;

/**
 * Salida de correo de la aplicación. Una implementación real habla SMTP con el servidor configurado; que el servidor acepte el mensaje
 * no prueba que llegue al buzón. Sin configuración, {@link #configured()} es falso y nada se envía ni se simula.
 */
public interface MailTransport {
    /** Hay un servidor SMTP y un remitente válidos configurados. */
    boolean configured();

    /** @throws MailDeliveryException si el servidor rechaza el mensaje o no responde (el contenido no se registra). */
    void send(String to, String subject, String body);

    class MailDeliveryException extends RuntimeException {
        public MailDeliveryException(String message, Throwable cause) { super(message, cause); }
    }
}
