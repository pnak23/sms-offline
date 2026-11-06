package kh.school.sms.timetable;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Copying a timetable, in two steps: a PREVIEW that changes nothing and lists every lesson that would be copied and every lesson that would be skipped with the reason, and
 * the copy itself, which makes exactly the plan the preview showed (the same code computes both, so they cannot differ). A copy only READS its source, which may be a closed
 * year, and writes only into an open target: a source is never modified. A lesson is never copied half-filled: it needs its own subject AND teacher, and a teacher is never
 * put in two classes at once, so what cannot be copied is skipped and named.
 * <ul>
 *   <li><b>Class to class</b> (the same grade, the same year): the subjects are taken and every teacher comes from the TARGET class's own assignment, never from the source
 *   lesson (two classes sharing a subject teacher would clash at once, and then the lesson is skipped with that reason). Without "replace" only empty cells are filled.</li>
 *   <li><b>Year to year</b> (into an empty year): the school days, the slots and, for every class that exists in both years (the same grade and name), its lessons. The
 *   teacher is the target class's assignment for the subject, else the source lesson's teacher if still active.</li>
 * </ul>
 */
@Service
public class TimetableCopyService {
    public record CopiedLesson(long classId, String className, String gradeName, int dayOfWeek, String slotName, long subjectId, String subjectName, long teacherId, String teacherName) {}
    /** {@code reason} is a code (SUBJECT_NOT_OFFERED, NO_TEACHER_ASSIGNED, TEACHER_INACTIVE, TEACHER_CLASH, CELL_OCCUPIED, DAY_DISABLED, CLASS_NOT_IN_YEAR); {@code detail} names the class of a clash. */
    public record SkippedLesson(String className, String gradeName, int dayOfWeek, String slotName, String subjectName, String reason, String detail) {}
    /** {@code slots}: slots copied (a year copy); {@code replaced}: lessons of the target class that are (or would be) removed by "replace". */
    public record CopyResult(boolean preview, int slots, int replaced, List<CopiedLesson> copied, List<SkippedLesson> skipped) {}

    private record Planned(long classId, int day, long slotId, long subjectId, long teacherId) {}
    private record SourceLesson(long classId, int day, long slotId, long subjectId, long teacherId) {}
    private record Assignment(long teacherId, boolean active) {}

    private static final RowMapper<SourceLesson> SOURCE = (rs, n) -> new SourceLesson(rs.getLong(1), rs.getInt(2), rs.getLong(3), rs.getLong(4), rs.getLong(5));

    private final JdbcTemplate jdbc;
    private final TimetableSettingsService settings;
    private final TimetableService timetable;
    private final AuditService audit;
    private final Clock clock;

    public TimetableCopyService(JdbcTemplate jdbc, TimetableSettingsService settings, TimetableService timetable, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.settings = settings;
        this.timetable = timetable;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- class to class -----------------------------------------------------------------------------------------------

    @Transactional
    public CopyResult copyClass(long targetClassId, long sourceClassId, boolean replace, boolean preview) {
        TimetableService.ClassInfo target = timetable.classInfo(targetClassId);
        TimetableService.ClassInfo source = timetable.classInfo(sourceClassId);
        if (targetClassId == sourceClassId) throw ApiException.validation("sourceClassId", "INVALID");
        settings.openYear(target.yearId());
        if (source.yearId() != target.yearId()) throw ApiException.validation("sourceClassId", "TIMETABLE_YEAR_MISMATCH");
        if (source.gradeId() != target.gradeId()) throw ApiException.validation("sourceClassId", "TIMETABLE_DIFFERENT_GRADE");

        long yearId = target.yearId();
        Map<Long, TimetableSettingsService.Slot> slots = slotsById(yearId);
        Set<Integer> days = new HashSet<>(settings.days(yearId));
        Names names = new Names();
        Map<String, String> busy = busyTeachers(yearId, replace ? targetClassId : -1);
        Set<String> occupied = new HashSet<>();
        int existing = 0;
        List<String> removedJson = new ArrayList<>();
        for (SourceLesson l : lessonsOf(targetClassId)) {
            existing++;
            if (!replace) occupied.add(l.day() + "|" + l.slotId());
            else removedJson.add(TimetableService.lessonJson(targetClassId, l.day(), l.slotId(), l.subjectId(), l.teacherId()));
        }
        Set<Long> offered = offeredSubjects(target.gradeId());
        Map<Long, Assignment> assigned = assignments(targetClassId);
        String targetLabel = target.nameKm();

        List<Planned> planned = new ArrayList<>();
        List<CopiedLesson> copied = new ArrayList<>();
        List<SkippedLesson> skipped = new ArrayList<>();
        for (SourceLesson l : lessonsOf(sourceClassId)) {
            String slotName = slots.get(l.slotId()).nameKm();
            String reason = null;
            String detail = null;
            Long teacher = null;
            if (!days.contains(l.day())) reason = "DAY_DISABLED";
            else if (!offered.contains(l.subjectId())) reason = "SUBJECT_NOT_OFFERED";
            else if (occupied.contains(l.day() + "|" + l.slotId())) reason = "CELL_OCCUPIED";
            else {
                Assignment a = assigned.get(l.subjectId());
                if (a == null) reason = "NO_TEACHER_ASSIGNED";
                else if (!a.active()) reason = "TEACHER_INACTIVE";
                else {
                    String other = busy.get(a.teacherId() + "|" + l.day() + "|" + l.slotId());
                    if (other != null) { reason = "TEACHER_CLASH"; detail = other; }
                    else teacher = a.teacherId();
                }
            }
            if (reason != null) {
                skipped.add(new SkippedLesson(targetLabel, target.gradeName(), l.day(), slotName, names.subject(l.subjectId()), reason, detail));
                continue;
            }
            busy.put(teacher + "|" + l.day() + "|" + l.slotId(), target.gradeName() + " " + targetLabel);
            occupied.add(l.day() + "|" + l.slotId());
            planned.add(new Planned(targetClassId, l.day(), l.slotId(), l.subjectId(), teacher));
            copied.add(new CopiedLesson(targetClassId, targetLabel, target.gradeName(), l.day(), slotName, l.subjectId(), names.subject(l.subjectId()), teacher, names.teacher(teacher)));
        }

        int replaced = replace ? existing : 0;
        if (!preview) {
            if (replace) jdbc.update("DELETE FROM timetable_entries WHERE class_id = ?", targetClassId);
            insert(planned);
            audit.record("TIMETABLE_CLASS_COPIED", "class", targetClassId, "timetable copied from another class",
                    "{\"fromClassId\":" + sourceClassId + ",\"replaced\":" + replaced + ",\"removed\":" + removedJson + "}",
                    "{\"copied\":" + planned.size() + ",\"skipped\":" + skipped.size() + "}");
        }
        return new CopyResult(preview, 0, replaced, copied, skipped);
    }

    // ---- year to year -------------------------------------------------------------------------------------------------

    @Transactional
    public CopyResult copyYear(long toYearId, long fromYearId, boolean preview) {
        if (toYearId == fromYearId) throw ApiException.validation("fromYearId", "INVALID");
        settings.year(fromYearId);          // may be closed: it is only read
        settings.openYear(toYearId);
        List<TimetableSettingsService.Slot> have = settings.slots(toYearId);
        Integer lessonsThere = jdbc.queryForObject("SELECT count(*) FROM timetable_entries e JOIN classes c ON c.id = e.class_id WHERE c.academic_year_id = ?", Integer.class, toYearId);
        if (!have.isEmpty() || (lessonsThere != null && lessonsThere > 0)) throw new ApiException(HttpStatus.CONFLICT, "TIMETABLE_YEAR_NOT_EMPTY");

        List<TimetableSettingsService.Slot> sourceSlots = settings.slots(fromYearId);
        Map<Long, TimetableSettingsService.Slot> slots = slotsById(fromYearId);
        Names names = new Names();
        Map<String, Long> targetClasses = new HashMap<>();     // "gradeId|name" -> class id, in the target year
        Map<Long, TimetableService.ClassInfo> classInfo = new HashMap<>();
        jdbc.query("SELECT id FROM classes WHERE academic_year_id = ?", (rs, n) -> rs.getLong(1), toYearId).forEach(id -> {
            TimetableService.ClassInfo c = timetable.classInfo(id);
            targetClasses.put(c.gradeId() + "|" + c.nameKm(), id);
            classInfo.put(id, c);
        });
        Map<Long, Set<Long>> offeredByGrade = new HashMap<>();
        Map<Long, Map<Long, Assignment>> assignedByClass = new HashMap<>();
        Map<String, String> busy = new HashMap<>();

        List<SourceLesson> sourceLessons = jdbc.query("""
                SELECT e.class_id, e.day_of_week, e.slot_id, e.subject_id, e.teacher_id FROM timetable_entries e
                JOIN timetable_slots s ON s.id = e.slot_id WHERE s.academic_year_id = ? ORDER BY s.start_time, e.day_of_week, e.class_id
                """, SOURCE, fromYearId);

        List<Planned> planned = new ArrayList<>();      // classId here is the TARGET class
        List<CopiedLesson> copied = new ArrayList<>();
        List<SkippedLesson> skipped = new ArrayList<>();
        for (SourceLesson l : sourceLessons) {
            TimetableService.ClassInfo from = timetable.classInfo(l.classId());
            String slotName = slots.get(l.slotId()).nameKm();
            String subjectName = names.subject(l.subjectId());
            Long targetId = targetClasses.get(from.gradeId() + "|" + from.nameKm());
            if (targetId == null) {
                skipped.add(new SkippedLesson(from.nameKm(), from.gradeName(), l.day(), slotName, subjectName, "CLASS_NOT_IN_YEAR", null));
                continue;
            }
            TimetableService.ClassInfo to = classInfo.get(targetId);
            String reason = null;
            String detail = null;
            Long teacher = null;
            if (!offeredByGrade.computeIfAbsent(to.gradeId(), this::offeredSubjects).contains(l.subjectId())) reason = "SUBJECT_NOT_OFFERED";
            else {
                Assignment a = assignedByClass.computeIfAbsent(targetId, this::assignments).get(l.subjectId());
                boolean previousActive = names.teacherActive(l.teacherId());
                long chosen;
                if (a != null && a.active()) chosen = a.teacherId();
                else if (previousActive) chosen = l.teacherId();
                else { chosen = -1; reason = a != null ? "TEACHER_INACTIVE" : "NO_TEACHER_ASSIGNED"; }
                if (reason == null) {
                    String other = busy.get(chosen + "|" + l.day() + "|" + l.slotId());
                    if (other != null) { reason = "TEACHER_CLASH"; detail = other; }
                    else teacher = chosen;
                }
            }
            if (reason != null) {
                skipped.add(new SkippedLesson(to.nameKm(), to.gradeName(), l.day(), slotName, subjectName, reason, detail));
                continue;
            }
            busy.put(teacher + "|" + l.day() + "|" + l.slotId(), to.gradeName() + " " + to.nameKm());
            planned.add(new Planned(targetId, l.day(), l.slotId(), l.subjectId(), teacher));
            copied.add(new CopiedLesson(targetId, to.nameKm(), to.gradeName(), l.day(), slotName, l.subjectId(), subjectName, teacher, names.teacher(teacher)));
        }

        if (!preview) {
            if (sourceSlots.isEmpty()) throw new ApiException(HttpStatus.CONFLICT, "TIMETABLE_NOTHING_TO_COPY");
            String now = clock.instant().toString();
            // the school days: the source's own choice, or the default (no rows) if it has made none
            jdbc.update("DELETE FROM timetable_days WHERE academic_year_id = ?", toYearId);
            jdbc.update("INSERT INTO timetable_days (academic_year_id, day_of_week) SELECT ?, day_of_week FROM timetable_days WHERE academic_year_id = ?", toYearId, fromYearId);
            Map<Long, Long> newSlot = new HashMap<>();
            for (TimetableSettingsService.Slot s : sourceSlots) {
                jdbc.update("INSERT INTO timetable_slots (academic_year_id, name_km, start_time, end_time, is_break, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        toYearId, s.nameKm(), s.startTime(), s.endTime(), s.breakSlot() ? 1 : 0, now, now);
                newSlot.put(s.id(), jdbc.queryForObject("SELECT id FROM timetable_slots WHERE academic_year_id = ? AND name_km = ?", Long.class, toYearId, s.nameKm()));
            }
            List<Planned> mapped = new ArrayList<>();
            for (Planned p : planned) mapped.add(new Planned(p.classId(), p.day(), newSlot.get(p.slotId()), p.subjectId(), p.teacherId()));
            insert(mapped);
            audit.record("TIMETABLE_YEAR_COPIED", "academic_year", toYearId, "timetable copied from another academic year", "{\"fromYearId\":" + fromYearId + "}",
                    "{\"slots\":" + sourceSlots.size() + ",\"copied\":" + planned.size() + ",\"skipped\":" + skipped.size() + "}");
        }
        return new CopyResult(preview, sourceSlots.size(), 0, copied, skipped);
    }

    // ---- helpers --------------------------------------------------------------------------------------------------------

    private void insert(List<Planned> lessons) {
        String now = clock.instant().toString();
        for (Planned p : lessons) {
            jdbc.update("INSERT INTO timetable_entries (class_id, slot_id, day_of_week, subject_id, teacher_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    p.classId(), p.slotId(), p.day(), p.subjectId(), p.teacherId(), now, now);
        }
    }

    private Map<Long, TimetableSettingsService.Slot> slotsById(long yearId) {
        Map<Long, TimetableSettingsService.Slot> m = new HashMap<>();
        for (TimetableSettingsService.Slot s : settings.slots(yearId)) m.put(s.id(), s);
        return m;
    }

    private List<SourceLesson> lessonsOf(long classId) {
        return jdbc.query("SELECT e.class_id, e.day_of_week, e.slot_id, e.subject_id, e.teacher_id FROM timetable_entries e JOIN timetable_slots s ON s.id = e.slot_id WHERE e.class_id = ? ORDER BY s.start_time, e.day_of_week",
                SOURCE, classId);
    }

    /** "teacher|day|slot" -> the class the teacher is already in, for the whole year (the lessons of {@code exceptClassId} are about to be replaced, so they do not count). */
    private Map<String, String> busyTeachers(long yearId, long exceptClassId) {
        Map<String, String> busy = new HashMap<>();
        jdbc.query("""
                SELECT e.teacher_id, e.day_of_week, e.slot_id, g.name_km, c.name_km FROM timetable_entries e
                JOIN classes c ON c.id = e.class_id JOIN grades g ON g.id = c.grade_id JOIN timetable_slots s ON s.id = e.slot_id
                WHERE s.academic_year_id = ? AND e.class_id <> ?
                """, (rs, n) -> {
                    busy.put(rs.getLong(1) + "|" + rs.getInt(2) + "|" + rs.getLong(3), rs.getString(4) + " " + rs.getString(5));
                    return 0;
                }, yearId, exceptClassId);
        return busy;
    }

    /** The active main subjects the grade studies: the only ones a lesson may use. */
    private Set<Long> offeredSubjects(long gradeId) {
        return new HashSet<>(jdbc.queryForList("""
                SELECT gs.subject_id FROM grade_subjects gs JOIN subjects s ON s.id = gs.subject_id WHERE gs.grade_id = ? AND s.is_active = 1 AND s.parent_id IS NULL
                """, Long.class, gradeId));
    }

    /** Subject id -> the teacher the class has for it (the default teacher of a cell). */
    private Map<Long, Assignment> assignments(long classId) {
        Map<Long, Assignment> m = new HashMap<>();
        jdbc.query("SELECT a.subject_id, a.teacher_id, t.status FROM teacher_assignments a JOIN teachers t ON t.id = a.teacher_id WHERE a.class_id = ?",
                (rs, n) -> {
                    m.put(rs.getLong(1), new Assignment(rs.getLong(2), "ACTIVE".equals(rs.getString(3))));
                    return 0;
                }, classId);
        return m;
    }

    /** Subject and teacher names (and whether a teacher is still active), loaded once per plan. */
    private final class Names {
        private final Map<Long, String> subjects = new HashMap<>();
        private final Map<Long, String> teachers = new HashMap<>();
        private final Set<Long> activeTeachers = new HashSet<>();

        Names() {
            jdbc.query("SELECT id, name_km FROM subjects", (rs, n) -> { subjects.put(rs.getLong(1), rs.getString(2)); return 0; });
            jdbc.query("SELECT id, name_km, status FROM teachers", (rs, n) -> {
                teachers.put(rs.getLong(1), rs.getString(2));
                if ("ACTIVE".equals(rs.getString(3))) activeTeachers.add(rs.getLong(1));
                return 0;
            });
        }

        String subject(long id) { return subjects.getOrDefault(id, ""); }
        String teacher(long id) { return teachers.getOrDefault(id, ""); }
        boolean teacherActive(long id) { return activeTeachers.contains(id); }
    }
}
