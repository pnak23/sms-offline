package kh.school.sms.backup;

/**
 * Why a backup, a restore or a verification failed: a stable code the UI turns into Khmer. The message is only the code (never a
 * path or a name), so it is safe to log. Plain Java on purpose: the restore runs before Spring starts.
 */
public final class BackupException extends RuntimeException {
    private final String code;

    public BackupException(String code) {
        super(code);
        this.code = code;
    }

    public BackupException(String code, Throwable cause) {
        super(code, cause);
        this.code = code;
    }

    public String code() { return code; }
}
