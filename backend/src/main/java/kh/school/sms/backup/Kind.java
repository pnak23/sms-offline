package kh.school.sms.backup;

/** Why a backup exists. Manual ones live in backups/, every automatic one in backups/auto/ and is rotated. */
public enum Kind {
    MANUAL(Integer.MAX_VALUE),
    /** Made when the program closes and the newest backup is more than a day old. */
    AUTO(10),
    /** Made just before an upgrade changes the database. */
    PRE_MIGRATION(5),
    /** Made just before a restore replaces the current data. */
    PRE_RESTORE(3);

    private final int keep;

    Kind(int keep) { this.keep = keep; }

    /** How many of this kind are kept (the newest ones). */
    public int keep() { return keep; }

    public boolean automatic() { return this != MANUAL; }

    public static Kind parse(String text, Kind fallback) {
        if (text != null) for (Kind k : values()) if (k.name().equals(text)) return k;
        return fallback;
    }
}
