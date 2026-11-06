package kh.school.sms.academic;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import kh.school.sms.common.SequenceService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Subjects are data, never code: added, renamed, activated and deactivated here; the list is not hardcoded anywhere. A subject is a MAIN subject or,
 * with a parent, a SUB-SUBJECT of one (two levels only). A sub-subject is offered to the grades its main subject is offered to, and a name only has to be
 * unique among its siblings. A subject is never moved to another parent: an examination keeps its own copy of the structure, and a wrongly placed
 * sub-subject is deactivated and created again.
 */
@Service
public class SubjectService {
    private final SubjectRepository subjects;
    private final SequenceService sequences;
    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public SubjectService(SubjectRepository subjects, SequenceService sequences, JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.subjects = subjects;
        this.sequences = sequences;
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    public List<Subject> list() { return subjects.findAllByOrderBySortOrderAscIdAsc(); }

    @Transactional
    public Subject create(String nameKm, String nameEn, Long parentId) {
        String km = requiredName(nameKm);
        if (parentId != null) {
            Subject parent = subjects.findById(parentId).orElseThrow(() -> ApiException.validation("parentId", "INVALID"));
            if (parent.getParentId() != null) throw ApiException.validation("parentId", "INVALID");   // a sub-subject cannot have sub-subjects
        }
        if (nameTaken(km, parentId, null)) throw ApiException.duplicate("nameKm");
        Subject s = new Subject();
        s.setCode(String.format("SUBJ-%03d", sequences.next("subject", 0)));   // internal; the user never types a code
        s.setNameKm(km);
        s.setNameEn(KhmerText.name(nameEn));
        s.setParentId(parentId);
        s.setSortOrder(subjects.maxSortOrder() + 1);
        s.setCreatedAt(clock.instant());
        s.setUpdatedAt(clock.instant());
        Subject saved = subjects.saveAndFlush(s);
        // A new main subject starts out offered to every grade, a new sub-subject to the grades its main subject is offered to; Settings -> Academic narrows it down.
        if (parentId == null) {
            jdbc.update("INSERT INTO grade_subjects (grade_id, subject_id, created_at) SELECT id, ?, ? FROM grades", saved.getId(), clock.instant().toString());
        } else {
            jdbc.update("INSERT INTO grade_subjects (grade_id, subject_id, created_at) SELECT grade_id, ?, ? FROM grade_subjects WHERE subject_id = ?",
                    saved.getId(), clock.instant().toString(), parentId);
        }
        audit.record("SUBJECT_CREATED", "subject", saved.getId(), "subject created");
        return saved;
    }

    @Transactional
    public Subject update(long id, String nameKm, String nameEn, long version) {
        Subject s = find(id);
        if (s.getVersion() != version) throw ApiException.staleVersion();
        String km = requiredName(nameKm);
        if (nameTaken(km, s.getParentId(), id)) throw ApiException.duplicate("nameKm");
        s.setNameKm(km);
        s.setNameEn(KhmerText.name(nameEn));
        s.setUpdatedAt(clock.instant());
        Subject saved = subjects.saveAndFlush(s);
        audit.record("SUBJECT_UPDATED", "subject", id, "subject renamed");
        return saved;
    }

    @Transactional
    public Subject setActive(long id, boolean active, long version) {
        Subject s = find(id);
        if (s.getVersion() != version) throw ApiException.staleVersion();
        s.setActive(active);
        s.setUpdatedAt(clock.instant());
        Subject saved = subjects.saveAndFlush(s);
        audit.record("SUBJECT_ACTIVE_CHANGED", "subject", id, active ? "subject activated" : "subject deactivated");
        return saved;
    }

    /**
     * Removes a subject that nothing uses (before the school's official use, for example sample subjects): never one that still has sub-subjects (remove those first),
     * and never one an examination, a class's teachers or homework refer to: that one is switched off instead, so history keeps its subjects.
     */
    @Transactional
    public void remove(long id) {
        Subject s = find(id);
        if (count("SELECT count(*) FROM subjects WHERE parent_id = ?", id) > 0) throw new ApiException(HttpStatus.CONFLICT, "SUBJECT_HAS_SUB_SUBJECTS");
        if (isUsed(id)) throw new ApiException(HttpStatus.CONFLICT, "SUBJECT_IN_USE");
        jdbc.update("DELETE FROM grade_subjects WHERE subject_id = ?", id);
        subjects.delete(s);
        subjects.flush();
        audit.record("SUBJECT_REMOVED", "subject", id, "subject removed (nothing used it)");
    }

    /** Whether an examination (as a main subject or a sub-subject), a class's teachers, homework or a timetable lesson refer to the subject. */
    public boolean isUsed(long id) { return usedIds().contains(id); }

    /** The ids of every subject something refers to: they can be switched off but not removed. */
    public Set<Long> usedIds() {
        return new HashSet<>(jdbc.queryForList("""
                SELECT subject_id FROM examination_subjects UNION SELECT subject_id FROM examination_sub_subjects
                UNION SELECT subject_id FROM teacher_assignments UNION SELECT subject_id FROM homework UNION SELECT subject_id FROM timetable_entries
                """, Long.class));
    }

    private int count(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    /** A name is unique among the main subjects, and among the sub-subjects of one main subject. */
    private boolean nameTaken(String nameKm, Long parentId, Long exceptId) {
        Integer n = parentId == null
                ? jdbc.queryForObject("SELECT count(*) FROM subjects WHERE parent_id IS NULL AND name_km = ? AND id <> ?", Integer.class, nameKm, exceptId == null ? -1L : exceptId)
                : jdbc.queryForObject("SELECT count(*) FROM subjects WHERE parent_id = ? AND name_km = ? AND id <> ?", Integer.class, parentId, nameKm, exceptId == null ? -1L : exceptId);
        return n != null && n > 0;
    }

    private Subject find(long id) { return subjects.findById(id).orElseThrow(ApiException::notFound); }

    private static String requiredName(String raw) {
        String name = KhmerText.name(raw);
        if (name == null) throw ApiException.validation("nameKm", "REQUIRED");
        return name;
    }
}
