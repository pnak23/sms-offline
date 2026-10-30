package kh.school.sms.settings;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.time.Clock;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class SettingsController {
    public record SchoolResponse(String nameKm, String nameEn, String address, String phone, String directorName,
                                 String logoFile, long version) {}
    public record SchoolRequest(@NotBlank @Size(max = 200) String nameKm, @Size(max = 200) String nameEn,
                                @Size(max = 500) String address, @Size(max = 50) String phone,
                                @Size(max = 150) String directorName, long version) {}

    private final SchoolSettingsRepository repo;
    private final AppSettingsService appSettings;
    private final LogoStorage logos;
    private final AuditService audit;
    private final Clock clock;

    public SettingsController(SchoolSettingsRepository repo, AppSettingsService appSettings, LogoStorage logos,
                              AuditService audit, Clock clock) {
        this.repo = repo;
        this.appSettings = appSettings;
        this.logos = logos;
        this.audit = audit;
        this.clock = clock;
    }

    private static SchoolResponse dto(SchoolSettings s) {
        return new SchoolResponse(s.getNameKm(), s.getNameEn(), s.getAddress(), s.getPhone(), s.getDirectorName(), s.getLogoFile(), s.getVersion());
    }

    @GetMapping("/settings/school")
    public SchoolResponse school() { return dto(repo.findById(1L).orElseThrow()); }

    @PutMapping("/settings/school")
    @Transactional
    public SchoolResponse updateSchool(@Valid @RequestBody SchoolRequest r) {
        SchoolSettings s = repo.findById(1L).orElseThrow();
        if (s.getVersion() != r.version()) throw new ApiException(HttpStatus.CONFLICT, "OPTIMISTIC_LOCK");
        s.setNameKm(KhmerText.name(r.nameKm()));
        s.setNameEn(KhmerText.name(r.nameEn()));
        s.setAddress(KhmerText.free(r.address()));
        s.setPhone(KhmerText.asciiDigits(KhmerText.free(r.phone())));
        s.setDirectorName(KhmerText.name(r.directorName()));
        s.setUpdatedAt(clock.instant());
        SchoolSettings saved = repo.saveAndFlush(s);
        audit.record("SCHOOL_SETTINGS_UPDATED", "school_settings", 1L, "school profile updated");
        return dto(saved);
    }

    @PostMapping("/settings/school/logo")
    @Transactional
    public SchoolResponse uploadLogo(@RequestPart("file") MultipartFile file) {
        if (file.isEmpty()) throw ApiException.validation("file", "REQUIRED");
        String name = logos.store(file);
        SchoolSettings s = repo.findById(1L).orElseThrow();
        String old = s.getLogoFile();
        s.setLogoFile(name);
        s.setUpdatedAt(clock.instant());
        SchoolSettings saved = repo.saveAndFlush(s);
        logos.delete(old);
        audit.record("SCHOOL_LOGO_CHANGED", "school_settings", 1L, "school logo replaced");
        return dto(saved);
    }

    @DeleteMapping("/settings/school/logo")
    @Transactional
    public SchoolResponse deleteLogo() {
        SchoolSettings s = repo.findById(1L).orElseThrow();
        String old = s.getLogoFile();
        s.setLogoFile(null);
        s.setUpdatedAt(clock.instant());
        SchoolSettings saved = repo.saveAndFlush(s);
        logos.delete(old);
        audit.record("SCHOOL_LOGO_REMOVED", "school_settings", 1L, "school logo removed");
        return dto(saved);
    }

    /** The image is fetched with the session token and shown through a blob URL (an <img src> cannot send the token). */
    @GetMapping("/files/school/{name}")
    public ResponseEntity<byte[]> schoolFile(@PathVariable String name) throws IOException {
        byte[] bytes = Files.readAllBytes(logos.resolve(name));
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).cacheControl(CacheControl.noCache()).body(bytes);
    }

    @GetMapping("/settings/app")
    public Map<String, String> app() { return appSettings.allPublic(); }

    @PutMapping("/settings/app")
    public Map<String, String> updateApp(@RequestBody Map<String, String> values) {
        List<String> bad = appSettings.putPublic(values);
        if (!bad.isEmpty()) {
            throw ApiException.validation(bad.stream().map(k -> new ApiException.FieldError(k, "INVALID_SETTING")).toList());
        }
        audit.record("APP_SETTINGS_UPDATED", "app_settings", null, "application preferences updated");
        return appSettings.allPublic();
    }
}
