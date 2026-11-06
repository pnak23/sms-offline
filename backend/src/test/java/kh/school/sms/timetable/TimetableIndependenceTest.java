package kh.school.sms.timetable;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The timetable is its own module (the owner excluded any attendance integration, exam schedules and anything that reaches a result): nothing that works out or prints an
 * examination, a report card, a ranking, an attendance figure, homework or a fee may so much as mention the timetable, and the timetable code reads none of their tables. A
 * source scan, in the same spirit as {@code HomeworkIndependenceTest}, so that no change can quietly connect them.
 */
class TimetableIndependenceTest {
    private static Path sources() {
        Path here = Path.of("src", "main", "java", "kh", "school", "sms");
        return Files.isDirectory(here) ? here : Path.of("backend").resolve(here);
    }

    private static List<Path> javaFiles(String packageName) throws IOException {
        Path dir = sources().resolve(packageName);
        if (!Files.isDirectory(dir)) return List.of();
        try (Stream<Path> walk = Files.walk(dir)) {
            return walk.filter(p -> p.toString().endsWith(".java")).toList();
        }
    }

    @Test
    void noExaminationReportAttendanceHomeworkFeeOrDashboardCodeMentionsTheTimetable() throws IOException {
        List<Path> files = new ArrayList<>();
        for (String pkg : List.of("exam", "report", "dashboard", "attendance", "homework", "fees")) files.addAll(javaFiles(pkg));
        assertThat(files.size()).as("the scan found the code of the modules the timetable must stay out of").isGreaterThan(20);
        List<String> mentions = files.stream().filter(p -> {
            try {
                String text = Files.readString(p, StandardCharsets.UTF_8);
                return text.contains("kh.school.sms.timetable") || text.contains("timetable_") || text.contains("TimetableService");
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }).map(p -> p.getFileName().toString()).toList();
        assertThat(mentions).as("files that work out results, attendance, homework or fees must not import the timetable code or read its tables").isEmpty();
    }

    @Test
    void theTimetableCodeReadsNoExaminationAttendanceHomeworkOrFeeTable() throws IOException {
        List<Path> files = javaFiles("timetable");
        assertThat(files).as("the timetable package").hasSizeGreaterThanOrEqualTo(4);
        for (Path file : files) {
            String text = Files.readString(file, StandardCharsets.UTF_8);
            for (String table : List.of("student_scores", "sub_subject_scores", "examination_subjects", "examination_sub_subjects", "examinations", "report_card_comments", "grading_scales",
                    "attendance_records", "attendance_sessions", "attendance_periods", "homework", "fee_categories", "student_fees", "fee_payments")) {
                assertThat(text).as(file.getFileName() + " must not read or write " + table).doesNotContain(table);
            }
        }
    }
}
