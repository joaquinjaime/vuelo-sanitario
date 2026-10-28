package com.vuelossanitarios.backend.config;

import java.util.Properties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/**
 * Cliente SMTP, creado únicamente si el correo está habilitado ({@code app.mail.enabled=true}) y hay servidor. Los parámetros llegan de
 * variables de entorno (MAIL_*); ninguna credencial vive en el repositorio. Sin esto la aplicación funciona y las verificaciones de
 * correo informan "servicio de correo no configurado": nada se marca como enviado ni verificado.
 */
@Configuration
public class MailConfiguration {
    @Bean
    @ConditionalOnExpression("'${app.mail.enabled:false}'=='true' and !'${app.mail.host:}'.isBlank()")
    JavaMailSenderImpl mailSender(@Value("${app.mail.host}") String host, @Value("${app.mail.port:587}") int port,
                                  @Value("${app.mail.username:}") String username, @Value("${app.mail.password:}") String password,
                                  @Value("${app.mail.starttls:true}") boolean starttls, @Value("${app.mail.ssl:false}") boolean ssl) {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(host.trim()); sender.setPort(port); sender.setDefaultEncoding("UTF-8");
        Properties p = sender.getJavaMailProperties();
        p.put("mail.transport.protocol", "smtp");
        p.put("mail.smtp.connectiontimeout", "5000"); p.put("mail.smtp.timeout", "10000"); p.put("mail.smtp.writetimeout", "10000");
        // Las credenciales SMTP nunca viajan sin cifrar: o hay TLS implícito, o STARTTLS obligatorio (si el servidor no lo ofrece, el envío falla en lugar de degradarse a texto plano).
        if (!username.isBlank() && !ssl && !starttls) throw new IllegalStateException("MAIL_USERNAME requiere MAIL_SSL=true o MAIL_STARTTLS=true: las credenciales no se envían sin cifrar");
        if (!username.isBlank()) { sender.setUsername(username); sender.setPassword(password); p.put("mail.smtp.auth", "true"); }
        if (ssl) { p.put("mail.smtp.ssl.enable", "true"); p.put("mail.smtp.ssl.checkserveridentity", "true"); }
        else if (starttls) { p.put("mail.smtp.starttls.enable", "true"); p.put("mail.smtp.starttls.required", "true"); p.put("mail.smtp.ssl.checkserveridentity", "true"); }
        return sender;
    }
}
