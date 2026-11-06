package kh.school.sms.report;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/report-cards")
public class ReportCardController {
    /** {@code comment} may be empty (removes the comment); the service limits its length. */
    public record CommentRequest(@NotNull Long examinationId, @NotNull Long enrollmentId, String comment) {}

    private final ReportCardService cards;

    public ReportCardController(ReportCardService cards) { this.cards = cards; }

    /** The cards of a class for one examination; with {@code studentId} only that student's card. */
    @GetMapping("/data")
    public List<ReportCardService.Card> data(@RequestParam long examinationId, @RequestParam long classId, @RequestParam(required = false) Long studentId) {
        return cards.cards(examinationId, classId, studentId);
    }

    @PutMapping("/comment")
    public ResponseEntity<Void> comment(@Valid @RequestBody CommentRequest r) {
        cards.setComment(r.examinationId(), r.enrollmentId(), r.comment());
        return ResponseEntity.noContent().build();
    }
}
