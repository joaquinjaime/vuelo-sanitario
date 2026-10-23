import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Independent Linux/Java recovery. Supply the portable key as one base64 stdin line. */
public final class RecoverPortableSqlBackup {
    public static void main(String[] args) {
        byte[] key = null, plaintext = null;
        try {
            if (args.length != 2) throw new IllegalArgumentException();
            JsonNode envelope = new ObjectMapper().readTree(Files.readString(Path.of(args[0])));
            if (!"VS-SQLBACKUP-AES256GCM-1".equals(envelope.path("format").asText()))
                throw new IllegalArgumentException();
            String metadataText = envelope.path("metadata").asText();
            key = Base64.getDecoder().decode(new BufferedReader(
                    new InputStreamReader(System.in, StandardCharsets.UTF_8)).readLine().trim());
            if (key.length != 32) throw new IllegalArgumentException();
            byte[] encrypted = Base64.getDecoder().decode(envelope.path("ciphertext").asText());
            byte[] tag = Base64.getDecoder().decode(envelope.path("tag").asText());
            byte[] nonce = Base64.getDecoder().decode(envelope.path("nonce").asText());
            if (tag.length != 16 || nonce.length != 12) throw new IllegalArgumentException();
            byte[] combined = Arrays.copyOf(encrypted, encrypted.length + tag.length);
            System.arraycopy(tag, 0, combined, encrypted.length, tag.length);
            Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
            aes.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
            aes.updateAAD(metadataText.getBytes(StandardCharsets.UTF_8));
            plaintext = aes.doFinal(combined);
            JsonNode metadata = new ObjectMapper().readTree(metadataText);
            String hash = HexFormat.of().withUpperCase().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(plaintext));
            if (!hash.equals(metadata.path("sha256").asText())
                    || plaintext.length != metadata.path("bytes").asLong()
                    || !metadata.path("keyProtection").asText().startsWith("Portable AES-256 key file;"))
                throw new IllegalArgumentException();
            Files.write(Path.of(args[1]), plaintext, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            System.out.println("Portable recovery verified; SHA256=" + hash);
        } catch (Exception ignored) {
            System.err.println("Portable recovery failed; confidential diagnostics suppressed.");
            System.exit(1);
        } finally {
            if (key != null) Arrays.fill(key, (byte) 0);
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
        }
    }
}
