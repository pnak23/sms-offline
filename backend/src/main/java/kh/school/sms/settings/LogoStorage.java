package kh.school.sms.settings;

import kh.school.sms.bootstrap.DataDirs;
import kh.school.sms.common.ImageStorage;
import org.springframework.stereotype.Component;

/** The school logo: PNG, at most 512 px, file name {@code logo-<uuid>.png} in uploads/school. */
@Component
public class LogoStorage extends ImageStorage {
    public LogoStorage() { super(DataDirs::schoolUploads, "logo-", "png", 512); }
}
