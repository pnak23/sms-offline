package kh.school.sms.homework;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The school's rule: homework marks are NEVER part of an examination. {@code BackendFlowTest} (order 65) proves it by behaviour (results, ranks and report-card data are byte for
 * byte the same after homework marks are entered); this keeps it true in the source too: nothing that works out or prints an examination's results, a report card, a ranking or
 * the dashboard may so much as mention homework, so no change can quietly start reading its tables.
 */
class HomeworkIndependenceTest {
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
    void noExaminationReportCardRankingOrDashboardCodeMentionsHomework() throws IOException {
        List<Path> files = new java.util.ArrayList<>();
        for (String pkg : List.of("exam", "report", "dashboard")) files.addAll(javaFiles(pkg));
        assertThat(files.size()).as("the scan found the examination, report and dashboard code").isGreaterThan(8);
        List<String> mentions = files.stream().filter(p -> {
            try {
                return Files.readString(p, StandardCharsets.UTF_8).toLowerCase().contains("homework");
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }).map(p -> p.getFileName().toString()).toList();
        assertThat(mentions).as("files that work out or print an examination must not know homework exists").isEmpty();
    }

    @Test
    void theHomeworkModuleDoesNotTouchTheExaminationTables() throws IOException {
        Path service = sources().resolve("homework").resolve("HomeworkService.java");
        assertThat(service).exists();
        String text = Files.readString(service, StandardCharsets.UTF_8);
        // it may read the class roster and the grading helper's number conversion, but never an examination's tables
        for (String table : List.of("student_scores", "sub_subject_scores", "examination_subjects", "examination_sub_subjects", "examinations", "report_card_comments", "grading_scales", "grading_bands")) {
            assertThat(text).as("HomeworkService must not read or write " + table).doesNotContain(table);
        }
    }
}
