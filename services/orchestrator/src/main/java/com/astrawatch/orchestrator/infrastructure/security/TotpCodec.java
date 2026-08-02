package com.astrawatch.orchestrator.infrastructure.security;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Minimal RFC 6238 TOTP implementation (HMAC-SHA1, 30s window, 6 digits) with
 * a small Base32 codec. Used by the MFA endpoints so secrets and codes are
 * verified server-side instead of the previous fictional static TOTP.
 */
public final class TotpCodec {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int TIME_STEP_SECONDS = 30;
    private static final int CODE_DIGITS = 6;
    private static final String BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final int WINDOW = 1; // accept ±1 step for clock drift

    private TotpCodec() {
    }

    /** Generates a random 20-byte (160-bit) Base32 secret — the RFC 4226 default. */
    public static String generateSecret() {
        byte[] bytes = new byte[20];
        RANDOM.nextBytes(bytes);
        return base32Encode(bytes);
    }

    /** Returns the current 6-digit TOTP code for the given Base32 secret. */
    public static String currentCode(String base32Secret) {
        long counter = System.currentTimeMillis() / 1000L / TIME_STEP_SECONDS;
        return generateCode(base32Secret, counter);
    }

    /**
     * Verifies the supplied code against the secret, tolerating the current
     * 30-second window plus WINDOW steps in each direction (clock drift).
     */
    public static boolean verify(String base32Secret, String code) {
        if (base32Secret == null || base32Secret.isBlank() || code == null || code.isBlank()) {
            return false;
        }
        long counter = System.currentTimeMillis() / 1000L / TIME_STEP_SECONDS;
        for (long i = -WINDOW; i <= WINDOW; i++) {
            if (constantTimeEquals(generateCode(base32Secret, counter + i), code)) {
                return true;
            }
        }
        return false;
    }

    private static String generateCode(String base32Secret, long counter) {
        try {
            byte[] key = base32Decode(base32Secret.trim());
            byte[] counterBytes = new byte[8];
            for (int i = 7; i >= 0; i--) {
                counterBytes[i] = (byte) (counter & 0xFF);
                counter >>= 8;
            }

            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            byte[] hash = mac.doFinal(counterBytes);

            int offset = hash[hash.length - 1] & 0x0F;
            int binary = ((hash[offset] & 0x7F) << 24)
                    | ((hash[offset + 1] & 0xFF) << 16)
                    | ((hash[offset + 2] & 0xFF) << 8)
                    | (hash[offset + 3] & 0xFF);
            int otp = binary % (int) Math.pow(10, CODE_DIGITS);
            return String.format("%0" + CODE_DIGITS + "d", otp);
        } catch (Exception e) {
            throw new IllegalStateException("TOTP generation failed", e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        return java.security.MessageDigest.isEqual(
                a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    public static String base32Encode(byte[] data) {
        StringBuilder sb = new StringBuilder();
        int buffer = 0;
        int bitsLeft = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xFF);
            bitsLeft += 8;
            while (bitsLeft >= 5) {
                int index = (buffer >>> (bitsLeft - 5)) & 0x1F;
                sb.append(BASE32_ALPHABET.charAt(index));
                bitsLeft -= 5;
            }
        }
        if (bitsLeft > 0) {
            int index = (buffer << (5 - bitsLeft)) & 0x1F;
            sb.append(BASE32_ALPHABET.charAt(index));
        }
        return sb.toString();
    }

    public static byte[] base32Decode(String input) {
        String cleaned = input.trim().replace("=", "").toUpperCase();
        byte[] out = new byte[(cleaned.length() * 5) / 8];
        int buffer = 0;
        int bitsLeft = 0;
        int outIdx = 0;
        for (char c : cleaned.toCharArray()) {
            int value = BASE32_ALPHABET.indexOf(c);
            if (value < 0) {
                throw new IllegalArgumentException("Invalid Base32 character: " + c);
            }
            buffer = (buffer << 5) | value;
            bitsLeft += 5;
            if (bitsLeft >= 8) {
                out[outIdx++] = (byte) ((buffer >>> (bitsLeft - 8)) & 0xFF);
                bitsLeft -= 8;
            }
        }
        if (outIdx != out.length) {
            byte[] trimmed = new byte[outIdx];
            System.arraycopy(out, 0, trimmed, 0, outIdx);
            return trimmed;
        }
        return out;
    }

    /** Convenience Base64 wrapper (kept for tests/tokens that use standard Base64). */
    public static String base64UrlEncode(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }
}
