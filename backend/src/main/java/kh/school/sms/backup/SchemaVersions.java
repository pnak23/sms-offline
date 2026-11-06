package kh.school.sms.backup;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import java.io.IOException;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.Comparator;

/** Database schema versions: the one this program ships with, and the one a database file is at. Works before Spring starts. */
public final class SchemaVersions {
    private static volatile Integer latest;

    private SchemaVersions() {}

    /** The highest V&lt;n&gt;__*.sql migration on the class path: a backup made at a higher number comes from a newer program. */
    public static int latestKnown() {
        Integer v = latest;
        if (v == null) {
            try {
                Resource[] all = new PathMatchingResourcePatternResolver().getResources("classpath*:db/migration/V*__*.sql");
                v = Arrays.stream(all).map(r -> r.getFilename()).filter(n -> n != null && n.indexOf("__") > 1)
                        .map(n -> Integer.parseInt(n.substring(1, n.indexOf("__"))))
                        .max(Comparator.naturalOrder()).orElse(0);
            } catch (IOException e) {
                throw new IllegalStateException("cannot list the migrations", e);
            }
            latest = v;
        }
        return v;
    }

    /** The highest migration a database has applied successfully (0 for none). */
    public static int of(Connection c) throws SQLException {
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT MAX(CAST(version AS INTEGER)) FROM flyway_schema_history WHERE success = 1 AND version IS NOT NULL")) {
            if (!rs.next()) return 0;
            int v = rs.getInt(1);
            return rs.wasNull() ? 0 : v;
        }
    }
}
