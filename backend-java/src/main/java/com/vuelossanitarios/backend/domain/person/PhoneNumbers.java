package com.vuelossanitarios.backend.domain.person;

import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;
import com.google.i18n.phonenumbers.PhoneNumberUtil.PhoneNumberFormat;
import com.google.i18n.phonenumbers.PhoneNumberUtil.ValidationResult;
import com.google.i18n.phonenumbers.Phonenumber.PhoneNumber;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Validación y normalización <b>internacional</b> de teléfonos con los metadatos de numeración de Google (libphonenumber).
 * Es la única regla de teléfonos del servidor: la usan el autoservicio, el alta administrativa y los contactos de coordinación del
 * traslado. El país lo elige quien carga el dato (no se infiere); el número es válido sólo si lo es <i>para ese país</i>.
 *
 * <ul>
 * <li>Se acepta formato nacional (con o sin prefijo troncal y con los formatos móviles propios del país, p. ej. 0 y 15 en Argentina)
 *     o internacional con "+"; si trae "+", el código debe ser el del país elegido.</li>
 * <li>Prefijos compartidos (+1: Estados Unidos y Canadá, entre otros): el número debe ser válido para la región elegida.</li>
 * <li>Se guarda E.164 (para unicidad y comparación) y el formato internacional legible; la validez es de numeración, no prueba
 *     que la línea exista ni que pertenezca a su titular (no hay verificación por SMS).</li>
 * <li>No se admiten extensiones (ni letras, "x", "ext" o "#"): se rechazan con un mensaje explícito, nunca se descartan en silencio.</li>
 * </ul>
 */
public final class PhoneNumbers {
    private PhoneNumbers() {}

    /** Número ya validado: {@code region} es el país elegido (ISO 3166-1 alfa-2), {@code national} el número significativo sin prefijos y {@code e164} la forma canónica. */
    public record Parsed(String region, int callingCode, String national, String e164, String international) {}

    /** Motivo de rechazo con código estable para las pruebas y la interfaz. */
    public static final class Rejected extends RuntimeException {
        private final String reason;
        Rejected(String reason, String message) { super(message); this.reason = reason; }
        public String reason() { return reason; }
    }

    public static final int MAX_INPUT_LENGTH = 30;
    private static final PhoneNumberUtil UTIL = PhoneNumberUtil.getInstance();
    private static final Pattern ALLOWED = Pattern.compile("^\\+?[0-9 ().\\-]+$");
    private static final Pattern EXTENSION_HINT = Pattern.compile("(?i).*(ext|int\\.|anexo|x|#|;|,).*");
    private static final Locale ES = Locale.forLanguageTag("es");

    public static boolean supported(String region) {
        return region != null && UTIL.getSupportedRegions().contains(region.trim().toUpperCase(Locale.ROOT));
    }

    public static String countryName(String region) {
        return new Locale("", region).getDisplayCountry(ES);
    }

    /** Valida {@code raw} para el país {@code region}; lanza {@link Rejected} si no puede registrarse. */
    public static Parsed parse(String raw, String region) {
        if (region == null || region.isBlank()) throw new Rejected("PHONE_COUNTRY_REQUIRED", "Seleccione el país del teléfono");
        String country = region.trim().toUpperCase(Locale.ROOT);
        if (!UTIL.getSupportedRegions().contains(country)) throw new Rejected("PHONE_COUNTRY_INVALID", "El país seleccionado no está admitido");
        String name = countryName(country);
        String text = raw == null ? "" : raw.trim();
        if (text.isEmpty()) throw new Rejected("PHONE_REQUIRED", "Ingrese el número de teléfono");
        if (text.length() > MAX_INPUT_LENGTH) throw new Rejected("PHONE_TOO_LONG", "El teléfono tiene demasiados caracteres");
        if (!ALLOWED.matcher(text).matches() || text.indexOf('+') > 0) {
            if (EXTENSION_HINT.matcher(text).matches()) throw new Rejected("PHONE_EXTENSION_UNSUPPORTED", "No se admiten extensiones ni letras en el número: ingrese sólo el número telefónico");
            throw new Rejected("PHONE_CHARS_INVALID", "El teléfono sólo admite dígitos, espacios, guiones, puntos, paréntesis y un \"+\" inicial");
        }
        PhoneNumber number;
        try {
            number = UTIL.parse(text, country);
        } catch (NumberParseException e) {
            switch (e.getErrorType()) {
                case TOO_SHORT_NSN, TOO_SHORT_AFTER_IDD -> throw new Rejected("PHONE_TOO_SHORT", "El número tiene muy pocos dígitos para " + name);
                case TOO_LONG -> throw new Rejected("PHONE_TOO_LONG", "El número tiene demasiados dígitos para " + name);
                case INVALID_COUNTRY_CODE -> throw new Rejected("PHONE_COUNTRY_MISMATCH", "El prefijo internacional no es válido o no corresponde a " + name);
                default -> throw new Rejected("PHONE_INVALID", "El teléfono no tiene un formato numérico válido");
            }
        }
        if (number.hasExtension() && !number.getExtension().isEmpty()) throw new Rejected("PHONE_EXTENSION_UNSUPPORTED", "No se admiten extensiones telefónicas");
        int expected = UTIL.getCountryCodeForRegion(country);
        if (text.startsWith("+") && number.getCountryCode() != expected)
            throw new Rejected("PHONE_COUNTRY_MISMATCH", "El prefijo +" + number.getCountryCode() + " no corresponde a " + name + " (+" + expected + ")");
        ValidationResult length = UTIL.isPossibleNumberWithReason(number);
        if (length == ValidationResult.TOO_SHORT) throw new Rejected("PHONE_TOO_SHORT", "El número tiene muy pocos dígitos para " + name);
        if (length == ValidationResult.IS_POSSIBLE_LOCAL_ONLY) throw new Rejected("PHONE_TOO_SHORT", "Falta el código de área o dígitos: el número está incompleto para " + name);
        if (length == ValidationResult.TOO_LONG) throw new Rejected("PHONE_TOO_LONG", "El número tiene demasiados dígitos para " + name);
        if (length == ValidationResult.INVALID_LENGTH || length == ValidationResult.INVALID_COUNTRY_CODE)
            throw new Rejected("PHONE_INVALID", "La cantidad de dígitos no es válida para " + name);
        if (!UTIL.isValidNumberForRegion(number, country))
            throw new Rejected("PHONE_INVALID", "El número no es un teléfono válido de " + name + " (+" + expected + ")");
        return new Parsed(country, number.getCountryCode(), UTIL.getNationalSignificantNumber(number), UTIL.format(number, PhoneNumberFormat.E164), UTIL.format(number, PhoneNumberFormat.INTERNATIONAL));
    }
}
