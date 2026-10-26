package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.mail.MailTransport;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Bandeja de pruebas en memoria: registra lo que se enviaría y permite simular "no configurado" y rechazos del servidor. No es una entrega real. */
@TestConfiguration
public class RecordingMailConfiguration {
    public static class RecordingMailTransport implements MailTransport {
        public record Sent(String to, String subject, String body) {}
        private static final Pattern CODE = Pattern.compile("\\b([A-Z2-9]{4}-[A-Z2-9]{4})\\b");
        public final List<Sent> sent = new CopyOnWriteArrayList<>();
        public volatile boolean configured = true;
        public volatile boolean failNext = false;

        @Override public boolean configured() { return configured; }
        @Override public void send(String to, String subject, String body) {
            if (failNext) { failNext = false; throw new MailDeliveryException("rechazado por el servidor de pruebas", null); }
            sent.add(new Sent(to, subject, body));
        }
        public void reset() { sent.clear(); configured = true; failNext = false; }
        /** Código del último mensaje enviado a {@code to}. */
        public String lastCodeFor(String to) {
            for (int i = sent.size() - 1; i >= 0; i--) {
                if (!sent.get(i).to().equalsIgnoreCase(to)) continue;
                Matcher m = CODE.matcher(sent.get(i).body());
                if (m.find()) return m.group(1);
            }
            throw new AssertionError("no se envió ningún código a " + to);
        }
    }

    @Bean @Primary public RecordingMailTransport recordingMailTransport() { return new RecordingMailTransport(); }
}
