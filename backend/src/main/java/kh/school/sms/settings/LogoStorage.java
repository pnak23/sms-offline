package kh.school.sms.settings;

import kh.school.sms.bootstrap.DataDirs;
import kh.school.sms.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Managed school-logo storage: only a generated file name is stored in the database (never a path), images are
 * decoded and re-encoded as PNG (so a file that merely claims to be an image is rejected), capped at 512 px.
 */
@Component
public class LogoStorage {
    private static final Pattern NAME = Pattern.compile("^logo-[0-9a-f-]{36}\\.png$");
    private static final int MAX_EDGE = 512;
    private static final long MAX_PIXELS = 25_000_000L;

    /** @return the generated file name */
    public String store(MultipartFile file) {
        try (InputStream in = file.getInputStream(); ImageInputStream iis = ImageIO.createImageInputStream(in)) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
            if (!readers.hasNext()) throw invalid();
            ImageReader reader = readers.next();
            try {
                reader.setInput(iis, true, true);
                if ((long) reader.getWidth(0) * reader.getHeight(0) > MAX_PIXELS) throw invalid();
                BufferedImage src = reader.read(0);
                BufferedImage out = scale(src);
                String name = "logo-" + UUID.randomUUID() + ".png";
                Path target = DataDirs.schoolUploads().resolve(name);
                if (!ImageIO.write(out, "png", target.toFile())) throw invalid();
                return name;
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof ApiException a) throw a;
            throw invalid();
        }
    }

    private static BufferedImage scale(BufferedImage src) {
        int w = src.getWidth(), h = src.getHeight();
        double f = Math.min(1.0, (double) MAX_EDGE / Math.max(w, h));
        int nw = Math.max(1, (int) Math.round(w * f)), nh = Math.max(1, (int) Math.round(h * f));
        BufferedImage out = new BufferedImage(nw, nh, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.drawImage(src, 0, 0, nw, nh, null);
        g.dispose();
        return out;
    }

    public void delete(String name) {
        if (name == null || !NAME.matcher(name).matches()) return;
        try {
            Files.deleteIfExists(DataDirs.schoolUploads().resolve(name));
        } catch (IOException ignored) {
            // an orphaned file is reported by the deep health check; it must not block the user
        }
    }

    /** Resolves a stored name to a file, rejecting anything that is not exactly one of our generated names. */
    public Path resolve(String name) {
        if (name == null || !NAME.matcher(name).matches()) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND");
        Path p = DataDirs.schoolUploads().resolve(name).normalize();
        if (!p.startsWith(DataDirs.schoolUploads().normalize()) || !Files.isRegularFile(p)) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND");
        return p;
    }

    private static ApiException invalid() { return ApiException.validation("file", "INVALID_IMAGE"); }
}
