package kh.school.sms.bootstrap;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** The jar carries a copy of the ONE authoritative release file, and the program's version comes from nowhere else. */
class ProductInfoTest {
    static final JsonMapper JSON = JsonMapper.builder().build();
    static final Pattern SEMVER = Pattern.compile("^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(-[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?$");

    @Test
    void theProgramKnowsItselfFromTheReleaseFileAndItsVersionIsSemantic() throws Exception {
        ProductInfo p = ProductInfo.get();
        JsonNode file = JSON.readTree(Files.readString(Path.of("..", "release", "release.json"), StandardCharsets.UTF_8));
        assertThat(p.name()).isEqualTo(file.path("name").asString());
        assertThat(p.shortName()).isEqualTo(file.path("shortName").asString());
        assertThat(p.developer()).isEqualTo(file.path("developer").asString());
        assertThat(p.channel()).isEqualTo(file.path("channel").asString());
        assertThat(p.copyright()).isEqualTo(file.path("copyright").asString());
        assertThat(p.version()).isEqualTo(file.path("version").asString()).matches(SEMVER);
        assertThat(StartupState.APP_VERSION).as("the one constant the rest of the backend uses").isEqualTo(p.version());
        assertThat(Files.readString(Path.of("pom.xml"), StandardCharsets.UTF_8)).as("Maven's own copy is kept in step by scripts/version.mjs")
                .containsPattern("<artifactId>sms-backend</artifactId>\\s*<version>" + Pattern.quote(p.version()) + "</version>");
    }

    @Test
    void theShippedAcceptanceListNeverClaimsTheSchoolAcceptedAnything() throws Exception {
        String shipped = Files.readString(Path.of("..", "release", "acceptance.json"), StandardCharsets.UTF_8);
        JsonNode items = JSON.readTree(shipped).path("items");
        assertThat(items.size()).isEqualTo(13);
        items.forEach(i -> {
            assertThat(i.path("development").asString()).isIn("COMPLETED", "IN_PROGRESS");
            assertThat(i.path("pending").asString()).isIn("CONFIGURATION", "OFFICIAL_INFORMATION", "PHYSICAL_TESTING");
        });
        assertThat(JSON.writeValueAsString(items).toLowerCase()).doesNotContain("final").doesNotContain("accepted");
    }
}
