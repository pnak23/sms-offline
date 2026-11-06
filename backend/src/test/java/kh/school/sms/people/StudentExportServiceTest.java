package kh.school.sms.people;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class StudentExportServiceTest {
    @Test
    void sheetNamesFollowExcelsRules() {
        assertThat(StudentExportService.sheetName("បញ្ជីសិស្ស")).isEqualTo("បញ្ជីសិស្ស");
        assertThat(StudentExportService.sheetName("a/b\\c?d*e[f]g:h")).as("forbidden characters become spaces").isEqualTo("a b c d e f g h");
        assertThat(StudentExportService.sheetName("x".repeat(40))).as("at most 31 characters").hasSize(31);
        assertThat(StudentExportService.sheetName("   ")).as("never empty").isEqualTo("Students");
    }
}
