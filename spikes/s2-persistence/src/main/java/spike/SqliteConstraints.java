package spike;

import org.sqlite.SQLiteException;

import java.util.Optional;

/**
 * Spring does not translate SQLite constraint errors (SQLState is null), so we classify them ourselves by
 * walking the cause chain for the driver exception (primary result code 19 = SQLITE_CONSTRAINT).
 */
public final class SqliteConstraints {
    public enum Kind { UNIQUE, FOREIGN_KEY, CHECK, NOT_NULL, OTHER }

    /** @param detail e.g. "subjects.code" for UNIQUE / NOT NULL, or the CHECK expression; may be null */
    public record Violation(Kind kind, String detail) {}

    private SqliteConstraints() {}

    public static Optional<Violation> find(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c instanceof SQLiteException se && se.getErrorCode() == 19) {
                return Optional.of(classify(se));
            }
            if (c.getCause() == c) break;
        }
        return Optional.empty();
    }

    private static Violation classify(SQLiteException se) {
        String code = se.getResultCode().name();
        String msg = se.getMessage() == null ? "" : se.getMessage();
        if (code.equals("SQLITE_CONSTRAINT_UNIQUE") || code.equals("SQLITE_CONSTRAINT_PRIMARYKEY")) {
            return new Violation(Kind.UNIQUE, after(msg, "constraint failed: "));
        }
        if (code.equals("SQLITE_CONSTRAINT_FOREIGNKEY") || code.equals("SQLITE_CONSTRAINT_TRIGGER")
                || msg.contains("FOREIGN KEY")) {
            return new Violation(Kind.FOREIGN_KEY, null);
        }
        if (code.equals("SQLITE_CONSTRAINT_NOTNULL")) {
            return new Violation(Kind.NOT_NULL, after(msg, "constraint failed: "));
        }
        if (code.equals("SQLITE_CONSTRAINT_CHECK")) {
            return new Violation(Kind.CHECK, after(msg, "constraint failed: "));
        }
        return new Violation(Kind.OTHER, null);
    }

    private static String after(String msg, String marker) {
        int i = msg.lastIndexOf(marker);
        if (i < 0) return null;
        String rest = msg.substring(i + marker.length()).trim();
        return rest.endsWith(")") ? rest.substring(0, rest.length() - 1) : rest;
    }
}
