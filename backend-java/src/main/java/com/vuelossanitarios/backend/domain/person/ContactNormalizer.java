package com.vuelossanitarios.backend.domain.person;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Forma canónica y reglas de formato de los contactos. La comparación de duplicados (índices únicos de V49) usa el valor
 * normalizado; en los correos el valor ingresado se conserva tal cual. Los teléfonos se validan y normalizan (E.164) con
 * {@link PhoneNumbers}; {@link #phone(String)} sólo limpia separadores y sirve para enmascarar valores en la auditoría y para
 * comparar datos anteriores a V54 (sin país).
 */
public final class ContactNormalizer {
    private ContactNormalizer() {}

    public static final Set<String> TYPES = Set.of("PERSONAL", "LABORAL");
    public static final int MAX_EMAIL_LENGTH = 150;
    private static final Pattern LOCAL_PART = Pattern.compile("^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$");
    private static final Pattern DOMAIN_LABEL = Pattern.compile("^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$");
    private static final Pattern TLD = Pattern.compile("^([A-Za-z]{2,63}|[Xx][Nn]--[A-Za-z0-9-]{1,59})$");
    private static final Pattern PHONE_SEPARATORS = Pattern.compile("[\\s\\-().]");

    /** Minúsculas y sin espacios exteriores. No se quitan puntos ni "+etiqueta": no todos los proveedores siguen las reglas de Gmail. */
    public static String email(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
    }

    public static String phone(String raw) {
        return raw == null ? "" : PHONE_SEPARATORS.matcher(raw.trim()).replaceAll("");
    }

    /**
     * Motivo por el que una dirección no puede registrarse, o {@code null} si es sintácticamente aceptable. Valida la <b>forma</b>, no la
     * existencia: no prueba que el buzón exista ni que sea de quien lo declara (eso lo hace la verificación por código). Parte local ASCII
     * (RFC 5322, sin comillas ni comentarios) de hasta 64 caracteres; dominio con etiquetas válidas (se admiten dominios internacionales,
     * convertidos a punycode) y una terminación alfabética; sin espacios ni caracteres de control.
     */
    public static String emailProblem(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return "Ingrese un correo electrónico";
        if (value.length() > MAX_EMAIL_LENGTH) return "El correo electrónico admite hasta " + MAX_EMAIL_LENGTH + " caracteres";
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (Character.isWhitespace(c) || Character.isISOControl(c) || Character.isSpaceChar(c)) return "El correo electrónico no puede contener espacios ni caracteres de control";
        }
        int at = value.indexOf('@');
        if (at <= 0 || at != value.lastIndexOf('@') || at == value.length() - 1) return "El correo electrónico debe tener una sola @ con texto antes y después, por ejemplo nombre@dominio.com";
        String local = value.substring(0, at), domain = value.substring(at + 1);
        if (local.length() > 64) return "La parte anterior a la @ admite hasta 64 caracteres";
        if (!LOCAL_PART.matcher(local).matches()) return "La parte anterior a la @ contiene caracteres no admitidos o puntos mal ubicados";
        String ascii;
        try { ascii = java.net.IDN.toASCII(domain); } catch (IllegalArgumentException e) { return "El dominio del correo electrónico no es válido"; }
        if (ascii.length() > 253 || ascii.endsWith(".")) return "El dominio del correo electrónico no es válido";
        String[] labels = ascii.split("\\.", -1);
        if (labels.length < 2) return "El dominio debe tener un punto, por ejemplo dominio.com";
        for (String label : labels) if (!DOMAIN_LABEL.matcher(label).matches()) return "El dominio del correo electrónico no es válido";
        if (!TLD.matcher(labels[labels.length - 1]).matches()) return "La terminación del dominio no es válida";
        return null;
    }

    public static boolean validEmail(String raw) {
        return emailProblem(raw) == null;
    }

    /** Un tipo ausente es PERSONAL; cualquier otro valor fuera del conjunto permitido es inválido (devuelve {@code null}). */
    public static String type(String raw) {
        if (raw == null || raw.isBlank()) return "PERSONAL";
        String value = raw.trim().toUpperCase(Locale.ROOT);
        return TYPES.contains(value) ? value : null;
    }

    /** Valor parcialmente oculto para la auditoría: los datos de contacto son personales y la bitácora no necesita el valor completo. */
    public static String maskEmail(String raw) {
        String value = email(raw);
        int at = value.indexOf('@');
        return at <= 0 ? "***" : value.charAt(0) + "***" + value.substring(at);
    }

    public static String maskPhone(String raw) {
        String value = phone(raw);
        int keep = Math.min(3, value.length());
        return "*".repeat(Math.max(0, value.length() - keep)) + value.substring(value.length() - keep);
    }
}
