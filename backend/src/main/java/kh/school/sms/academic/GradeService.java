package kh.school.sms.academic;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Grades 1-6 are fixed (seeded); what a school can change is which subjects each grade studies. */
@Service
public class GradeService {
    public record GradeView(Grade grade, List<Long> subjectIds) {}

    private final GradeRepository grades;
    private final SubjectRepository subjects;
    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public GradeService(GradeRepository grades, SubjectRepository subjects, JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.grades = grades;
        this.subjects = subjects;
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    public List<GradeView> list() {
        Map<Long, List<Long>> bySubject = new HashMap<>();
        jdbc.query("SELECT grade_id, subject_id FROM grade_subjects ORDER BY grade_id, subject_id",
                rs -> { bySubject.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>()).add(rs.getLong(2)); });
        return grades.findAllByOrderByLevelAsc().stream()
                .map(g -> new GradeView(g, bySubject.getOrDefault(g.getId(), List.of()))).toList();
    }

    /** Replaces the set of subjects this grade studies. Unknown subject ids reject the whole request. */
    @Transactional
    public GradeView setSubjects(long gradeId, List<Long> subjectIds) {
        Grade grade = grades.findById(gradeId).orElseThrow(ApiException::notFound);
        Set<Long> ids = new LinkedHashSet<>(subjectIds);
        if (!ids.isEmpty() && subjects.countByIdIn(ids) != ids.size()) throw ApiException.validation("subjectIds", "INVALID");
        // a sub-subject is studied in a grade only if its main subject is
        for (Subject s : subjects.findAllById(ids)) {
            if (s.getParentId() != null && !ids.contains(s.getParentId())) throw ApiException.validation("subjectIds", "SUB_WITHOUT_MAIN");
        }
        jdbc.update("DELETE FROM grade_subjects WHERE grade_id = ?", gradeId);
        String now = clock.instant().toString();
        for (Long subjectId : ids) {
            jdbc.update("INSERT INTO grade_subjects (grade_id, subject_id, created_at) VALUES (?, ?, ?)", gradeId, subjectId, now);
        }
        audit.record("GRADE_SUBJECTS_CHANGED", "grade", gradeId, "subjects studied by the grade changed");
        return new GradeView(grade, ids.stream().sorted().toList());
    }
}
