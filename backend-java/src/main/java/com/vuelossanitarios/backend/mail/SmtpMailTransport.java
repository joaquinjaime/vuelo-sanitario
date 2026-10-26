package com.vuelossanitarios.backend.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/** Envío por SMTP con {@link JavaMailSender}; sólo existe un sender si {@code app.mail.enabled=true} y hay servidor (ver {@link MailConfiguration}). */
@Component
public class SmtpMailTransport implements MailTransport {
    private static final Logger log = LoggerFactory.getLogger(SmtpMailTransport.class);
    private final ObjectProvider<JavaMailSender> sender;
    private final String from;

    public SmtpMailTransport(ObjectProvider<JavaMailSender> sender, @Value("${app.mail.from:}") String from) {
        this.sender = sender;
        this.from = from == null ? "" : from.trim();
    }

    @Override public boolean configured() { return sender.getIfAvailable() != null && !from.isEmpty(); }

    @Override public void send(String to, String subject, String body) {
        JavaMailSender mailer = sender.getIfAvailable();
        if (mailer == null || from.isEmpty()) throw new MailDeliveryException("El servicio de correo no está configurado", null);
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from); message.setTo(to); message.setSubject(subject); message.setText(body);
        try {
            mailer.send(message);
        } catch (MailException e) {
            // Nunca se registra el contenido (contiene el código) ni la dirección completa.
            log.warn("El servidor SMTP no aceptó un mensaje de verificación: {}", e.getClass().getSimpleName());
            throw new MailDeliveryException("El servidor de correo no aceptó el mensaje", e);
        }
    }
}
