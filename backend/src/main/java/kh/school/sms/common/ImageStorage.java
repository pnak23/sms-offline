package kh.school.sms.common;

import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * Managed storage for uploaded images (school logo, student photos): only a generated file name is stored in the
 * database (never a path), the upload is decoded and re-encoded (so a file that merely claims to be an image is
 * rejected) and capped in size. PNG keeps transparency; JPEG is flattened onto white.
 */
public class ImageStorage {
    private static final long MAX_PIXELS = 25_000_000L;

    private final Supplier<Path> dir;
    private final String prefix;
    private final String format;
    private final int maxEdge;
    private final Pattern namePattern;

    /** @param prefix file-name prefix, e.g. "logo-"; @param format "png" or "jpg" */
    public ImageStorage(Supplier<Path> dir, String prefix, String format, int maxEdge) {
        this.dir = dir;
        this.prefix = prefix;
        this.format = format;
        this.maxEdge = maxEdge;
        this.namePattern = Pattern.compile("^" + Pattern.quote(prefix) + "[0-9a-f-]{36}\\." + format + "$");
    }

    /** @return the generated file name */
    public String store(MultipartFile file) {
        try (InputStream in = file.getInputStream(); ImageInputStream iis = ImageIO.createImageInputStream(in)) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
            if (!readers.hasNext()) throw invalid();
            ImageReader reader = readers.next();
            try {
                reader.setInput(iis, true, true);
                if ((long) reader.getWidth(0) * reader.getHeight(0) > MAX_PIXELS) throw invalid();
                BufferedImage out = scale(reader.read(0));
                String name = prefix + UUID.randomUUID() + "." + format;
                Path target = dir.get().resolve(name);
                if (!ImageIO.write(out, format, target.toFile())) throw invalid();
                return name;
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof ApiException a) throw a;
            throw invalid();
        }
    }

    private BufferedImage scale(BufferedImage src) {
        int w = src.getWidth(), h = src.getHeight();
        double f = Math.min(1.0, (double) maxEdge / Math.max(w, h));
        int nw = Math.max(1, (int) Math.round(w * f)), nh = Math.max(1, (int) Math.round(h * f));
        boolean png = "png".equals(format);
        BufferedImage out = new BufferedImage(nw, nh, png ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        if (!png) {
            g.setColor(Color.WHITE);   // JPEG has no transparency
            g.fillRect(0, 0, nw, nh);
        }
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.drawImage(src, 0, 0, nw, nh, null);
        g.dispose();
        return out;
    }

    public void delete(String name) {
        if (name == null || !namePattern.matcher(name).matches()) return;
        try {
            Files.deleteIfExists(dir.get().resolve(name));
        } catch (IOException ignored) {
            // an orphaned file is reported by the deep health check; it must not block the user
        }
    }

    /** Resolves a stored name to a file, rejecting anything that is not exactly one of our generated names. */
    public Path resolve(String name) {
        if (name == null || !namePattern.matcher(name).matches()) throw ApiException.notFound();
        Path root = dir.get().normalize();
        Path p = root.resolve(name).normalize();
        if (!p.startsWith(root) || !Files.isRegularFile(p)) throw ApiException.notFound();
        return p;
    }

    private static ApiException invalid() { return ApiException.validation("file", "INVALID_IMAGE"); }
}
