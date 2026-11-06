package kh.school.sms.exam;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class ExaminationController {
    public record ExamRequest(@NotNull Long academicYearId, @NotBlank @Size(max = 100) String nameKm, @NotBlank String kind, Integer termNo, LocalDate startDate, LocalDate endDate) {}
    public record ExamUpdateRequest(@NotBlank @Size(max = 100) String nameKm, @NotBlank String kind, Integer termNo, LocalDate startDate, LocalDate endDate, long version) {}
    public record SubjectRequest(@NotNull Long gradeId, @NotNull Long subjectId, @NotNull BigDecimal maxScore, @NotNull BigDecimal weight) {}
    public record SubjectUpdateRequest(@NotNull BigDecimal maxScore, @NotNull BigDecimal weight) {}
    public record SubSubjectRequest(@NotNull Long gradeId, @NotNull Long subjectId, @NotNull BigDecimal maxScore) {}
    public record SubSubjectUpdateRequest(@NotNull BigDecimal maxScore) {}
    /** {@code absent} is boxed on purpose: a missing flag means false (Jackson 3 answers 400 for a missing primitive). */
    public record ScoreItem(@NotNull Long enrollmentId, BigDecimal score, Boolean absent, @Size(max = 200) String remark) {}
    public record ScoresRequest(@NotNull Long classId, @NotNull Long subjectId, @NotNull List<@Valid ScoreItem> scores) {}

    private final ExaminationService exams;
    private final ScoreService scores;
    private final ResultsService results;

    public ExaminationController(ExaminationService exams, ScoreService scores, ResultsService results) {
        this.exams = exams;
        this.scores = scores;
        this.results = results;
    }

    @GetMapping("/examinations")
    public List<ExaminationService.Exam> list(@RequestParam(required = false) Long yearId) { return exams.list(yearId); }

    @GetMapping("/examinations/{id}")
    public ExaminationService.Exam get(@PathVariable long id) { return exams.get(id); }

    @PostMapping("/examinations")
    @ResponseStatus(HttpStatus.CREATED)
    public ExaminationService.Exam create(@Valid @RequestBody ExamRequest r) {
        return exams.create(r.academicYearId(), new ExaminationService.Input(r.nameKm(), r.kind(), r.termNo(), r.startDate(), r.endDate()));
    }

    @PutMapping("/examinations/{id}")
    public ExaminationService.Exam update(@PathVariable long id, @Valid @RequestBody ExamUpdateRequest r) {
        return exams.update(id, new ExaminationService.Input(r.nameKm(), r.kind(), r.termNo(), r.startDate(), r.endDate()), r.version());
    }

    @DeleteMapping("/examinations/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        exams.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/examinations/{id}/subjects")
    public List<ExaminationService.ExamSubject> subjects(@PathVariable long id) { return exams.subjects(id); }

    @PostMapping("/examinations/{id}/subjects")
    @ResponseStatus(HttpStatus.CREATED)
    public ExaminationService.ExamSubject addSubject(@PathVariable long id, @Valid @RequestBody SubjectRequest r) {
        return exams.addSubject(id, r.gradeId(), r.subjectId(), r.maxScore(), r.weight());
    }

    @PutMapping("/examinations/{id}/subjects/{subjectRowId}")
    public ExaminationService.ExamSubject updateSubject(@PathVariable long id, @PathVariable long subjectRowId, @Valid @RequestBody SubjectUpdateRequest r) {
        return exams.updateSubject(id, subjectRowId, r.maxScore(), r.weight());
    }

    @DeleteMapping("/examinations/{id}/subjects/{subjectRowId}")
    public ResponseEntity<Void> removeSubject(@PathVariable long id, @PathVariable long subjectRowId) {
        exams.removeSubject(id, subjectRowId);
        return ResponseEntity.noContent().build();
    }

    // sub-subject rows of an examination (a sub-subject joins through its main subject, which must already be in the examination for the grade)

    @PostMapping("/examinations/{id}/sub-subjects")
    @ResponseStatus(HttpStatus.CREATED)
    public ExaminationService.ExamSubject addSubSubject(@PathVariable long id, @Valid @RequestBody SubSubjectRequest r) {
        return exams.addSubSubject(id, r.gradeId(), r.subjectId(), r.maxScore());
    }

    @PutMapping("/examinations/{id}/sub-subjects/{rowId}")
    public ExaminationService.ExamSubject updateSubSubject(@PathVariable long id, @PathVariable long rowId, @Valid @RequestBody SubSubjectUpdateRequest r) {
        return exams.updateSubSubject(id, rowId, r.maxScore());
    }

    @DeleteMapping("/examinations/{id}/sub-subjects/{rowId}")
    public ResponseEntity<Void> removeSubSubject(@PathVariable long id, @PathVariable long rowId) {
        exams.removeSubSubject(id, rowId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/examinations/{id}/scores")
    public ScoreService.ScoreSheet scoreSheet(@PathVariable long id, @RequestParam long classId, @RequestParam long subjectId) {
        return scores.sheet(id, classId, subjectId);
    }

    @PutMapping("/examinations/{id}/scores")
    public ScoreService.ScoreSheet saveScores(@PathVariable long id, @Valid @RequestBody ScoresRequest r) {
        return scores.save(id, r.classId(), r.subjectId(),
                r.scores().stream().map(s -> new ScoreService.ScoreEntry(s.enrollmentId(), s.score(), Boolean.TRUE.equals(s.absent()), s.remark())).toList());
    }

    @GetMapping("/examinations/{id}/results")
    public ResultsService.Results results(@PathVariable long id, @RequestParam long classId) { return results.results(id, classId); }

    @GetMapping("/students/{id}/results")
    public List<ResultsService.StudentExamResult> studentResults(@PathVariable long id) { return results.forStudent(id); }
}
