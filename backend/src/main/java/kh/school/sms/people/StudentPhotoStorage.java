package kh.school.sms.people;

import kh.school.sms.bootstrap.DataDirs;
import kh.school.sms.common.ImageStorage;
import org.springframework.stereotype.Component;

/** Student photos: JPEG, at most 512 px, file name {@code photo-<uuid>.jpg} in uploads/students. */
@Component
public class StudentPhotoStorage extends ImageStorage {
    public StudentPhotoStorage() { super(DataDirs::studentUploads, "photo-", "jpg", 512); }
}
