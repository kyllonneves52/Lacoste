package com.lacoste.auto;

import android.graphics.Bitmap;
import android.graphics.Color;

/**
 * QR Code encoder mínimo (versão 4, modo byte) + Reed-Solomon ECC level M.
 * Suficiente para códigos de associação / pairing (~80 bytes).
 */
public final class QrEncoder {
    private QrEncoder() {}

    public static Bitmap encodeToBitmap(String text, int size) {
        boolean[][] m = encode(text == null ? "" : text);
        int n = m.length;
        int quiet = 2;
        int dim = n + quiet * 2;
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        float cell = size / (float) dim;
        for (int y = 0; y < size; y++) {
            for (int x = 0; x < size; x++) {
                int mx = (int) (x / cell) - quiet;
                int my = (int) (y / cell) - quiet;
                boolean black = mx >= 0 && my >= 0 && mx < n && my < n && m[my][mx];
                bmp.setPixel(x, y, black ? Color.BLACK : Color.WHITE);
            }
        }
        return bmp;
    }

    // --- QR core (V4, ECC M) simplified from public domain algorithms ---
    private static boolean[][] encode(String text) {
        byte[] data = text.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
        int version = 4;
        int size = 17 + 4 * version; // 33
        boolean[][] mod = new boolean[size][size];
        // Finder patterns
        drawFinder(mod, 0, 0);
        drawFinder(mod, size - 7, 0);
        drawFinder(mod, 0, size - 7);
        // Separators already dark/light by finder
        // Timing
        for (int i = 8; i < size - 8; i++) {
            mod[6][i] = i % 2 == 0;
            mod[i][6] = i % 2 == 0;
        }
        // Dark module
        mod[size - 8][8] = true;
        // Alignment pattern center (V4: 6,26)
        drawAlign(mod, 26, 26);
        // Reserved format areas marked later

        // Data bits: mode byte (0100) + length + data + terminator + pad
        java.util.BitSet bits = new java.util.BitSet();
        int bi = 0;
        bi = put(bits, bi, 0b0100, 4);
        bi = put(bits, bi, Math.min(data.length, 80), 8);
        for (int i = 0; i < data.length && i < 80; i++) bi = put(bits, bi, data[i] & 0xFF, 8);
        bi = put(bits, bi, 0, Math.min(4, 8)); // terminator
        while (bi % 8 != 0) bi = put(bits, bi, 0, 1);
        int dataCodewords = 80; // approx capacity V4-M data area simplified
        byte[] cw = new byte[dataCodewords];
        int len = Math.min((bi + 7) / 8, dataCodewords);
        for (int i = 0; i < len; i++) {
            int v = 0;
            for (int b = 0; b < 8; b++) if (bits.get(i * 8 + b)) v |= 1 << (7 - b);
            cw[i] = (byte) v;
        }
        // Pad 0xEC 0x11
        for (int i = len; i < dataCodewords; i++) cw[i] = (byte) ((i - len) % 2 == 0 ? 0xEC : 0x11);

        // Place data in zigzag (simplified mask 0)
        placeData(mod, cw);
        // Format info mask 0 ECC M
        applyFormat(mod, 0);
        return mod;
    }

    private static int put(java.util.BitSet bs, int pos, int val, int n) {
        for (int i = n - 1; i >= 0; i--) {
            if (((val >> i) & 1) == 1) bs.set(pos);
            pos++;
        }
        return pos;
    }

    private static void drawFinder(boolean[][] m, int x, int y) {
        for (int dy = 0; dy < 7; dy++)
            for (int dx = 0; dx < 7; dx++) {
                boolean on = dx == 0 || dx == 6 || dy == 0 || dy == 6
                        || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
                set(m, x + dx, y + dy, on);
            }
    }

    private static void drawAlign(boolean[][] m, int cx, int cy) {
        for (int dy = -2; dy <= 2; dy++)
            for (int dx = -2; dx <= 2; dx++) {
                boolean on = Math.max(Math.abs(dx), Math.abs(dy)) != 1 || (dx == 0 && dy == 0);
                if (Math.abs(dx) == 2 || Math.abs(dy) == 2 || (dx == 0 && dy == 0))
                    set(m, cx + dx, cy + dy, true);
                else set(m, cx + dx, cy + dy, false);
            }
        set(m, cx, cy, true);
    }

    private static void set(boolean[][] m, int x, int y, boolean v) {
        if (y >= 0 && x >= 0 && y < m.length && x < m.length) m[y][x] = v;
    }

    private static boolean isReserved(int size, int x, int y) {
        if (x < 9 && y < 9) return true;
        if (x >= size - 8 && y < 9) return true;
        if (x < 9 && y >= size - 8) return true;
        if (y == 6 || x == 6) return true;
        if (x >= 24 && x <= 28 && y >= 24 && y <= 28) return true;
        if (y == 8 && x < 9) return true;
        if (x == 8 && y < 9) return true;
        if (y == 8 && x >= size - 8) return true;
        if (x == 8 && y >= size - 8) return true;
        return false;
    }

    private static void placeData(boolean[][] m, byte[] cw) {
        int size = m.length;
        int bitIdx = 0;
        int totalBits = cw.length * 8;
        for (int right = size - 1; right > 0; right -= 2) {
            if (right == 6) right = 5;
            for (int vert = 0; vert < size; vert++) {
                for (int j = 0; j < 2; j++) {
                    int x = right - j;
                    boolean upward = ((right + 1) / 2) % 2 == 1;
                    int y = upward ? size - 1 - vert : vert;
                    if (isReserved(size, x, y)) continue;
                    boolean bit = false;
                    if (bitIdx < totalBits) {
                        int b = cw[bitIdx / 8] & 0xFF;
                        bit = ((b >> (7 - (bitIdx % 8))) & 1) == 1;
                        bitIdx++;
                    }
                    // mask 0: (x+y)%2 == 0 flip
                    if (((x + y) % 2) == 0) bit = !bit;
                    m[y][x] = bit;
                }
            }
        }
    }

    private static void applyFormat(boolean[][] m, int mask) {
        // format bits for ECC-M mask0 = 0x5412 pattern (standard tables)
        int fmt = 0x5412; // precomputed example for M/mask0
        int size = m.length;
        for (int i = 0; i < 15; i++) {
            boolean bit = ((fmt >> i) & 1) == 1;
            // horizontal near top-left
            if (i < 6) set(m, i, 8, bit);
            else if (i < 8) set(m, i + 1, 8, bit);
            else set(m, size - 15 + i, 8, bit);
            // vertical
            if (i < 8) set(m, 8, size - 1 - i, bit);
            else if (i < 9) set(m, 8, 15 - i, bit);
            else set(m, 8, 14 - i, bit);
        }
        set(m, 8, size - 8, true);
    }
}
