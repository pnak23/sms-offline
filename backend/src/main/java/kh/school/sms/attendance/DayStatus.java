package kh.school.sms.attendance;

import java.util.Collection;

/**
 * What one student's school DAY was, worked out from the statuses of their records on that date (one per session the class took).
 * Never stored: it is computed from the records that exist, so changing, renaming or switching off a session cannot change the past.
 * <ul>
 *   <li>every record Present: {@link #PRESENT}; every one Leave: {@link #LEAVE}; every one Absent: {@link #ABSENT};</li>
 *   <li>only Present and Late, at least one Late: {@link #LATE} (there for every session, late at least once);</li>
 *   <li>at least one session attended (Present or Late) AND at least one not (Absent or Leave): {@link #PARTIAL}: the morning-present,
 *       afternoon-absent case, which is one day and never two;</li>
 *   <li>none attended, a mix of Absent and Leave: {@link #ABSENT} (an unexcused absence is not hidden by a leave).</li>
 * </ul>
 * A date on which the student has no record at all has no status: it is not a day for them, and "not entered" is not "absent".
 */
public enum DayStatus {
    PRESENT, LATE, PARTIAL, ABSENT, LEAVE;

    public static DayStatus of(Collection<String> statuses) {
        if (statuses.isEmpty()) throw new IllegalArgumentException("a date with no record has no day status");
        boolean attended = false;
        boolean late = false;
        boolean absent = false;
        boolean leave = false;
        for (String status : statuses) {
            switch (status) {
                case "PRESENT" -> attended = true;
                case "LATE" -> {
                    attended = true;
                    late = true;
                }
                case "ABSENT" -> absent = true;
                case "LEAVE" -> leave = true;
                default -> throw new IllegalArgumentException("unknown attendance status " + status);
            }
        }
        if (attended && (absent || leave)) return PARTIAL;
        if (attended) return late ? LATE : PRESENT;
        return absent ? ABSENT : LEAVE;
    }
}
