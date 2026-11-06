package kh.school.sms.bootstrap;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;

/**
 * Who the program is: name, version, developer, channel, copyright. Read from {@code release.json} on the class path, which is a copy
 * of the ONE authoritative file {@code release/release.json} made at build time (see pom.xml and docs/RELEASE.md). Nothing here is
 * typed a second time, so the backend can never disagree with the installer about its own version.
 */
public record ProductInfo(String name, String shortName, String developer, String version, String channel, String copyright) {
    private static final JsonMapper JSON = JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
    private static volatile ProductInfo cached;

    public static ProductInfo get() {
        ProductInfo p = cached;
        if (p == null) {
            try (InputStream in = ProductInfo.class.getResourceAsStream("/release.json")) {
                if (in == null) throw new IllegalStateException("release.json is missing from the program");
                p = JSON.readValue(in, ProductInfo.class);
            } catch (IOException e) {
                throw new IllegalStateException("release.json cannot be read", e);
            }
            if (p.version() == null || p.version().isBlank() || p.name() == null || p.shortName() == null) throw new IllegalStateException("release.json is incomplete");
            cached = p;
        }
        return p;
    }
}
