package kh.school.sms;

import kh.school.sms.attendance.AttendancePeriodService;
import kh.school.sms.auth.RecoveryKeys;
import kh.school.sms.backup.BackupArchive;
import kh.school.sms.backup.BackupFixture;
import kh.school.sms.bootstrap.DataDirs;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import java.util.zip.ZipFile;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * One ordered scenario over real HTTP against a real SQLite file. The data directory's name contains Khmer
 * characters and a space on purpose: the backend must work from any Windows user profile path.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {"sms.launch-secret=test-launch-secret-0123456789"})
@Import(BackendFlowTest.ClockConfig.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class BackendFlowTest {
    static final String SECRET = "test-launch-secret-0123456789";
    static final MutableClock CLOCK = new MutableClock();
    static final Pattern FORMATTED_KEY = Pattern.compile("^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$");
    static final Path DATA_ROOT;

    static {
        try {
            DATA_ROOT = DataDirs.prepare(Files.createTempDirectory("sms ទិន្នន័យ "));
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @TestConfiguration
    static class ClockConfig {
        @Bean @Primary MutableClock testClock() { return CLOCK; }
    }

    // everything the scenario ever used as a secret; the final test proves none of it was logged or audited
    static final List<String> SECRETS = new ArrayList<>();

    static final String PW1 = "Khmer-School-Pass-2026";
    static final String PW2 = "ពាក្យសម្ងាត់ខ្មែរ-2026";       // Khmer password, 3 bytes per character, still <= 72 bytes
    static final String PW3 = "Third-Pass-Word-2026";
    static String token1, token2, token3, token4, key1, key2, key3;

    @Value("${local.server.port}") int port;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;

    final HttpClient http = HttpClient.newHttpClient();

    record Resp(int status, String body, java.net.http.HttpHeaders headers, byte[] bytes) {
        JsonNode json(JsonMapper m) { return m.readTree(body); }
    }

    @Test @Order(66)
    void theWeeklyTimetableStartsEmptyEveryRuleHoldsCopiesPreviewFirstAndNoHistoricalRecordChanges() throws Exception {
        String t = login("admin.sokha", PW3).json(json).path("token").asString();
        assertThat(send("GET", "/api/v1/timetable/settings?yearId=1", null, null).status()).as("needs a session").isEqualTo(401);
        assertThat(countRows("timetable_slots") + countRows("timetable_days") + countRows("timetable_entries")).as("nothing is invented: a school starts with an empty timetable").isZero();

        // ---- arrangement: four open academic years, grade 6 with four main subjects, five teachers (one inactive), classes with their assigned teachers
        long yA = ttYear(t, "TT ក", "2031-11-01", "2032-08-31"), yB = ttYear(t, "TT ខ", "2032-11-01", "2033-08-31");
        long yC = ttYear(t, "TT គ", "2033-11-01", "2034-08-31"), yD = ttYear(t, "TT ឃ", "2034-11-01", "2035-08-31");
        long g6 = gradeIdFor(t, 6), g5 = gradeIdFor(t, 5);
        long math = ttSubject(t, "TT គណិតវិទ្យា", null), khmer = ttSubject(t, "TT ភាសាខ្មែរ", null), science = ttSubject(t, "TT វិទ្យាសាស្ត្រ", null), art = ttSubject(t, "TT សិល្បៈ", null);
        long notOffered = ttSubject(t, "TT មិនបង្រៀន", null), mathSub = ttSubject(t, "TT ផ្នែកគណិត", math);
        assertThat(send("PUT", "/api/v1/grades/" + g6 + "/subjects", t, json.writeValueAsString(Map.of("subjectIds", List.of(math, khmer, science, art)))).status()).isIn(200, 204);
        long t1 = ttTeacher(t, "TT គ្រូ ១"), t2 = ttTeacher(t, "TT គ្រូ ២"), t3 = ttTeacher(t, "TT គ្រូ ៣"), t4 = ttTeacher(t, "TT គ្រូ ៤"), t5 = ttTeacher(t, "TT គ្រូ ៥");
        jdbc.update("update teachers set status = 'INACTIVE' where id = ?", t5);
        long c1 = ttClass(t, yA, g6, "ក"), c2 = ttClass(t, yA, g6, "ខ"), c3 = ttClass(t, yA, g6, "គ"), cG5 = ttClass(t, yA, g5, "ក"), cB = ttClass(t, yB, g6, "ក"), cC = ttClass(t, yC, g6, "ក");
        assertThat(send("PUT", "/api/v1/classes/" + c1 + "/teachers", t, assignments(math, t1, khmer, t2, science, t4)).status()).isIn(200, 204);
        assertThat(send("PUT", "/api/v1/classes/" + c2 + "/teachers", t, assignments(math, t1, khmer, t3, science, t4)).status()).isIn(200, 204);
        assertThat(send("PUT", "/api/v1/classes/" + c3 + "/teachers", t, assignments(math, t1, khmer, t3)).status()).isIn(200, 204);
        assertThat(send("PUT", "/api/v1/classes/" + cC + "/teachers", t, assignments(math, t1, khmer, t2)).status()).isIn(200, 204);
        jdbc.update("insert into students (student_code, name_km, gender, date_of_birth, enrollment_date, created_at, updated_at) values ('TT-S1', 'TT សិស្ស ១', 'FEMALE', '2024-01-01', '2031-11-01', '2031-11-01T00:00:00Z', '2031-11-01T00:00:00Z'), ('TT-S2', 'TT សិស្ស ២', 'MALE', '2024-01-02', '2031-11-01', '2031-11-01T00:00:00Z', '2031-11-01T00:00:00Z')");
        long stuIn = jdbc.queryForObject("select id from students where student_code = 'TT-S1'", Long.class), stuOut = jdbc.queryForObject("select id from students where student_code = 'TT-S2'", Long.class);
        jdbc.update("insert into enrollments (student_id, academic_year_id, class_id, status, enrolled_on, created_at, updated_at) values (?, ?, ?, 'ACTIVE', '2031-11-01', '2031-11-01T00:00:00Z', '2031-11-01T00:00:00Z')", stuIn, yA, c1);

        // ---- 1. the empty / unconfigured state is a normal answer, not an error
        JsonNode s0 = send("GET", "/api/v1/timetable/settings?yearId=" + yA, t, null).json(json);
        assertThat(s0.path("slots").size()).isZero();
        assertThat(s0.path("daysAreDefault").asBoolean()).as("no school days chosen: the default week").isTrue();
        assertThat(ttInts(s0.path("days"))).containsExactly(1, 2, 3, 4, 5);
        Resp emptyClass = send("GET", "/api/v1/timetable/classes/" + c1, t, null);
        assertThat(emptyClass.status()).as("a class with no timetable is not an error").isEqualTo(200);
        JsonNode v0 = emptyClass.json(json);
        assertThat(v0.path("grid").path("slots").size()).isZero();
        assertThat(v0.path("grid").path("lessons").size()).isZero();
        assertThat(v0.path("yearClosed").asBoolean()).isFalse();
        Map<Long, JsonNode> subjectsOf = ttById(v0.path("subjects"));
        assertThat(subjectsOf.keySet()).as("the main subjects the grade studies, nothing else").containsExactlyInAnyOrder(math, khmer, science, art);
        assertThat(subjectsOf.get(math).path("teacherId").asLong()).as("the class's own teacher is the default").isEqualTo(t1);
        assertThat(subjectsOf.get(art).path("teacherId").isNull()).as("no assigned teacher for art").isTrue();
        Map<Long, JsonNode> teachersOf = ttById(v0.path("teachers"));
        assertThat(teachersOf.keySet()).contains(t1, t2, t3, t4).doesNotContain(t5);
        assertThat(teachersOf.get(t1).path("assigned").asBoolean() && teachersOf.get(t2).path("assigned").asBoolean() && teachersOf.get(t4).path("assigned").asBoolean() && !teachersOf.get(t3).path("assigned").asBoolean()).isTrue();
        JsonNode tv0 = send("GET", "/api/v1/timetable/teachers/" + t1 + "?yearId=" + yA, t, null).json(json);
        assertThat(tv0.path("lessonCount").asInt()).isZero();
        assertThat(tv0.path("grid").path("lessons").size()).isZero();
        assertThat(send("GET", "/api/v1/timetable/teacher-loads?yearId=" + yA, t, null).json(json).size()).isZero();
        assertThat(send("GET", "/api/v1/timetable/students/" + stuIn + "?yearId=" + yA, t, null).json(json).path("grid").path("lessons").size()).isZero();
        assertThat(send("GET", "/api/v1/timetable/classes/999999", t, null).status()).isEqualTo(404);
        assertThat(send("GET", "/api/v1/timetable/settings?yearId=999999", t, null).status()).isEqualTo(404);
        assertThat(send("GET", "/api/v1/timetable/teachers/999999?yearId=" + yA, t, null).status()).isEqualTo(404);
        assertThat(send("GET", "/api/v1/timetable/students/999999?yearId=" + yA, t, null).status()).isEqualTo(404);
        assertThat(countRows("timetable_slots") + countRows("timetable_days") + countRows("timetable_entries")).as("reading changed nothing").isZero();

        // ---- 2. the school days (Monday to Friday until the school chooses)
        assertThat(fieldCodes(send("PUT", "/api/v1/timetable/days", t, ttDays(yA)))).as("at least one day").containsExactly("days:REQUIRED");
        assertThat(fieldCodes(send("PUT", "/api/v1/timetable/days", t, ttDays(yA, 0)))).containsExactly("days:INVALID");
        assertThat(fieldCodes(send("PUT", "/api/v1/timetable/days", t, ttDays(yA, 8)))).containsExactly("days:INVALID");
        assertThat(fieldCodes(send("PUT", "/api/v1/timetable/days", t, ttDays(yA, 1, 1)))).as("a day twice").containsExactly("days:INVALID");

        // ---- 3. the slots, typed by the school (these names and times are test values; the program ships none)
        assertThat(fieldCodes(ttSlot(t, yA, "  ", "07:00", "07:45", false))).containsExactly("nameKm:NotBlank");
        assertThat(fieldCodes(ttSlot(t, yA, "ម៉ោង ១", "7:00", "07:45", false))).containsExactly("startTime:INVALID_TIME");
        assertThat(fieldCodes(ttSlot(t, yA, "ម៉ោង ១", "07:00", "24:00", false))).containsExactly("endTime:INVALID_TIME");
        assertThat(fieldCodes(ttSlot(t, yA, "ម៉ោង ១", "07:00", "", false))).containsExactly("endTime:NotBlank");
        assertThat(fieldCodes(ttSlot(t, yA, "ម៉ោង ១", "07:45", "07:00", false))).containsExactly("endTime:END_TIME_BEFORE_START");
        assertThat(fieldCodes(ttSlot(t, yA, "ម៉ោង ១", "07:00", "07:00", false))).containsExactly("endTime:END_TIME_BEFORE_START");
        assertThat(ttSlot(t, 999999, "ម៉ោង ១", "07:00", "07:45", false).status()).as("a year that does not exist").isEqualTo(422);
        assertThat(countRows("timetable_slots")).as("a refused slot stores nothing").isZero();
        Resp r1 = ttSlot(t, yA, "ម៉ោង ១", "07:00", "07:45", false);
        assertThat(r1.status()).as(r1.body()).isEqualTo(201);
        long s1 = ttId(r1);
        long s3 = ttId(ttSlot(t, yA, "ម៉ោង ៣", "08:45", "09:30", false));                // created out of order on purpose
        long s2 = ttId(ttSlot(t, yA, "ម៉ោង ២", "07:45", "08:30", false));                // adjacent to the first: not an overlap
        long br = ttId(ttSlot(t, yA, "សម្រាក", "08:30", "08:45", true));                  // a break
        Resp dupName = ttSlot(t, yA, "ម៉ោង ១", "10:00", "10:45", false);
        assertThat(dupName.status()).isEqualTo(409);
        assertThat(fieldCodes(dupName)).containsExactly("nameKm:DUPLICATE");
        assertThat(fieldCodes(ttSlot(t, yA, "ជាន់គ្នា", "07:30", "08:00", false))).as("slots of a year never overlap").containsExactly("startTime:TIMETABLE_SLOT_OVERLAP");
        assertThat(fieldCodes(ttSlot(t, yA, "ជាន់គ្នា", "06:00", "07:01", false))).containsExactly("startTime:TIMETABLE_SLOT_OVERLAP");
        assertThat(fieldCodes(ttSlot(t, yA, "ជាន់គ្នា", "08:40", "08:50", false))).as("a break counts too").containsExactly("startTime:TIMETABLE_SLOT_OVERLAP");
        JsonNode s1State = send("GET", "/api/v1/timetable/settings?yearId=" + yA, t, null).json(json);
        List<String> slotNames = new ArrayList<>();
        s1State.path("slots").forEach(s -> slotNames.add(s.path("nameKm").asString()));
        assertThat(slotNames).as("listed by start time, not by creation").containsExactly("ម៉ោង ១", "ម៉ោង ២", "សម្រាក", "ម៉ោង ៣");
        assertThat(ttById(s1State.path("slots")).get(br).path("breakSlot").asBoolean()).isTrue();
        // an edit, with the optimistic lock
        long extra = ttId(ttSlot(t, yA, "បន្ថែម", "10:00", "10:30", false));
        JsonNode extraNode = ttById(send("GET", "/api/v1/timetable/settings?yearId=" + yA, t, null).json(json).path("slots")).get(extra);
        long ver = extraNode.path("version").asLong();
        assertThat(code(ttSlotUpdate(t, extra, "បន្ថែម", "10:00", "10:30", false, ver + 5))).isEqualTo("OPTIMISTIC_LOCK");
        Resp edited = ttSlotUpdate(t, extra, "បន្ថែម ២", "10:00", "10:40", false, ver);
        assertThat(edited.status()).as(edited.body()).isEqualTo(200);
        assertThat(edited.json(json).path("version").asLong()).isEqualTo(ver + 1);
        assertThat(fieldCodes(ttSlotUpdate(t, extra, "បន្ថែម ២", "09:00", "10:40", false, ver + 1))).as("an edit may not overlap another slot").containsExactly("startTime:TIMETABLE_SLOT_OVERLAP");
        assertThat(send("DELETE", "/api/v1/timetable/slots/" + extra, t, null).status()).as("an unused slot can go").isEqualTo(204);
        assertThat(send("DELETE", "/api/v1/timetable/slots/" + extra, t, null).status()).isEqualTo(404);

        // ---- 4. one cell: BOTH a subject and a teacher, the right year, a school day, not a break, one lesson per class and slot, a teacher in one place
        assertThat(fieldCodes(ttCell(t, c1, 1, s1, khmer, null))).as("no teacher: nothing is saved").containsExactly("teacherId:REQUIRED");
        assertThat(fieldCodes(ttCell(t, c1, 1, s1, null, t2))).as("no subject: nothing is saved").containsExactly("subjectId:REQUIRED");
        assertThat(fieldCodes(ttCell(t, c1, null, s1, khmer, t2))).containsExactly("dayOfWeek:REQUIRED");
        assertThat(fieldCodes(ttCell(t, c1, 1, null, khmer, t2))).containsExactly("slotId:REQUIRED");
        assertThat(fieldCodes(ttCell(t, c1, 9, s1, khmer, t2))).containsExactly("dayOfWeek:INVALID");
        assertThat(fieldCodes(ttCell(t, c1, 6, s1, khmer, t2))).as("Saturday is not a school day until the school adds it").containsExactly("dayOfWeek:TIMETABLE_DAY_DISABLED");
        assertThat(fieldCodes(ttCell(t, c1, 1, br, khmer, t2))).as("a break holds no lesson").containsExactly("slotId:TIMETABLE_BREAK_SLOT");
        assertThat(fieldCodes(ttCell(t, c1, 1, 999999L, khmer, t2))).containsExactly("slotId:INVALID");
        assertThat(fieldCodes(ttCell(t, c1, 1, s1, mathSub, t2))).as("lessons use main subjects only").containsExactly("subjectId:SUBJECT_NOT_OFFERED");
        assertThat(fieldCodes(ttCell(t, c1, 1, s1, notOffered, t2))).as("a subject the grade does not study").containsExactly("subjectId:SUBJECT_NOT_OFFERED");
        assertThat(fieldCodes(ttCell(t, c1, 1, s1, khmer, t5))).as("an inactive teacher").containsExactly("teacherId:TEACHER_INACTIVE");
        assertThat(fieldCodes(ttCell(t, c1, 1, s1, khmer, 999999L))).containsExactly("teacherId:INVALID");
        assertThat(ttCell(t, 999999, 1, s1, khmer, t2).status()).isEqualTo(404);
        long sOther = ttId(ttSlot(t, yB, "ម៉ោង ១", "07:00", "07:45", false));
        assertThat(fieldCodes(ttCell(t, c1, 1, sOther, khmer, t2))).as("a slot of another academic year").containsExactly("slotId:TIMETABLE_YEAR_MISMATCH");
        assertThat(countRows("timetable_entries")).as("not one refused cell was stored").isZero();

        assertThat(send("PUT", "/api/v1/timetable/days", t, ttDays(yA, 1, 2, 3, 4, 5, 6)).status()).isEqualTo(200);
        JsonNode s6 = send("GET", "/api/v1/timetable/settings?yearId=" + yA, t, null).json(json);
        assertThat(ttInts(s6.path("days"))).containsExactly(1, 2, 3, 4, 5, 6);
        assertThat(s6.path("daysAreDefault").asBoolean()).isFalse();
        assertThat(fieldCodes(ttCell(t, c1, 7, s1, khmer, t2))).containsExactly("dayOfWeek:TIMETABLE_DAY_DISABLED");

        Resp first = ttCell(t, c1, 1, s1, math, t1);
        assertThat(first.status()).as(first.body()).isEqualTo(200);
        JsonNode firstLesson = first.json(json);
        assertThat(firstLesson.path("subjectName").asString()).isEqualTo("TT គណិតវិទ្យា");
        assertThat(firstLesson.path("teacherName").asString()).isEqualTo("TT គ្រូ ១");
        Resp clash = ttCell(t, c2, 1, s1, math, t1);
        assertThat(clash.status()).isEqualTo(409);
        JsonNode clashBody = clash.json(json);
        assertThat(clashBody.path("code").asString()).isEqualTo("TIMETABLE_TEACHER_CLASH");
        assertThat(clashBody.path("className").asString()).as("the refusal names the class the teacher is already in").isEqualTo("ក");
        assertThat(clashBody.path("slotName").asString()).isEqualTo("ម៉ោង ១");
        assertThat(clashBody.path("dayOfWeek").asInt()).isEqualTo(1);
        assertThat(fieldCodes(clash)).containsExactly("teacherId:TIMETABLE_TEACHER_CLASH");
        int auditBeforeSame = (int) countRows("audit_logs");
        assertThat(ttCell(t, c1, 1, s1, math, t1).status()).as("saving the same lesson again").isEqualTo(200);
        assertThat(countRows("audit_logs")).as("an unchanged cell leaves no history entry").isEqualTo(auditBeforeSame);
        Resp replaced = ttCell(t, c1, 1, s1, khmer, t2);                      // an edit of the same cell: a replacement, never a second lesson
        assertThat(replaced.status()).isEqualTo(200);
        assertThat(replaced.json(json).path("id").asLong()).as("the same lesson, changed").isEqualTo(firstLesson.path("id").asLong());
        assertThat(replaced.json(json).path("version").asLong()).isEqualTo(firstLesson.path("version").asLong() + 1);
        assertThat(jdbc.queryForObject("select count(*) from timetable_entries where class_id = ? and slot_id = ? and day_of_week = 1", Integer.class, c1, s1)).isEqualTo(1);
        assertThat(ttCell(t, c2, 1, s1, math, t1).status()).as("t1 is free now").isEqualTo(200);
        // the rest of the week
        for (Object[] l : new Object[][]{{c1, 1, s2, math, t1}, {c1, 2, s1, math, t1}, {c1, 3, s1, science, t4}, {c1, 4, s1, art, t4}, {c2, 1, s2, khmer, t3}, {c2, 2, s1, khmer, t3}}) {
            Resp r = ttCell(t, (long) l[0], (Integer) l[1], (Long) l[2], (Long) l[3], (Long) l[4]);
            assertThat(r.status()).as(r.body()).isEqualTo(200);
        }
        assertThat(countRows("timetable_entries")).isEqualTo(8);
        // a clear, twice: the second one is not an error and leaves no second history entry
        assertThat(ttCell(t, c2, 3, s2, khmer, t3).status()).isEqualTo(200);
        assertThat(send("DELETE", "/api/v1/timetable/classes/" + c2 + "/cell?dayOfWeek=3&slotId=" + s2, t, null).status()).isEqualTo(204);
        assertThat(send("DELETE", "/api/v1/timetable/classes/" + c2 + "/cell?dayOfWeek=3&slotId=" + s2, t, null).status()).isEqualTo(204);
        assertThat(countRows("timetable_entries")).isEqualTo(8);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action = 'TIMETABLE_LESSON_CLEARED'", Integer.class)).isEqualTo(1);

        // ---- 5. the views: a class, a teacher (with the weekly lesson count), a student
        JsonNode v1 = send("GET", "/api/v1/timetable/classes/" + c1, t, null).json(json);
        assertThat(v1.path("grid").path("lessons").size()).isEqualTo(5);
        List<String> order = new ArrayList<>();
        v1.path("grid").path("lessons").forEach(l -> order.add(l.path("dayOfWeek").asInt() + "@" + l.path("slotId").asLong()));
        assertThat(order).as("by time of day, then by day").containsExactly("1@" + s1, "2@" + s1, "3@" + s1, "4@" + s1, "1@" + s2);
        JsonNode tv1 = send("GET", "/api/v1/timetable/teachers/" + t1 + "?yearId=" + yA, t, null).json(json);
        assertThat(tv1.path("lessonCount").asInt()).as("the teacher's total lessons in the week, across classes").isEqualTo(3);
        Map<String, Integer> byClass = new HashMap<>();
        tv1.path("grid").path("lessons").forEach(l -> byClass.merge(l.path("className").asString(), 1, Integer::sum));
        assertThat(byClass).containsEntry("ក", 2).containsEntry("ខ", 1);
        assertThat(send("GET", "/api/v1/timetable/teachers/" + t5 + "?yearId=" + yA, t, null).json(json).path("teacherActive").asBoolean()).isFalse();
        Map<Long, Integer> loads = new HashMap<>();
        send("GET", "/api/v1/timetable/teacher-loads?yearId=" + yA, t, null).json(json).forEach(l -> loads.put(l.path("teacherId").asLong(), l.path("lessons").asInt()));
        assertThat(loads).containsEntry(t1, 3).containsEntry(t2, 1).containsEntry(t3, 2).containsEntry(t4, 2).doesNotContainKey(t5);
        JsonNode sv = send("GET", "/api/v1/timetable/students/" + stuIn + "?yearId=" + yA, t, null).json(json);
        assertThat(sv.path("state").asString()).isEqualTo("OK");
        assertThat(sv.path("classId").asLong()).as("the student's timetable is the class's").isEqualTo(c1);
        assertThat(sv.path("grid").path("lessons").size()).isEqualTo(5);
        JsonNode svOut = send("GET", "/api/v1/timetable/students/" + stuOut + "?yearId=" + yA, t, null).json(json);
        assertThat(svOut.path("state").asString()).as("a student with no class is an empty state, not an error").isEqualTo("NOT_ENROLLED");
        assertThat(svOut.path("grid").path("lessons").size()).isZero();
        assertThat(send("GET", "/api/v1/timetable/students/" + stuIn + "?yearId=" + yB, t, null).json(json).path("state").asString()).isEqualTo("NOT_ENROLLED");
        assertThat(send("GET", "/api/v1/timetable/students/" + stuIn, t, null).status()).as("no year given: the current one").isEqualTo(200);

        // ---- 6. slots and days that hold lessons are protected
        assertThat(code(ttSlotUpdate(t, s1, "ម៉ោង ១", "07:00", "07:45", true, ttVersion(t, yA, s1)))).as("a slot with lessons cannot become a break").isEqualTo("TIMETABLE_SLOT_IN_USE");
        assertThat(code(send("DELETE", "/api/v1/timetable/slots/" + s1, t, null))).as("a slot with lessons cannot be deleted").isEqualTo("TIMETABLE_SLOT_IN_USE");
        Resp dayInUse = send("PUT", "/api/v1/timetable/days", t, ttDays(yA, 2, 3, 4, 5, 6));
        assertThat(dayInUse.status()).isEqualTo(409);
        assertThat(code(dayInUse)).isEqualTo("TIMETABLE_DAY_IN_USE");
        assertThat(dayInUse.json(json).path("dayOfWeek").asInt()).isEqualTo(1);
        assertThat(ttSlotUpdate(t, s1, "ម៉ោងទី ១", "07:00", "07:45", false, ttVersion(t, yA, s1)).status()).as("a slot with lessons can be renamed").isEqualTo(200);
        assertThat(send("GET", "/api/v1/timetable/classes/" + c1, t, null).json(json).path("grid").path("lessons").size()).as("the lessons stayed in it").isEqualTo(5);
        assertThat(ttSlotUpdate(t, s1, "ម៉ោង ១", "07:00", "07:45", false, ttVersion(t, yA, s1)).status()).isEqualTo(200);

        // ---- 7. a subject only a timetable uses cannot be removed (it is switched off instead); a class that never had a student takes its timetable with it
        assertThat(code(send("DELETE", "/api/v1/subjects/" + art, t, null))).as("art is used by nothing but a lesson").isEqualTo("SUBJECT_IN_USE");
        long sub = jdbc.queryForObject("select count(*) from teacher_assignments where subject_id = ?", Long.class, art);
        assertThat(sub).as("no teacher assignment holds art: only the timetable does").isZero();
        assertThat(ttCell(t, cB, 1, sOther, math, t1).status()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from timetable_entries where class_id = ?", Integer.class, cB)).isEqualTo(1);
        // the copy refuses what is not a copy between classes of one grade and one year (before anything else is looked at)
        assertThat(fieldCodes(ttCopyClass(t, c3, cB, false, true))).as("another year").containsExactly("sourceClassId:TIMETABLE_YEAR_MISMATCH");
        assertThat(fieldCodes(ttCopyClass(t, c3, cG5, false, true))).as("another grade").containsExactly("sourceClassId:TIMETABLE_DIFFERENT_GRADE");
        assertThat(fieldCodes(ttCopyClass(t, c3, c3, false, true))).containsExactly("sourceClassId:INVALID");
        assertThat(send("DELETE", "/api/v1/classes/" + cB, t, null).status()).isIn(200, 204);
        assertThat(jdbc.queryForObject("select count(*) from timetable_entries where class_id = ?", Integer.class, cB)).as("the class's own lessons went with it").isZero();

        // ---- 8. copying a class: a PREVIEW first (changes nothing), then the copy, which makes exactly what the preview showed
        String c1Rows = ttRows("select * from timetable_entries where class_id = " + c1 + " order by id");
        int entriesBefore = (int) countRows("timetable_entries"), auditBefore = (int) countRows("audit_logs");
        JsonNode pv = ttCopyClass(t, c3, c1, false, true).json(json);
        assertThat(pv.path("preview").asBoolean()).isTrue();
        assertThat(pv.path("copied").size()).isEqualTo(1);
        assertThat(pv.path("copied").get(0).path("teacherId").asLong()).as("the teacher is the target class's own, never the source lesson's").isEqualTo(t3);
        assertThat(pv.path("copied").get(0).path("subjectId").asLong()).isEqualTo(khmer);
        assertThat(ttReasons(pv.path("skipped"))).as("every lesson that is not copied says why").containsExactly("TEACHER_CLASH", "NO_TEACHER_ASSIGNED", "NO_TEACHER_ASSIGNED", "TEACHER_CLASH");
        assertThat(pv.path("skipped").get(0).path("detail").asString()).as("a clash names the class the teacher is in").endsWith(" ក");
        assertThat(countRows("timetable_entries")).as("a preview stores nothing").isEqualTo(entriesBefore);
        assertThat(countRows("audit_logs")).as("and records nothing").isEqualTo(auditBefore);
        // a request that forgets the flag is a preview, never a copy
        assertThat(send("POST", "/api/v1/timetable/classes/" + c3 + "/copy-from/" + c1, t, "{}").json(json).path("preview").asBoolean()).isTrue();
        assertThat(countRows("timetable_entries")).isEqualTo(entriesBefore);
        JsonNode done = ttCopyClass(t, c3, c1, false, false).json(json);
        assertThat(done.path("preview").asBoolean()).isFalse();
        assertThat(done.path("copied").size()).isEqualTo(1);
        assertThat(done.path("skipped").size()).isEqualTo(4);
        assertThat(jdbc.queryForObject("select count(*) from timetable_entries where class_id = ?", Integer.class, c3)).as("exactly the previewed lesson").isEqualTo(1);
        assertThat(ttRows("select * from timetable_entries where class_id = " + c1 + " order by id")).as("the source class is untouched").isEqualTo(c1Rows);
        JsonNode again = ttCopyClass(t, c3, c1, false, false).json(json);
        assertThat(again.path("copied").size()).as("without \"replace\" only empty cells are filled").isZero();
        assertThat(ttReasons(again.path("skipped"))).containsExactly("CELL_OCCUPIED", "TEACHER_CLASH", "NO_TEACHER_ASSIGNED", "NO_TEACHER_ASSIGNED", "TEACHER_CLASH");
        JsonNode withReplace = ttCopyClass(t, c3, c1, true, true).json(json);
        assertThat(withReplace.path("replaced").asInt()).as("the preview says how many existing lessons \"replace\" removes").isEqualTo(1);
        assertThat(withReplace.path("copied").size()).isEqualTo(1);

        // ---- 9. copying a year into an empty year: days, slots and the lessons of classes that exist in both; the source year is only READ
        String srcBefore = ttSnapshot(yA);
        assertThat(code(ttCopyYear(t, yC, yC, true))).isEqualTo("VALIDATION_FAILED");
        assertThat(code(ttCopyYear(t, yA, yB, true))).as("a year with slots is not empty").isEqualTo("TIMETABLE_YEAR_NOT_EMPTY");
        JsonNode yp = ttCopyYear(t, yC, yA, true).json(json);
        assertThat(yp.path("preview").asBoolean()).isTrue();
        assertThat(yp.path("slots").asInt()).isEqualTo(4);
        assertThat(yp.path("copied").size()).as("class ក exists in both years").isEqualTo(5);
        assertThat(ttReasons(yp.path("skipped"))).as("classes ខ and គ do not exist in the new year").containsOnly("CLASS_NOT_IN_YEAR").hasSize(4);
        Map<Long, Long> teacherOfSubject = new HashMap<>();
        yp.path("copied").forEach(l -> teacherOfSubject.put(l.path("subjectId").asLong(), l.path("teacherId").asLong()));
        assertThat(teacherOfSubject).as("the new class's own assignment first, else the previous teacher if still active")
                .containsEntry(khmer, t2).containsEntry(math, t1).containsEntry(science, t4).containsEntry(art, t4);
        assertThat(countRows("timetable_slots") - jdbc.queryForObject("select count(*) from timetable_slots where academic_year_id in (?, ?)", Long.class, yA, yB)).as("a preview wrote nothing into the target").isZero();
        JsonNode yDone = ttCopyYear(t, yC, yA, false).json(json);
        assertThat(yDone.path("copied").size()).isEqualTo(5);
        assertThat(jdbc.queryForObject("select count(*) from timetable_slots where academic_year_id = ?", Integer.class, yC)).isEqualTo(4);
        assertThat(jdbc.queryForObject("select count(*) from timetable_entries e join classes c on c.id = e.class_id where c.academic_year_id = ?", Integer.class, yC)).isEqualTo(5);
        assertThat(ttInts(send("GET", "/api/v1/timetable/settings?yearId=" + yC, t, null).json(json).path("days"))).as("the school days came with it").containsExactly(1, 2, 3, 4, 5, 6);
        List<String> copiedSlots = jdbc.queryForList("select name_km || ' ' || start_time || '-' || end_time || ' ' || is_break from timetable_slots where academic_year_id = ? order by start_time", String.class, yC);
        assertThat(copiedSlots).containsExactly("ម៉ោង ១ 07:00-07:45 0", "ម៉ោង ២ 07:45-08:30 0", "សម្រាក 08:30-08:45 1", "ម៉ោង ៣ 08:45-09:30 0");
        assertThat(ttSnapshot(yA)).as("the source year is byte for byte what it was").isEqualTo(srcBefore);
        assertThat(code(ttCopyYear(t, yC, yA, false))).as("a second copy into the same year").isEqualTo("TIMETABLE_YEAR_NOT_EMPTY");
        // the copy is independent: changing the new year never touches the old one
        assertThat(send("PUT", "/api/v1/timetable/days", t, ttDays(yC, 1, 2, 3)).status()).isEqualTo(409);       // Thursday has a lesson
        long cSlot = jdbc.queryForObject("select id from timetable_slots where academic_year_id = ? and name_km = 'ម៉ោង ៣'", Long.class, yC);
        assertThat(send("DELETE", "/api/v1/timetable/slots/" + cSlot, t, null).status()).isEqualTo(204);
        assertThat(ttSnapshot(yA)).isEqualTo(srcBefore);

        // ---- 10. every change is in the history of changes, by the signed-in user, with the time, and with ids only (no name)
        List<Map<String, Object>> trail = jdbc.queryForList("select actor, at, action, entity_type, entity_id, summary, before_json, after_json from audit_logs where action like 'TIMETABLE%' order by id");
        List<String> actions = new ArrayList<>();
        trail.forEach(r -> actions.add((String) r.get("action")));
        assertThat(actions).contains("TIMETABLE_DAYS_CHANGED", "TIMETABLE_SLOT_CREATED", "TIMETABLE_SLOT_UPDATED", "TIMETABLE_SLOT_DELETED", "TIMETABLE_LESSON_SET", "TIMETABLE_LESSON_CHANGED",
                "TIMETABLE_LESSON_CLEARED", "TIMETABLE_CLASS_COPIED", "TIMETABLE_YEAR_COPIED");
        for (Map<String, Object> row : trail) {
            assertThat(row.get("actor")).as("the signed-in user").isEqualTo("admin.sokha");
            assertThat(Instant.parse((String) row.get("at"))).as("the time").isBeforeOrEqualTo(CLOCK.instant());
            assertThat(String.valueOf(row.get("summary")) + row.get("before_json") + row.get("after_json")).as(row.get("action") + ": ids and codes only, no name").matches("[\\x00-\\x7F]*");
        }
        Map<String, Object> changed = trail.stream().filter(r -> "TIMETABLE_LESSON_CHANGED".equals(r.get("action"))).findFirst().orElseThrow();
        assertThat(changed.get("before_json")).isEqualTo("{\"classId\":" + c1 + ",\"day\":1,\"slotId\":" + s1 + ",\"subjectId\":" + math + ",\"teacherId\":" + t1 + "}");
        assertThat(changed.get("after_json")).isEqualTo("{\"classId\":" + c1 + ",\"day\":1,\"slotId\":" + s1 + ",\"subjectId\":" + khmer + ",\"teacherId\":" + t2 + "}");
        assertThat(((Number) changed.get("entity_id")).longValue()).isEqualTo(firstLesson.path("id").asLong());
        assertThat(trail.stream().filter(r -> "TIMETABLE_CLASS_COPIED".equals(r.get("action"))).count()).as("one entry per real class copy (the copy and the repeated copy; previews leave none)").isEqualTo(2);
        assertThat(trail.stream().filter(r -> "TIMETABLE_YEAR_COPIED".equals(r.get("action"))).count()).isEqualTo(1);

        // ---- 11. a CLOSED year is read-only for the whole timetable, yet can still be read and copied FROM
        assertThat(send("POST", "/api/v1/academic-years/" + yA + "/close", t, "{}").status()).isIn(200, 204);
        assertThat(code(ttCell(t, c1, 5, s1, math, t1))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("DELETE", "/api/v1/timetable/classes/" + c1 + "/cell?dayOfWeek=1&slotId=" + s1, t, null))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("PUT", "/api/v1/timetable/days", t, ttDays(yA, 1, 2, 3, 4, 5, 6, 7)))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(ttSlot(t, yA, "ថ្មី", "12:00", "12:30", false))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(ttSlotUpdate(t, s1, "ម៉ោង ១", "07:00", "07:45", false, ttVersion(t, yA, s1)))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("DELETE", "/api/v1/timetable/slots/" + s3, t, null))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(ttCopyClass(t, c3, c1, true, false))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(ttCopyYear(t, yA, yC, false))).as("a closed year is never a copy target").isEqualTo("ACADEMIC_YEAR_CLOSED");
        JsonNode closedView = send("GET", "/api/v1/timetable/classes/" + c1, t, null).json(json);
        assertThat(closedView.path("yearClosed").asBoolean()).isTrue();
        assertThat(closedView.path("grid").path("lessons").size()).as("a closed year can still be read").isEqualTo(5);
        assertThat(send("GET", "/api/v1/timetable/students/" + stuIn + "?yearId=" + yA, t, null).json(json).path("yearClosed").asBoolean()).isTrue();
        JsonNode fromClosed = ttCopyYear(t, yD, yA, false).json(json);
        assertThat(fromClosed.path("slots").asInt()).as("copied FROM a closed year").isEqualTo(4);
        assertThat(fromClosed.path("copied").size()).as("D has no classes yet").isZero();
        assertThat(fromClosed.path("skipped").size()).isEqualTo(9);
        assertThat(ttSnapshot(yA)).as("the closed source year is still byte for byte what it was").isEqualTo(srcBefore);
        assertThat(jdbc.queryForObject("select count(*) from timetable_slots where academic_year_id = ?", Integer.class, yD)).isEqualTo(4);
    }

    // ---- timetable helpers --------------------------------------------------------------------------------------

    long ttId(Resp r) {
        assertThat(r.status()).as(r.body()).isIn(200, 201);
        return r.json(json).path("id").asLong();
    }

    long ttYear(String t, String name, String start, String end) throws Exception {
        return ttId(send("POST", "/api/v1/academic-years", t, json.writeValueAsString(Map.of("nameKm", name, "startDate", start, "endDate", end, "makeCurrent", false))));
    }

    long ttSubject(String t, String name, Long parent) throws Exception {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("nameKm", name);
        m.put("parentId", parent);
        return ttId(send("POST", "/api/v1/subjects", t, json.writeValueAsString(m)));
    }

    long ttTeacher(String t, String name) throws Exception { return ttId(send("POST", "/api/v1/teachers", t, j("nameKm", name, "gender", "FEMALE"))); }

    long ttClass(String t, long year, long grade, String name) throws Exception {
        Resp r = send("POST", "/api/v1/classes", t, cls(year, grade, name, null, null, null));
        assertThat(r.status()).as(r.body()).isEqualTo(201);
        return r.json(json).path("schoolClass").path("id").asLong();
    }

    String ttDays(long year, Integer... days) { return json.writeValueAsString(Map.of("yearId", year, "days", List.of(days))); }

    Resp ttSlot(String t, long year, String name, String start, String end, boolean breakSlot) throws Exception {
        return send("POST", "/api/v1/timetable/slots", t, json.writeValueAsString(Map.of("yearId", year, "nameKm", name, "startTime", start, "endTime", end, "breakSlot", breakSlot)));
    }

    Resp ttSlotUpdate(String t, long id, String name, String start, String end, boolean breakSlot, long version) throws Exception {
        return send("PUT", "/api/v1/timetable/slots/" + id, t, json.writeValueAsString(Map.of("nameKm", name, "startTime", start, "endTime", end, "breakSlot", breakSlot, "version", version)));
    }

    long ttVersion(String t, long year, long slotId) throws Exception {
        return ttById(send("GET", "/api/v1/timetable/settings?yearId=" + year, t, null).json(json).path("slots")).get(slotId).path("version").asLong();
    }

    Resp ttCell(String t, long classId, Integer day, Long slot, Long subject, Long teacher) throws Exception {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("dayOfWeek", day);
        m.put("slotId", slot);
        m.put("subjectId", subject);
        m.put("teacherId", teacher);
        return send("PUT", "/api/v1/timetable/classes/" + classId + "/cell", t, json.writeValueAsString(m));
    }

    Resp ttCopyClass(String t, long target, long source, boolean replace, boolean preview) throws Exception {
        return send("POST", "/api/v1/timetable/classes/" + target + "/copy-from/" + source, t, json.writeValueAsString(Map.of("replace", replace, "preview", preview)));
    }

    Resp ttCopyYear(String t, long target, long source, boolean preview) throws Exception {
        return send("POST", "/api/v1/timetable/years/" + target + "/copy-from/" + source, t, json.writeValueAsString(Map.of("preview", preview)));
    }

    List<Integer> ttInts(JsonNode array) {
        List<Integer> out = new ArrayList<>();
        array.forEach(n -> out.add(n.asInt()));
        return out;
    }

    Map<Long, JsonNode> ttById(JsonNode array) {
        Map<Long, JsonNode> out = new HashMap<>();
        array.forEach(n -> out.put(n.path("id").asLong(), n));
        return out;
    }

    List<String> ttReasons(JsonNode skipped) {
        List<String> out = new ArrayList<>();
        skipped.forEach(n -> out.add(n.path("reason").asString()));
        return out;
    }

    String ttRows(String sql) { return String.valueOf(jdbc.queryForList(sql)); }

    /** Every timetable row that belongs to the year (days, slots, lessons), for a byte-for-byte comparison. */
    String ttSnapshot(long year) {
        return ttRows("select * from timetable_days where academic_year_id = " + year + " order by day_of_week")
                + ttRows("select * from timetable_slots where academic_year_id = " + year + " order by id")
                + ttRows("select e.* from timetable_entries e join classes c on c.id = e.class_id where c.academic_year_id = " + year + " order by e.id");
    }

    @Test @Order(67)
    void theDashboardChartsAreReadOnlyAndEveryFigureIsTheSchoolsOwn() throws Exception {
        String t = login("admin.sokha", PW3).json(json).path("token").asString();
        assertThat(send("GET", "/api/v1/dashboard/charts", null, null).status()).as("needs a session").isEqualTo(401);

        // ---- arrangement: a new CURRENT year with two classes, five placed students (one of them a boy in grade 2) and attendance with gaps; plus one active girl in no class
        long yr = ttYear(t, "CH ឆ្នាំ", "2036-11-01", "2037-08-31");
        assertThat(send("POST", "/api/v1/academic-years/" + yr + "/set-current", t, "{}").status()).isIn(200, 204);
        long g1 = gradeIdFor(t, 1), g2 = gradeIdFor(t, 2);
        long c1 = ttClass(t, yr, g1, "ក"), c2 = ttClass(t, yr, g2, "ក");
        String now = "2036-11-01T00:00:00Z";
        String[][] people = {{"CH-1", "MALE"}, {"CH-2", "MALE"}, {"CH-3", "FEMALE"}, {"CH-4", "FEMALE"}, {"CH-5", "MALE"}, {"CH-6", "FEMALE"}};
        for (String[] p : people) {
            jdbc.update("insert into students (student_code, name_km, gender, date_of_birth, enrollment_date, created_at, updated_at) values (?, ?, ?, '2028-01-01', '2036-11-01', ?, ?)", p[0], "CH " + p[0], p[1], now, now);
        }
        long[] stu = new long[6];
        for (int i = 0; i < 6; i++) stu[i] = jdbc.queryForObject("select id from students where student_code = ?", Long.class, people[i][0]);
        long[] enr = new long[5];
        long[] classOf = {c1, c1, c1, c1, c2};
        for (int i = 0; i < 5; i++) {
            jdbc.update("insert into enrollments (student_id, academic_year_id, class_id, status, enrolled_on, created_at, updated_at) values (?, ?, ?, 'ACTIVE', '2036-11-01', ?, ?)", stu[i], yr, classOf[i], now, now);
            enr[i] = jdbc.queryForObject("select id from enrollments where student_id = ? and academic_year_id = ?", Long.class, stu[i], yr);
        }
        long period = jdbc.queryForObject("select id from attendance_periods where academic_year_id = ? order by sort_order, id limit 1", Long.class, yr);
        String periodName = jdbc.queryForObject("select name_km from attendance_periods where id = ?", String.class, period);
        java.time.LocalDate mon = java.time.LocalDate.of(2036, 11, 1).with(java.time.temporal.TemporalAdjusters.nextOrSame(java.time.DayOfWeek.MONDAY));
        // Mon recorded (P P P A), Tue recorded (P P L LEAVE), Wed NOT recorded, Thu recorded (P A A P), Fri NOT recorded, the weekend skipped, next Mon a sheet with NO record
        String[][] sheets = {{"0", "PRESENT", "PRESENT", "PRESENT", "ABSENT"}, {"1", "PRESENT", "PRESENT", "LATE", "LEAVE"}, {"3", "PRESENT", "ABSENT", "ABSENT", "PRESENT"}, {"7"}};
        for (String[] sheet : sheets) {
            String date = mon.plusDays(Long.parseLong(sheet[0])).toString();
            jdbc.update("insert into attendance_sessions (class_id, date, period_id, period_name_km, created_at, updated_at) values (?, ?, ?, ?, ?, ?)", c1, date, period, periodName, now, now);
            long session = jdbc.queryForObject("select id from attendance_sessions where class_id = ? and date = ? and period_id = ?", Long.class, c1, date, period);
            for (int k = 1; k < sheet.length; k++) {
                jdbc.update("insert into attendance_records (session_id, enrollment_id, student_id, date, period_id, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)", session, enr[k - 1], stu[k - 1], date, period, sheet[k], now, now);
            }
        }

        // ---- the people: gender totals include everybody who is active, and the grades are one row each
        JsonNode ch = charts(t);
        assertThat(ch.path("year").path("id").asLong()).isEqualTo(yr);
        int active = jdbc.queryForObject("select count(*) from students where status = 'ACTIVE'", Integer.class);
        int male = jdbc.queryForObject("select count(*) from students where status = 'ACTIVE' and gender = 'MALE'", Integer.class);
        int female = jdbc.queryForObject("select count(*) from students where status = 'ACTIVE' and gender = 'FEMALE'", Integer.class);
        JsonNode gender = ch.path("gender");
        assertThat(gender.path("total").asInt()).isEqualTo(active);
        assertThat(gender.path("male").asInt()).isEqualTo(male);
        assertThat(gender.path("female").asInt()).isEqualTo(female);
        assertThat(gender.path("male").asInt() + gender.path("female").asInt() + gender.path("unknown").asInt()).as("an unrecorded gender stays in the total").isEqualTo(active);
        JsonNode byGrade = ch.path("studentsByGrade");
        assertThat(byGrade.path("grades").size()).isEqualTo(6);
        for (int i = 0; i < 6; i++) assertThat(byGrade.path("grades").get(i).path("level").asInt()).isEqualTo(i + 1);
        JsonNode first = byGrade.path("grades").get(0), second = byGrade.path("grades").get(1);
        assertThat(new int[]{first.path("male").asInt(), first.path("female").asInt(), first.path("unknown").asInt()}).containsExactly(2, 2, 0);
        assertThat(new int[]{second.path("male").asInt(), second.path("female").asInt(), second.path("unknown").asInt()}).containsExactly(1, 0, 0);
        for (int i = 2; i < 6; i++) assertThat(byGrade.path("grades").get(i).path("male").asInt() + byGrade.path("grades").get(i).path("female").asInt()).as("a grade nobody is in is a row of zeros").isZero();
        assertThat(byGrade.path("notInAClass").asInt()).as("every active student who is in no class of this year").isEqualTo(active - 5);

        // ---- class fill: the capacity the class has, the head count of its active students
        JsonNode fill = ch.path("classFill");
        assertThat(fill.size()).isEqualTo(2);
        for (JsonNode c : fill) {
            long id = c.path("classId").asLong();
            assertThat(c.path("students").asInt()).isEqualTo(id == c1 ? 4 : 1);
            assertThat(c.path("capacity").asInt()).as("the capacity stored for the class, as the class page shows it").isEqualTo(jdbc.queryForObject("select capacity from classes where id = ?", Integer.class, id));
        }

        // ---- attendance: a day nobody recorded is a GAP (every figure null), never zero; a class that did not record is not counted absent; weekend days with no record are not drawn
        JsonNode att = ch.path("attendance");
        assertThat(att.path("basis").asString()).isEqualTo("DAY");
        assertThat(att.path("classes").asInt()).isEqualTo(2);
        JsonNode days = att.path("days");
        assertThat(days.size()).isEqualTo(6);
        List<String> axis = new ArrayList<>();
        days.forEach(d -> axis.add(d.path("date").asString()));
        assertThat(axis).containsExactly(mon.toString(), mon.plusDays(1).toString(), mon.plusDays(2).toString(), mon.plusDays(3).toString(), mon.plusDays(4).toString(), mon.plusDays(7).toString());
        assertThat(days.get(0).path("recorded").asBoolean() && days.get(1).path("recorded").asBoolean() && !days.get(2).path("recorded").asBoolean() && days.get(3).path("recorded").asBoolean()
                && !days.get(4).path("recorded").asBoolean() && days.get(5).path("recorded").asBoolean()).isTrue();
        for (int gap : new int[]{2, 4}) {
            for (String f : List.of("present", "late", "partial", "absent", "leave", "total", "presentPercent")) assertThat(days.get(gap).path(f).isNull()).as("gap " + gap + " " + f).isTrue();
            assertThat(days.get(gap).path("classesRecorded").asInt()).isZero();
        }
        assertThat(new int[]{days.get(0).path("present").asInt(), days.get(0).path("absent").asInt(), days.get(0).path("total").asInt()}).containsExactly(3, 1, 4);
        assertThat(num(days.get(0).path("presentPercent"))).isEqualByComparingTo("75.0");
        assertThat(new int[]{days.get(1).path("present").asInt(), days.get(1).path("late").asInt(), days.get(1).path("leave").asInt()}).containsExactly(2, 1, 1);
        assertThat(num(days.get(1).path("presentPercent"))).isEqualByComparingTo("50.0");
        assertThat(num(days.get(3).path("presentPercent"))).isEqualByComparingTo("50.0");
        assertThat(days.get(5).path("classesRecorded").asInt()).isEqualTo(1);
        assertThat(days.get(5).path("presentPercent").isNull()).as("a sheet with no record has no percentage: not zero").isTrue();
        assertThat(days.get(5).path("total").asInt()).isZero();
        // the same day on the dashboard's own figures (the school's counting method), for any date that is today
        // and by sessions: with one session a day the figures are the same, and the method is named
        assertThat(send("PUT", "/api/v1/settings/app", t, "{\"attendance.officialBasis\":\"SESSION\"}").status()).isEqualTo(200);
        JsonNode bySession = charts(t).path("attendance");
        assertThat(bySession.path("basis").asString()).isEqualTo("SESSION");
        assertThat(num(bySession.path("days").get(0).path("presentPercent"))).isEqualByComparingTo("75.0");
        assertThat(bySession.path("days").get(0).path("partial").asInt()).isZero();
        assertThat(send("PUT", "/api/v1/settings/app", t, "{\"attendance.officialBasis\":\"DAY\"}").status()).isEqualTo(200);

        // ---- the latest examination: no score in this year yet, then a year that has one: every number is the results' own (the report cards' source)
        assertThat(ch.path("latestExam").isNull()).as("an empty state, not an error").isTrue();
        long examYear = jdbc.queryForObject("select academic_year_id from examinations order by id desc limit 1", Long.class);
        assertThat(send("POST", "/api/v1/academic-years/" + examYear + "/set-current", t, "{}").status()).isIn(200, 204);
        JsonNode withExam = charts(t).path("latestExam");
        assertThat(withExam.isNull()).isFalse();
        long examId = withExam.path("examinationId").asLong();
        assertThat(examId).isEqualTo(jdbc.queryForObject("""
                select e.id from examinations e where e.academic_year_id = ? and (exists (select 1 from student_scores ss join examination_subjects es on es.id = ss.examination_subject_id where es.examination_id = e.id)
                or exists (select 1 from sub_subject_scores sc join examination_sub_subjects ess on ess.id = sc.examination_sub_subject_id join examination_subjects es on es.id = ess.examination_subject_id where es.examination_id = e.id))
                order by e.id desc limit 1
                """, Long.class, examYear));
        assertThat(withExam.path("classes").size()).isGreaterThan(0);
        for (JsonNode c : withExam.path("classes")) {
            JsonNode results = send("GET", "/api/v1/examinations/" + examId + "/results?classId=" + c.path("classId").asLong(), t, null).json(json);
            int complete = 0, incomplete = 0, passed = 0, failed = 0;
            java.math.BigDecimal sum = java.math.BigDecimal.ZERO;
            for (JsonNode s : results.path("students")) {
                if (!s.path("complete").asBoolean() || s.path("percent").isNull()) { incomplete++; continue; }
                complete++;
                sum = sum.add(num(s.path("percent")));
                if (s.path("passed").isBoolean() && s.path("passed").asBoolean()) passed++;
                else if (s.path("passed").isBoolean()) failed++;
            }
            assertThat(new int[]{c.path("students").asInt(), c.path("complete").asInt(), c.path("incomplete").asInt(), c.path("passed").asInt(), c.path("failed").asInt()})
                    .as("class " + c.path("classId").asLong() + " as the results endpoint says").containsExactly(results.path("students").size(), complete, incomplete, passed, failed);
            if (complete == 0) assertThat(c.path("averagePercent").isNull()).isTrue();
            else assertThat(num(c.path("averagePercent"))).isEqualByComparingTo(sum.divide(java.math.BigDecimal.valueOf(complete), 1, java.math.RoundingMode.HALF_UP));
        }
        assertThat(num(withExam.path("passPercent"))).isEqualByComparingTo(num(send("GET", "/api/v1/examinations/" + examId + "/results?classId=" + withExam.path("classes").get(0).path("classId").asLong(), t, null).json(json).path("passPercent")));
        assertThat(send("POST", "/api/v1/academic-years/" + yr + "/set-current", t, "{}").status()).isIn(200, 204);

        // ---- fees (only while switched on): money collected per month, one series per currency, nothing combined, a voided payment not counted
        assertThat(send("PUT", "/api/v1/settings/app", t, "{\"fees.enabled\":\"false\"}").status()).isEqualTo(200);
        assertThat(charts(t).path("fees").isNull()).as("fees are off: no fees chart").isTrue();
        assertThat(send("PUT", "/api/v1/settings/app", t, "{\"fees.enabled\":\"true\",\"fees.currencies\":\"KHR,USD\"}").status()).isEqualTo(200);
        JsonNode before = charts(t).path("fees");
        List<String> currencies = new ArrayList<>();
        before.path("series").forEach(s -> currencies.add(s.path("currency").asString()));
        assertThat(currencies).as("one series per allowed currency, never a combined one").containsExactly("KHR", "USD");
        java.time.YearMonth thisMonth = java.time.YearMonth.from(kh.school.sms.common.Dates.today(CLOCK));
        List<String> months = new ArrayList<>();
        before.path("months").forEach(m -> months.add(m.asString()));
        assertThat(months).hasSize(6);
        assertThat(months.get(5)).isEqualTo(thisMonth.toString());
        assertThat(months.get(0)).isEqualTo(thisMonth.minusMonths(5).toString());
        long category = jdbc.queryForObject("select coalesce((select id from fee_categories order by id limit 1), 0)", Long.class);
        if (category == 0) {
            jdbc.update("insert into fee_categories (name_km, currency, default_amount, is_active, created_at, updated_at) values ('CH ថ្លៃ', 'KHR', 1000, 1, ?, ?)", now, now);
            category = jdbc.queryForObject("select id from fee_categories order by id desc limit 1", Long.class);
        }
        long khr = insertCharge(enr[0], category, 100000, "KHR", now), usd = insertCharge(enr[1], category, 5000, "USD", now);
        String today = kh.school.sms.common.Dates.today(CLOCK).toString();
        insertPayment(khr, 20000, today, "CH-R1", null, now);                                                   // this month
        insertPayment(khr, 5000, thisMonth.minusMonths(1).atDay(15).toString(), "CH-R2", null, now);            // last month
        insertPayment(khr, 7777, today, "CH-R3", "a mistake", now);                                             // voided: never counted
        insertPayment(khr, 999, thisMonth.minusMonths(7).atDay(1).toString(), "CH-R4", null, now);              // outside the six months
        insertPayment(usd, 1234, today, "CH-U1", null, now);                                                    // 12.34 dollars
        JsonNode after = charts(t).path("fees");
        for (int s = 0; s < 2; s++) {
            String cur = after.path("series").get(s).path("currency").asString();
            for (int m = 0; m < 6; m++) {
                long minor = jdbc.queryForObject("select coalesce(sum(p.amount), 0) from fee_payments p join student_fees f on f.id = p.student_fee_id where f.currency = ? and p.voided_at is null and substr(p.paid_on, 1, 7) = ?", Long.class, cur, months.get(m));
                assertThat(num(after.path("series").get(s).path("months").get(m).path("collected"))).as(cur + " " + months.get(m)).isEqualByComparingTo(kh.school.sms.fees.Money.toMajor(minor, cur));
            }
        }
        assertThat(num(after.path("series").get(0).path("months").get(5).path("collected")).subtract(num(before.path("series").get(0).path("months").get(5).path("collected")))).as("riel this month: +20,000 only").isEqualByComparingTo("20000");
        assertThat(num(after.path("series").get(0).path("months").get(4).path("collected")).subtract(num(before.path("series").get(0).path("months").get(4).path("collected")))).isEqualByComparingTo("5000");
        assertThat(num(after.path("series").get(1).path("months").get(5).path("collected")).subtract(num(before.path("series").get(1).path("months").get(5).path("collected")))).as("dollars are their own series: +12.34").isEqualByComparingTo("12.34");

        // ---- no current year: an empty state with a 200 (the people's totals stay, everything about the year is empty)
        assertThat(send("POST", "/api/v1/academic-years/" + yr + "/close", t, "{}").status()).isIn(200, 204);
        JsonNode none = charts(t);
        assertThat(none.path("year").isNull()).isTrue();
        assertThat(none.path("studentsByGrade").path("grades").size()).isZero();
        assertThat(none.path("attendance").path("days").size()).isZero();
        assertThat(none.path("classFill").size()).isZero();
        assertThat(none.path("latestExam").isNull()).isTrue();
        assertThat(none.path("gender").path("total").asInt()).isEqualTo(active);
        assertThat(send("POST", "/api/v1/academic-years/" + yr + "/reopen", t, "{}").status()).isIn(200, 204);
        assertThat(send("POST", "/api/v1/academic-years/" + yr + "/set-current", t, "{}").status()).isIn(200, 204);
        assertThat(charts(t).path("year").path("id").asLong()).isEqualTo(yr);
    }

    long insertCharge(long enrollment, long category, long minor, String currency, String now) {
        jdbc.update("insert into student_fees (enrollment_id, category_id, amount_due, currency, created_at, updated_at) values (?, ?, ?, ?, ?, ?)", enrollment, category, minor, currency, now, now);
        return jdbc.queryForObject("select id from student_fees order by id desc limit 1", Long.class);
    }

    void insertPayment(long charge, long minor, String paidOn, String receipt, String voidReason, String now) {
        jdbc.update("insert into fee_payments (student_fee_id, amount, paid_on, method, receipt_no, voided_at, void_reason, created_at) values (?, ?, ?, 'CASH', ?, ?, ?, ?)",
                charge, minor, paidOn, receipt, voidReason == null ? null : now, voidReason, now);
    }

    /** The charts' answer, which must leave EVERY table exactly as it was (no row written, no audit entry): the counts of all tables are compared before and after. */
    JsonNode charts(String t) throws Exception {
        Map<String, Long> before = rowCounts();
        Resp r = send("GET", "/api/v1/dashboard/charts", t, null);
        assertThat(r.status()).as(r.body()).isEqualTo(200);
        assertThat(rowCounts()).as("the charts endpoint is read only").isEqualTo(before);
        return r.json(json);
    }

    Map<String, Long> rowCounts() {
        Map<String, Long> out = new java.util.TreeMap<>();
        for (String table : jdbc.queryForList("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name <> 'flyway_schema_history'", String.class)) {
            out.put(table, jdbc.queryForObject("select count(*) from \"" + table + "\"", Long.class));
        }
        return out;
    }

    // ---- helpers ------------------------------------------------------------------------------------------------

    Resp send(String method, String path, String token, String jsonBody) throws Exception {
        return exec(method, path, token, true, jsonBody == null ? null : jsonBody.getBytes(StandardCharsets.UTF_8), "application/json; charset=UTF-8", Map.of());
    }

    Resp exec(String method, String path, String token, boolean secret, byte[] body, String contentType, Map<String, String> extra) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (secret) b.header("X-SMS-Launch-Secret", SECRET);
        if (token != null) b.header("Authorization", "Bearer " + token);
        if (body != null) b.header("Content-Type", contentType);
        extra.forEach(b::header);
        b.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));
        HttpResponse<byte[]> r = http.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
        return new Resp(r.statusCode(), new String(r.body(), StandardCharsets.UTF_8), r.headers(), r.body());
    }

    String j(String... kv) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return json.writeValueAsString(m);
    }

    String code(Resp r) { return r.json(json).path("code").asString(); }

    List<String> fieldCodes(Resp r) {
        List<String> out = new ArrayList<>();
        r.json(json).path("fieldErrors").forEach(n -> out.add(n.path("field").asString() + ":" + n.path("code").asString()));
        return out;
    }

    Resp login(String user, String pw) throws Exception { return send("POST", "/api/v1/auth/login", null, j("username", user, "password", pw)); }

    String normalized(String formatted) { return RecoveryKeys.normalize(formatted).orElseThrow(); }

    // ---- scenario -----------------------------------------------------------------------------------------------

    @Test @Order(1)
    void setupModeBlocksEverythingExceptTheWizardEndpoints() throws Exception {
        Resp blocked = send("GET", "/api/v1/subjects", null, null);
        assertThat(blocked.status()).isEqualTo(401);
        assertThat(code(blocked)).isEqualTo("SETUP_REQUIRED");
        Resp status = send("GET", "/api/v1/auth/status", null, null);
        assertThat(status.status()).isEqualTo(200);
        assertThat(status.json(json).path("setupRequired").asBoolean()).isTrue();
        assertThat(status.json(json).path("authenticated").asBoolean()).isFalse();
        assertThat(send("GET", "/internal/health", null, null).body()).contains("\"status\":\"UP\"").contains("appVersion").contains("startup");
        assertThat(send("GET", "/api/v1/system/health", null, null).status()).isEqualTo(200);   // wizard step 1
        assertThat(send("GET", "/api/v1/settings/school", null, null).status()).isEqualTo(401);

        // a new or reinstalled PC restores a backup BEFORE it has an account; nothing else about backups is open
        assertThat(code(send("GET", "/api/v1/backups", null, null))).isEqualTo("SETUP_REQUIRED");
        assertThat(code(send("POST", "/api/v1/backups", null, null))).isEqualTo("SETUP_REQUIRED");
        assertThat(send("GET", "/api/v1/backups/restore", null, null).status()).isEqualTo(200);
        assertThat(code(send("POST", "/api/v1/backups/restore/stage", null, "{\"fileName\":\"incoming-1.zip\"}"))).isEqualTo("BACKUP_NOT_FOUND");
        assertThat(code(send("POST", "/api/v1/backups/restore/apply", null, null))).isEqualTo("RESTORE_NOTHING_STAGED");
        assertThat(send("GET", "/api/v1/audit", null, null).status()).isEqualTo(401);
        assertThat(send("GET", "/api/v1/acceptance", null, null).status()).as("sign-offs are for the signed-in administrator").isEqualTo(401);

        // who the program is: open before any account exists, and identical to the ONE authoritative file
        Resp about = send("GET", "/api/v1/system/about", null, null);
        assertThat(about.status()).isEqualTo(200);
        JsonNode release = json.readTree(Files.readString(Path.of("..", "release", "release.json"), StandardCharsets.UTF_8));
        for (String field : List.of("name", "shortName", "developer", "version", "channel", "copyright")) {
            assertThat(about.json(json).path(field).asString()).as("about." + field).isEqualTo(release.path(field).asString());
        }
        assertThat(send("GET", "/internal/health", null, null).json(json).path("appVersion").asString()).as("the health line agrees").isEqualTo(release.path("version").asString());
    }

    @Test @Order(2)
    void setupRejectsBadInputWithMachineCodesAndCreatesNothing() throws Exception {
        Resp r = send("POST", "/api/v1/auth/setup", null, j("displayName", "សុខា", "username", "ab", "password", "short"));
        assertThat(r.status()).isEqualTo(422);
        assertThat(fieldCodes(r)).contains("username:USERNAME_INVALID", "password:PASSWORD_TOO_SHORT");
        assertThat(fieldCodes(send("POST", "/api/v1/auth/setup", null, j("displayName", "សុខា", "username", "admin.sokha", "password", "Password123"))))
                .containsExactly("password:PASSWORD_WEAK");
        assertThat(fieldCodes(send("POST", "/api/v1/auth/setup", null, j("displayName", "សុខា", "username", "admin.sokha", "password", "x".repeat(80)))))
                .containsExactly("password:PASSWORD_TOO_LONG");
        assertThat(jdbc.queryForObject("select count(*) from app_users", Integer.class)).isZero();
    }

    @Test @Order(3)
    void setupCreatesTheAdministratorAndShowsTheKeyOnce() throws Exception {
        Resp r = send("POST", "/api/v1/auth/setup", null, j("displayName", "អ្នកគ្រប់គ្រង សុខា", "username", "  Admin.Sokha ", "password", PW1));
        assertThat(r.status()).isEqualTo(201);
        assertThat(r.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        JsonNode n = r.json(json);
        token1 = n.path("token").asString();
        key1 = n.path("recoveryKey").asString();
        SECRETS.addAll(List.of(PW1, PW2, PW3, token1, key1, normalized(key1)));
        assertThat(n.path("user").path("username").asString()).isEqualTo("admin.sokha");
        assertThat(n.path("user").path("displayName").asString()).isEqualTo("អ្នកគ្រប់គ្រង សុខា");
        assertThat(key1).matches(FORMATTED_KEY);

        // only hashes are stored, never the password or the key
        Map<String, Object> row = jdbc.queryForMap("select * from app_users");
        String all = row.values().stream().map(String::valueOf).reduce("", (a, b) -> a + "|" + b);
        assertThat(all).doesNotContain(PW1).doesNotContain(normalized(key1)).doesNotContain(key1);
        assertThat((String) row.get("password_hash")).startsWith("$2a$12$");
        assertThat((String) row.get("recovery_key_hash")).startsWith("$2a$12$");
        assertThat(encoder.matches(normalized(key1), (String) row.get("recovery_key_hash"))).isTrue();
        assertThat(row.get("recovery_key_confirmed_at")).isNull();

        Resp again = send("POST", "/api/v1/auth/setup", null, j("displayName", "x", "username", "second.admin", "password", PW1));
        assertThat(again.status()).isEqualTo(409);
        assertThat(code(again)).isEqualTo("SETUP_ALREADY_DONE");

        JsonNode st = send("GET", "/api/v1/auth/status", token1, null).json(json);
        assertThat(st.path("setupRequired").asBoolean()).isFalse();
        assertThat(st.path("authenticated").asBoolean()).isTrue();
        assertThat(st.path("recoveryKeyPending").asBoolean()).isTrue();
        assertThat(st.path("setupCompleted").asBoolean()).isFalse();
    }

    @Test @Order(4)
    void afterSetupAnonymousRequestsAreUnauthenticatedAndTheTokenWorks() throws Exception {
        assertThat(code(send("GET", "/api/v1/subjects", null, null))).isEqualTo("UNAUTHENTICATED");
        assertThat(code(send("GET", "/api/v1/subjects", "garbage-token", null))).isEqualTo("UNAUTHENTICATED");
        Resp ok = send("GET", "/api/v1/subjects", token1, null);
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.json(json).size()).isEqualTo(8);
        assertThat(send("GET", "/api/v1/system/health", null, null).status()).isEqualTo(401);
    }

    @Test @Order(5)
    void loginThrottleIsPersistedEscalatesAndNeverRevealsWhetherAUserExists() throws Exception {
        Resp unknown = login("nobody.here", "whatever-password");
        assertThat(unknown.status()).isEqualTo(401);
        assertThat(code(unknown)).isEqualTo("INVALID_CREDENTIALS");
        for (int i = 1; i <= 4; i++) {
            Resp r = login("admin.sokha", "wrong-password-" + i);
            assertThat(r.status()).as("attempt " + i).isEqualTo(401);
            assertThat(code(r)).isEqualTo("INVALID_CREDENTIALS");
        }
        Resp fifth = login("admin.sokha", "wrong-password-5");
        assertThat(fifth.status()).isEqualTo(429);
        assertThat(code(fifth)).isEqualTo("ACCOUNT_LOCKED");
        long retry = fifth.json(json).path("retryAfterSeconds").asLong();
        assertThat(retry).isBetween(1L, 62L);
        assertThat(login("admin.sokha", PW1).status()).as("even the right password is refused while locked").isEqualTo(429);

        Map<String, Object> db = jdbc.queryForMap("select failed_attempts, locked_until from app_users");
        assertThat(((Number) db.get("failed_attempts")).intValue()).isEqualTo(5);     // in the DB, so a restart cannot reset it
        assertThat(db.get("locked_until")).isNotNull();

        CLOCK.advance(Duration.ofSeconds(61));
        Resp ok = login("ADMIN.Sokha", PW1);                                             // username is case-insensitive
        assertThat(ok.status()).isEqualTo(200);
        token2 = ok.json(json).path("token").asString();
        SECRETS.add(token2);
        assertThat(ok.json(json).path("recoveryKeyPending").asBoolean()).isTrue();
        Map<String, Object> reset = jdbc.queryForMap("select failed_attempts, locked_until from app_users");
        assertThat(((Number) reset.get("failed_attempts")).intValue()).isZero();
        assertThat(reset.get("locked_until")).isNull();
    }

    @Test @Order(6)
    void confirmingTheRecoveryKeyClearsThePendingFlag() throws Exception {
        assertThat(send("POST", "/api/v1/auth/recovery-key/confirm", token1, null).status()).isEqualTo(204);
        assertThat(send("GET", "/api/v1/auth/status", token1, null).json(json).path("recoveryKeyPending").asBoolean()).isFalse();
    }

    @Test @Order(7)
    void unlockNeedsThePassword() throws Exception {
        Resp wrong = send("POST", "/api/v1/auth/unlock", token1, j("password", "not-it-at-all"));
        assertThat(wrong.status()).isEqualTo(422);
        assertThat(fieldCodes(wrong)).containsExactly("password:INVALID_PASSWORD");
        assertThat(send("POST", "/api/v1/auth/unlock", token1, j("password", PW1)).status()).isEqualTo(204);
    }

    @Test @Order(8)
    void changingThePasswordSignsOtherWindowsOutAndAcceptsAKhmerPassword() throws Exception {
        assertThat(fieldCodes(send("POST", "/api/v1/auth/change-password", token2, j("currentPassword", "nope", "newPassword", PW2))))
                .containsExactly("currentPassword:INVALID_PASSWORD");
        assertThat(fieldCodes(send("POST", "/api/v1/auth/change-password", token2, j("currentPassword", PW1, "newPassword", "password123"))))
                .containsExactly("newPassword:PASSWORD_WEAK");
        assertThat(send("POST", "/api/v1/auth/change-password", token2, j("currentPassword", PW1, "newPassword", PW2)).status()).isEqualTo(204);

        assertThat(send("GET", "/api/v1/subjects", token1, null).status()).as("the other window is signed out").isEqualTo(401);
        assertThat(send("GET", "/api/v1/subjects", token2, null).status()).as("this window stays signed in").isEqualTo(200);
        assertThat(login("admin.sokha", PW1).status()).as("old password").isEqualTo(401);
        Resp ok = login("admin.sokha", PW2);
        assertThat(ok.status()).isEqualTo(200);
        token3 = ok.json(json).path("token").asString();
        SECRETS.add(token3);
    }

    @Test @Order(9)
    void recoveryWorksOfflineRotatesTheKeyAndInvalidatesTheOldOneImmediately() throws Exception {
        for (int i = 1; i <= 4; i++) {
            Resp r = send("POST", "/api/v1/auth/recover", null, j("recoveryKey", "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZ" + i, "newPassword", PW3));
            assertThat(r.status()).as("wrong key " + i).isEqualTo(401);
            assertThat(code(r)).isEqualTo("INVALID_RECOVERY_KEY");
        }
        Resp lock = send("POST", "/api/v1/auth/recover", null, j("recoveryKey", "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZ5", "newPassword", PW3));
        assertThat(lock.status()).isEqualTo(429);
        assertThat(code(lock)).isEqualTo("ACCOUNT_LOCKED");
        assertThat(send("POST", "/api/v1/auth/recover", null, j("recoveryKey", key1, "newPassword", PW3)).status())
                .as("even the right key is refused while locked").isEqualTo(429);
        CLOCK.advance(Duration.ofSeconds(61));

        Resp weak = send("POST", "/api/v1/auth/recover", null, j("recoveryKey", key1, "newPassword", "12345678"));
        assertThat(fieldCodes(weak)).containsExactly("newPassword:PASSWORD_WEAK");          // does not burn the key

        String typedByHand = normalized(key1).toLowerCase();                                // lower-case, no dashes
        Resp ok = send("POST", "/api/v1/auth/recover", null, j("recoveryKey", typedByHand, "newPassword", PW3));
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(ok.json(json).path("username").asString()).isEqualTo("admin.sokha");     // shown, in case it was forgotten too
        key2 = ok.json(json).path("recoveryKey").asString();
        SECRETS.addAll(List.of(key2, normalized(key2)));
        assertThat(key2).matches(FORMATTED_KEY).isNotEqualTo(key1);

        assertThat(send("POST", "/api/v1/auth/recover", null, j("recoveryKey", key1, "newPassword", PW3)).status())
                .as("the used key is dead immediately").isEqualTo(401);
        assertThat(send("GET", "/api/v1/subjects", token2, null).status()).as("sessions revoked").isEqualTo(401);
        assertThat(send("GET", "/api/v1/subjects", token3, null).status()).isEqualTo(401);
        assertThat(login("admin.sokha", PW2).status()).as("old password").isEqualTo(401);
        Resp in = login("admin.sokha", PW3);
        assertThat(in.status()).isEqualTo(200);
        token4 = in.json(json).path("token").asString();
        SECRETS.add(token4);
        assertThat(in.json(json).path("recoveryKeyPending").asBoolean()).as("new key must be saved again").isTrue();

        Map<String, Object> row = jdbc.queryForMap("select recovery_failed_attempts, recovery_locked_until, recovery_key_confirmed_at, recovery_key_hash from app_users");
        assertThat(encoder.matches(normalized(key2), (String) row.get("recovery_key_hash"))).isTrue();
        assertThat(encoder.matches(normalized(key1), (String) row.get("recovery_key_hash"))).isFalse();
        assertThat(row.get("recovery_key_confirmed_at")).isNull();

        // the wizard cannot finish while the key is unconfirmed (approved default 9)
        Resp early = send("POST", "/api/v1/setup/complete", token4, null);
        assertThat(early.status()).isEqualTo(409);
        assertThat(code(early)).isEqualTo("RECOVERY_KEY_NOT_CONFIRMED");
    }

    @Test @Order(10)
    void regeneratingTheKeyNeedsThePasswordAndKillsThePreviousKey() throws Exception {
        assertThat(fieldCodes(send("POST", "/api/v1/auth/recovery-key/regenerate", token4, j("currentPassword", "wrong-password"))))
                .containsExactly("currentPassword:INVALID_PASSWORD");
        Resp ok = send("POST", "/api/v1/auth/recovery-key/regenerate", token4, j("currentPassword", PW3));
        assertThat(ok.status()).isEqualTo(200);
        key3 = ok.json(json).path("recoveryKey").asString();
        SECRETS.addAll(List.of(key3, normalized(key3)));
        assertThat(key3).matches(FORMATTED_KEY).isNotIn(key1, key2);
        assertThat(send("POST", "/api/v1/auth/recover", null, j("recoveryKey", key2, "newPassword", "Another-Pass-2026")).status()).isEqualTo(401);
        assertThat(send("POST", "/api/v1/auth/recovery-key/confirm", token4, null).status()).isEqualTo(204);
    }

    @Test @Order(11)
    void schoolProfileStoresKhmerNormalizesAndUsesOptimisticLocking() throws Exception {
        JsonNode before = send("GET", "/api/v1/settings/school", token4, null).json(json);
        assertThat(before.path("nameKm").isNull()).isTrue();
        long v = before.path("version").asLong();
        String body = json.writeValueAsString(Map.of("nameKm", "សាលាបឋមសិក្សា  ភូមិថ្មី", "nameEn", "New Village Primary School",
                "address", "ភូមិថ្មី ឃុំសាមគ្គី", "phone", "០១២ ៣៤៥ ៦៧៨", "directorName", "លោក សុខ", "version", v));
        Resp ok = send("PUT", "/api/v1/settings/school", token4, body);
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.json(json).path("nameKm").asString()).isEqualTo("សាលាបឋមសិក្សា ភូមិថ្មី");   // spaces collapsed
        assertThat(ok.json(json).path("phone").asString()).isEqualTo("012 345 678");                // Khmer digits -> ASCII
        assertThat(ok.json(json).path("version").asLong()).isEqualTo(v + 1);
        assertThat(jdbc.queryForObject("select name_km from school_settings where id = 1", String.class)).isEqualTo("សាលាបឋមសិក្សា ភូមិថ្មី");
        assertThat(code(send("PUT", "/api/v1/settings/school", token4, body))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");
        Resp blank = send("PUT", "/api/v1/settings/school", token4, json.writeValueAsString(Map.of("nameKm", "  ", "version", v + 1)));
        assertThat(blank.status()).isEqualTo(422);
        assertThat(fieldCodes(blank)).contains("nameKm:NotBlank");
    }

    @Test @Order(12)
    void logoIsValidatedResizedStoredByGeneratedNameAndServedSafely() throws Exception {
        BufferedImage img = new BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(img, "png", png);
        Path dir = DataDirs.schoolUploads();

        Resp up = upload("/api/v1/settings/school/logo", token4, "logo.png", "image/png", png.toByteArray());
        assertThat(up.status()).isEqualTo(200);
        String name = up.json(json).path("logoFile").asString();
        assertThat(name).matches("^logo-[0-9a-f-]{36}\\.png$");
        assertThat(Files.isRegularFile(dir.resolve(name))).isTrue();

        Resp file = send("GET", "/api/v1/files/school/" + name, token4, null);
        assertThat(file.status()).isEqualTo(200);
        assertThat(file.headers().firstValue("Content-Type").orElse("")).contains("image/png");
        BufferedImage served = ImageIO.read(new ByteArrayInputStream(file.bytes()));
        assertThat(served.getWidth()).isEqualTo(512);                                      // 800x600 capped to 512 wide
        assertThat(served.getHeight()).isEqualTo(384);
        assertThat(send("GET", "/api/v1/files/school/" + name, null, null).status()).as("images need a session").isEqualTo(401);

        Resp notImage = upload("/api/v1/settings/school/logo", token4, "evil.png", "image/png", "this is not an image".getBytes(StandardCharsets.UTF_8));
        assertThat(notImage.status()).isEqualTo(422);
        assertThat(fieldCodes(notImage)).containsExactly("file:INVALID_IMAGE");
        assertThat(list(dir)).containsExactly(name);

        for (String bad : List.of("..%2F..%2Fconfig%2Frunning.lock", "..%5C..%5Cdatabase%5Cschool.db", "logo-x.png", "%2E%2E%2Fsecret")) {
            int s = send("GET", "/api/v1/files/school/" + bad, token4, null).status();
            assertThat(s).as("traversal attempt " + bad).isIn(400, 404);
        }

        Resp replaced = upload("/api/v1/settings/school/logo", token4, "logo2.png", "image/png", png.toByteArray());
        String name2 = replaced.json(json).path("logoFile").asString();
        assertThat(name2).isNotEqualTo(name);
        assertThat(list(dir)).as("the old file is removed").containsExactly(name2);

        Resp del = send("DELETE", "/api/v1/settings/school/logo", token4, null);
        assertThat(del.json(json).path("logoFile").isNull()).isTrue();
        assertThat(list(dir)).isEmpty();
    }

    @Test @Order(13)
    void appSettingsAreWhitelistedAndValidatedAllOrNothing() throws Exception {
        assertThat(send("GET", "/api/v1/settings/app", token4, null).body()).as("the USB reminder is OFF (0) until the school asks for it: a copy on a USB stick is optional").contains("\"backup.reminderDays\":\"0\"").contains("\"ui.idleLockMinutes\":\"10\"");
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"backup.reminderDays\":\"91\"}").status()).as("at most 90 days").isEqualTo(422);
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"backup.reminderDays\":\"14\"}").status()).isEqualTo(200);
        Resp bad = send("PUT", "/api/v1/settings/app", token4, "{\"backup.reminderDays\":\"30\",\"ui.idleLockMinutes\":\"0\",\"setup.completed_at\":\"x\"}");
        assertThat(bad.status()).isEqualTo(422);
        assertThat(fieldCodes(bad)).contains("ui.idleLockMinutes:INVALID_SETTING", "setup.completed_at:INVALID_SETTING");
        assertThat(send("GET", "/api/v1/settings/app", token4, null).body()).as("nothing stored from a rejected request").contains("\"backup.reminderDays\":\"14\"");
    }

    @Test @Order(14)
    void academicBasicsForTheWizard() throws Exception {
        JsonNode grades = send("GET", "/api/v1/grades", token4, null).json(json);
        assertThat(grades.size()).isEqualTo(6);
        assertThat(grades.get(0).path("nameKm").asString()).isEqualTo("ថ្នាក់ទី១");

        String a = json.writeValueAsString(Map.of("nameKm", "២០២៦-២០២៧", "startDate", "2026-11-01", "endDate", "2027-08-31", "makeCurrent", true));
        String b = json.writeValueAsString(Map.of("nameKm", "២០២៧-២០២៨", "startDate", "2027-11-01", "endDate", "2028-08-31", "makeCurrent", true));
        assertThat(send("POST", "/api/v1/academic-years", token4, a).status()).isEqualTo(201);
        assertThat(send("POST", "/api/v1/academic-years", token4, b).status()).isEqualTo(201);
        JsonNode years = send("GET", "/api/v1/academic-years", token4, null).json(json);
        int current = 0;
        for (JsonNode y : years) if (y.path("current").asBoolean()) { current++; assertThat(y.path("nameKm").asString()).isEqualTo("២០២៧-២០២៨"); }
        assertThat(current).as("exactly one current academic year").isEqualTo(1);
        assertThat(code(send("POST", "/api/v1/academic-years", token4, a))).isEqualTo("DUPLICATE");
        String backwards = json.writeValueAsString(Map.of("nameKm", "២០៣០", "startDate", "2030-08-31", "endDate", "2030-01-01", "makeCurrent", false));
        assertThat(fieldCodes(send("POST", "/api/v1/academic-years", token4, backwards))).containsExactly("endDate:END_BEFORE_START");

        JsonNode subjects = send("GET", "/api/v1/subjects", token4, null).json(json);
        JsonNode english = null;
        for (JsonNode s : subjects) if (s.path("code").asString().equals("ENGLISH")) english = s;
        assertThat(english.path("active").asBoolean()).isFalse();
        String on = "{\"active\":true,\"version\":" + english.path("version").asLong() + "}";
        assertThat(send("PUT", "/api/v1/subjects/" + english.path("id").asLong() + "/active", token4, on).json(json).path("active").asBoolean()).isTrue();
        assertThat(code(send("PUT", "/api/v1/subjects/" + english.path("id").asLong() + "/active", token4, on))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");
    }

    @Test @Order(15)
    void setupProgressAndCompletion() throws Exception {
        assertThat(send("PUT", "/api/v1/setup/progress", token4, "{\"step\":5}").json(json).path("step").asInt()).isEqualTo(5);
        assertThat(send("PUT", "/api/v1/setup/progress", token4, "{\"step\":9}").status()).isEqualTo(422);
        Resp done = send("POST", "/api/v1/setup/complete", token4, null);
        assertThat(done.status()).isEqualTo(200);
        assertThat(done.json(json).path("completed").asBoolean()).isTrue();
        assertThat(send("GET", "/api/v1/auth/status", token4, null).json(json).path("setupCompleted").asBoolean()).isTrue();
    }

    @Test @Order(16)
    void healthChecksReportEverythingAndDeepCheckVerifiesTheDatabase() throws Exception {
        JsonNode quick = send("GET", "/api/v1/system/health", token4, null).json(json);
        List<String> ids = new ArrayList<>();
        quick.path("checks").forEach(c -> ids.add(c.path("id").asString()));
        assertThat(ids).contains("DATA_DIR_WRITABLE", "DISK_SPACE", "DATABASE", "SCHEMA_VERSION", "DIRTY_SHUTDOWN", "BACKUP_AGE",
                "MEMORY", "CLOCK_SANITY", "ACADEMIC_YEAR_CURRENT", "LOG_SIZE", "APP_VERSIONS");
        assertThat(quick.path("status").asString()).isIn("OK", "INFO", "WARN");
        String latest = latestMigrationVersion();
        quick.path("checks").forEach(c -> {
            if (c.path("id").asString().equals("SCHEMA_VERSION")) assertThat(c.path("params").path("version").asString()).isEqualTo(latest);
            if (c.path("id").asString().equals("DATABASE")) assertThat(c.path("status").asString()).as(c.toString()).isEqualTo("OK");
            if (c.path("id").asString().equals("DATA_DIR_WRITABLE")) assertThat(c.path("status").asString()).as(c.toString()).isEqualTo("OK");
        });
        JsonNode deep = send("POST", "/api/v1/system/health/deep", token4, null).json(json);
        deep.path("checks").forEach(c -> {
            if (c.path("id").asString().equals("DB_INTEGRITY")) assertThat(c.path("status").asString()).isEqualTo("OK");
            if (c.path("id").asString().equals("UPLOADS_CONSISTENCY")) assertThat(c.path("status").asString()).isEqualTo("OK");
        });
        assertThat(deep.path("checks").size()).as("the deep check adds integrity, uploads and 'the newest backup really opens'").isEqualTo(quick.path("checks").size() + 3);
        assertThat(send("GET", "/api/v1/system/info", token4, null).body()).contains("heapMaxMb");
    }

    @Test @Order(17)
    void launchSecretAndCorsAreEnforced() throws Exception {
        assertThat(exec("GET", "/internal/health", null, false, null, null, Map.of()).status()).isEqualTo(403);
        assertThat(exec("GET", "/internal/health", null, false, null, null, Map.of("X-SMS-Launch-Secret", "wrong-secret-wrong-secret")).status()).isEqualTo(403);
        assertThat(exec("GET", "/api/v1/subjects", token4, false, null, null, Map.of()).status()).as("a valid session alone is not enough").isEqualTo(403);

        Map<String, String> good = Map.of("Origin", "app://school", "Access-Control-Request-Method", "POST", "Access-Control-Request-Headers", "authorization,content-type,x-sms-launch-secret");
        Resp ok = exec("OPTIONS", "/api/v1/auth/login", null, false, null, null, good);
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.headers().firstValue("Access-Control-Allow-Origin").orElse("")).isEqualTo("app://school");
        Map<String, String> evil = Map.of("Origin", "http://evil.example", "Access-Control-Request-Method", "POST");
        assertThat(exec("OPTIONS", "/api/v1/auth/login", null, false, null, null, evil).status()).isEqualTo(403);
    }

    // ---- Phase 2a: academic setup --------------------------------------------------------------------------------

    @Test @Order(19)
    void academicYearsCanBeEditedSwitchedClosedAndReopened() throws Exception {
        assertThat(send("GET", "/api/v1/academic-years", null, null).status()).as("needs a session").isEqualTo(401);
        long id26 = yearId("២០២៦-២០២៧");
        long id27 = yearId("២០២៧-២០២៨");
        assertThat(currentYearIds()).as("step 14 left 2027-2028 current").containsExactly(id27);

        JsonNode before = yearById(id26);
        String edit = json.writeValueAsString(Map.of("nameKm", " ២០២៦-២០២៧ (កែ) ", "startDate", "2026-10-01", "endDate", "2027-08-31", "version", before.path("version").asLong()));
        Resp ok = send("PUT", "/api/v1/academic-years/" + id26, token4, edit);
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.json(json).path("nameKm").asString()).as("normalised: trimmed").isEqualTo("២០២៦-២០២៧ (កែ)");
        assertThat(ok.json(json).path("startDate").asString()).isEqualTo("2026-10-01");
        long version = ok.json(json).path("version").asLong();
        assertThat(version).isGreaterThan(before.path("version").asLong());
        assertThat(code(send("PUT", "/api/v1/academic-years/" + id26, token4, edit))).as("the same stale version again").isEqualTo("OPTIMISTIC_LOCK");

        String clash = json.writeValueAsString(Map.of("nameKm", "២០២៧-២០២៨", "startDate", "2026-10-01", "endDate", "2027-08-31", "version", version));
        Resp dup = send("PUT", "/api/v1/academic-years/" + id26, token4, clash);
        assertThat(dup.status()).isEqualTo(409);
        assertThat(code(dup)).isEqualTo("DUPLICATE");
        assertThat(fieldCodes(dup)).containsExactly("nameKm:DUPLICATE");
        String backwards = json.writeValueAsString(Map.of("nameKm", "២០២៦-២០២៧ (កែ)", "startDate", "2027-09-01", "endDate", "2027-08-31", "version", version));
        assertThat(fieldCodes(send("PUT", "/api/v1/academic-years/" + id26, token4, backwards))).containsExactly("endDate:END_BEFORE_START");
        assertThat(yearById(id26).path("nameKm").asString()).as("rejected edits changed nothing").isEqualTo("២០២៦-២០២៧ (កែ)");

        // switching the current year
        Resp cur = send("POST", "/api/v1/academic-years/" + id26 + "/set-current", token4, null);
        assertThat(cur.status()).isEqualTo(200);
        assertThat(cur.json(json).path("current").asBoolean()).isTrue();
        assertThat(currentYearIds()).as("exactly one current year after switching").containsExactly(id26);

        // closing the current year leaves the school with no current year, and freezes the year
        Resp closed = send("POST", "/api/v1/academic-years/" + id26 + "/close", token4, null);
        assertThat(closed.json(json).path("status").asString()).isEqualTo("CLOSED");
        assertThat(closed.json(json).path("current").asBoolean()).isFalse();
        assertThat(currentYearIds()).isEmpty();
        assertThat(send("POST", "/api/v1/academic-years/" + id26 + "/close", token4, null).status()).as("closing twice is harmless").isEqualTo(200);
        String late = json.writeValueAsString(Map.of("nameKm", "ក", "startDate", "2026-10-01", "endDate", "2027-08-31", "version", yearById(id26).path("version").asLong()));
        assertThat(code(send("PUT", "/api/v1/academic-years/" + id26, token4, late))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("POST", "/api/v1/academic-years/" + id26 + "/set-current", token4, null))).isEqualTo("ACADEMIC_YEAR_CLOSED");

        // reopening does not make it current by itself
        Resp reopened = send("POST", "/api/v1/academic-years/" + id26 + "/reopen", token4, null);
        assertThat(reopened.json(json).path("status").asString()).isEqualTo("OPEN");
        assertThat(currentYearIds()).isEmpty();
        assertThat(send("POST", "/api/v1/academic-years/" + id27 + "/set-current", token4, null).status()).isEqualTo(200);
        assertThat(currentYearIds()).containsExactly(id27);
        assertThat(code(send("POST", "/api/v1/academic-years/999999/set-current", token4, null))).isEqualTo("NOT_FOUND");
    }

    @Test @Order(20)
    void subjectsCanBeAddedAndRenamedAndStartOutOfferedToEveryGrade() throws Exception {
        int before = send("GET", "/api/v1/subjects", token4, null).json(json).size();
        Resp first = send("POST", "/api/v1/subjects", token4, j("nameKm", "  កុំព្យូទ័រ ", "nameEn", " Computer "));
        assertThat(first.status()).isEqualTo(201);
        JsonNode a = first.json(json);
        assertThat(a.path("code").asString()).matches("SUBJ-\\d{3}");
        assertThat(a.path("nameKm").asString()).as("normalised").isEqualTo("កុំព្យូទ័រ");
        assertThat(a.path("nameEn").asString()).isEqualTo("Computer");
        assertThat(a.path("active").asBoolean()).isTrue();
        JsonNode b = send("POST", "/api/v1/subjects", token4, j("nameKm", "ចំណេះដឹងទូទៅ")).json(json);
        assertThat(Integer.parseInt(b.path("code").asString().substring(5))).as("codes come from one gap-free sequence")
                .isEqualTo(Integer.parseInt(a.path("code").asString().substring(5)) + 1);
        assertThat(send("GET", "/api/v1/subjects", token4, null).json(json).size()).isEqualTo(before + 2);

        Resp dup = send("POST", "/api/v1/subjects", token4, j("nameKm", "កុំព្យូទ័រ"));
        assertThat(dup.status()).isEqualTo(409);
        assertThat(fieldCodes(dup)).containsExactly("nameKm:DUPLICATE");
        assertThat(send("POST", "/api/v1/subjects", token4, j("nameKm", "   ")).status()).as("blank name").isEqualTo(422);
        assertThat(send("GET", "/api/v1/subjects", token4, null).json(json).size()).as("rejected requests added nothing").isEqualTo(before + 2);
        assertThat(jdbc.queryForObject("select next_value from id_sequences where name = 'subject' and year = 0", Long.class))
                .as("a rejected duplicate did not burn a number").isEqualTo(Long.parseLong(b.path("code").asString().substring(5)));

        for (JsonNode g : send("GET", "/api/v1/grades", token4, null).json(json)) {
            List<Long> offered = new ArrayList<>();
            g.path("subjectIds").forEach(n -> offered.add(n.asLong()));
            assertThat(offered).as("grade " + g.path("level").asInt() + " offers the new subjects").contains(a.path("id").asLong(), b.path("id").asLong());
        }

        long id = a.path("id").asLong();
        String rename = json.writeValueAsString(Map.of("nameKm", "ព័ត៌មានវិទ្យា", "nameEn", "", "version", a.path("version").asLong()));
        Resp renamed = send("PUT", "/api/v1/subjects/" + id, token4, rename);
        assertThat(renamed.status()).isEqualTo(200);
        assertThat(renamed.json(json).path("nameKm").asString()).isEqualTo("ព័ត៌មានវិទ្យា");
        assertThat(renamed.json(json).path("nameEn").isNull()).as("an empty English name is stored as nothing").isTrue();
        assertThat(renamed.json(json).path("code").asString()).as("the code never changes").isEqualTo(a.path("code").asString());
        assertThat(code(send("PUT", "/api/v1/subjects/" + id, token4, rename))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");
        String toExisting = json.writeValueAsString(Map.of("nameKm", "ភាសាខ្មែរ", "nameEn", "", "version", renamed.json(json).path("version").asLong()));
        assertThat(fieldCodes(send("PUT", "/api/v1/subjects/" + id, token4, toExisting))).containsExactly("nameKm:DUPLICATE");
        assertThat(code(send("PUT", "/api/v1/subjects/999999", token4, rename))).isEqualTo("NOT_FOUND");
    }

    @Test @Order(21)
    void eachGradeChoosesTheSubjectsItStudies() throws Exception {
        JsonNode grades = send("GET", "/api/v1/grades", token4, null).json(json);
        assertThat(grades.size()).isEqualTo(6);
        long grade1 = grades.get(0).path("id").asLong();
        long grade2 = grades.get(1).path("id").asLong();

        Map<String, Long> idByCode = new HashMap<>();
        send("GET", "/api/v1/subjects", token4, null).json(json).forEach(s -> idByCode.put(s.path("code").asString(), s.path("id").asLong()));
        List<Long> offered1 = subjectIdsOf(grades.get(0));
        assertThat(offered1).as("the migration offers the seven starting subjects to every grade")
                .contains(idByCode.get("KHMER"), idByCode.get("MATH"), idByCode.get("SCIENCE"), idByCode.get("SOCIAL"),
                        idByCode.get("MORAL"), idByCode.get("PE"), idByCode.get("ART"));
        assertThat(offered1).as("English was inactive when V3 ran").doesNotContain(idByCode.get("ENGLISH"));

        long khmer = idByCode.get("KHMER");
        long math = idByCode.get("MATH");
        Resp set = send("PUT", "/api/v1/grades/" + grade1 + "/subjects", token4, json.writeValueAsString(Map.of("subjectIds", List.of(math, khmer, math))));
        assertThat(set.status()).isEqualTo(200);
        assertThat(subjectIdsOf(set.json(json))).as("duplicates collapse, sorted").containsExactlyInAnyOrder(khmer, math);
        assertThat(subjectIdsOf(gradeById(grade1))).containsExactlyInAnyOrder(khmer, math);
        assertThat(subjectIdsOf(gradeById(grade2))).as("other grades are untouched").hasSizeGreaterThanOrEqualTo(7);

        Resp unknown = send("PUT", "/api/v1/grades/" + grade1 + "/subjects", token4, json.writeValueAsString(Map.of("subjectIds", List.of(khmer, 999999))));
        assertThat(unknown.status()).isEqualTo(422);
        assertThat(fieldCodes(unknown)).containsExactly("subjectIds:INVALID");
        assertThat(subjectIdsOf(gradeById(grade1))).as("a rejected request changed nothing").containsExactlyInAnyOrder(khmer, math);
        assertThat(send("PUT", "/api/v1/grades/" + grade1 + "/subjects", token4, "{}").status()).as("subjectIds is required").isEqualTo(422);
        assertThat(code(send("PUT", "/api/v1/grades/999999/subjects", token4, "{\"subjectIds\":[]}"))).isEqualTo("NOT_FOUND");

        assertThat(subjectIdsOf(send("PUT", "/api/v1/grades/" + grade1 + "/subjects", token4, "{\"subjectIds\":[]}").json(json))).as("a grade may study nothing yet").isEmpty();
        send("PUT", "/api/v1/grades/" + grade1 + "/subjects", token4, json.writeValueAsString(Map.of("subjectIds", offered1)));   // leave the data as the migration made it
    }

    // ---- Phase 2b: teachers ---------------------------------------------------------------------------------------

    static long teacher1, teacher2;

    @Test @Order(22)
    void teachersAreCreatedWithNormalisedFieldsAndGaplessCodes() throws Exception {
        assertThat(send("GET", "/api/v1/teachers", null, null).status()).as("needs a session").isEqualTo(401);
        String body = json.writeValueAsString(Map.of("nameKm", "  លោកគ្រូ  សុខ ", "gender", "MALE", "phone", " ០១២៣៤៥៦៧៨ ",
                "address", " ភូមិថ្មី ", "specialization", "គណិតវិទ្យា", "employmentDate", "2015-10-01"));
        Resp ok = send("POST", "/api/v1/teachers", token4, body);
        assertThat(ok.status()).isEqualTo(201);
        JsonNode a = ok.json(json);
        teacher1 = a.path("id").asLong();
        assertThat(a.path("teacherCode").asString()).isEqualTo("T-001");
        assertThat(a.path("nameKm").asString()).as("trimmed, spaces collapsed").isEqualTo("លោកគ្រូ សុខ");
        assertThat(a.path("phone").asString()).as("Khmer digits are stored as ASCII").isEqualTo("012345678");
        assertThat(a.path("address").asString()).isEqualTo("ភូមិថ្មី");
        assertThat(a.path("status").asString()).isEqualTo("ACTIVE");
        assertThat(a.path("employmentDate").asString()).isEqualTo("2015-10-01");
        JsonNode b = send("POST", "/api/v1/teachers", token4, j("nameKm", "អ្នកគ្រូ ចន្ទា", "gender", "FEMALE")).json(json);
        teacher2 = b.path("id").asLong();
        assertThat(b.path("teacherCode").asString()).isEqualTo("T-002");
        assertThat(b.path("phone").isNull()).isTrue();

        assertThat(send("POST", "/api/v1/teachers", token4, j("nameKm", "   ", "gender", "MALE")).status()).as("blank name").isEqualTo(422);
        assertThat(send("POST", "/api/v1/teachers", token4, j("nameKm", "ក")).status()).as("gender is required").isEqualTo(422);
        assertThat(send("POST", "/api/v1/teachers", token4, j("nameKm", "ក", "gender", "OTHER")).status()).as("unknown gender").isEqualTo(400);
        assertThat(jdbc.queryForObject("select count(*) from teachers", Integer.class)).as("rejected requests stored nothing").isEqualTo(2);
        assertThat(jdbc.queryForObject("select next_value from id_sequences where name = 'teacher' and year = 0", Long.class))
                .as("and burned no number").isEqualTo(2L);
    }

    @Test @Order(23)
    void teachersCanBeSearchedFilteredEditedAndDeactivated() throws Exception {
        assertThat(ids(send("GET", "/api/v1/teachers", token4, null))).containsExactly(teacher1, teacher2);
        assertThat(ids(send("GET", "/api/v1/teachers?q=" + enc("សុខ"), token4, null))).as("by name fragment").containsExactly(teacher1);
        assertThat(ids(send("GET", "/api/v1/teachers?q=t-002", token4, null))).as("by code, any case").containsExactly(teacher2);
        assertThat(ids(send("GET", "/api/v1/teachers?q=" + enc("០១២៣"), token4, null))).as("Khmer digits find the ASCII phone").containsExactly(teacher1);
        assertThat(ids(send("GET", "/api/v1/teachers?q=" + enc("គណិត"), token4, null))).as("by specialisation").containsExactly(teacher1);
        assertThat(ids(send("GET", "/api/v1/teachers?q=%25", token4, null))).as("a typed % is literal, not a wildcard").isEmpty();
        assertThat(ids(send("GET", "/api/v1/teachers?q=" + enc("   "), token4, null))).as("blank search = everything").containsExactly(teacher1, teacher2);

        long v = send("GET", "/api/v1/teachers/" + teacher1, token4, null).json(json).path("version").asLong();
        String edit = json.writeValueAsString(Map.of("nameKm", "លោកគ្រូ សុខា", "gender", "MALE", "phone", "", "address", "", "specialization", "", "version", v));
        Resp upd = send("PUT", "/api/v1/teachers/" + teacher1, token4, edit);
        assertThat(upd.status()).isEqualTo(200);
        assertThat(upd.json(json).path("nameKm").asString()).isEqualTo("លោកគ្រូ សុខា");
        assertThat(upd.json(json).path("phone").isNull()).as("an empty phone is stored as nothing").isTrue();
        assertThat(upd.json(json).path("teacherCode").asString()).as("the code never changes").isEqualTo("T-001");
        assertThat(code(send("PUT", "/api/v1/teachers/" + teacher1, token4, edit))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");

        long v2 = upd.json(json).path("version").asLong();
        Resp off = send("PUT", "/api/v1/teachers/" + teacher1 + "/active", token4, "{\"active\":false,\"version\":" + v2 + "}");
        assertThat(off.json(json).path("status").asString()).isEqualTo("INACTIVE");
        assertThat(ids(send("GET", "/api/v1/teachers?status=INACTIVE", token4, null))).containsExactly(teacher1);
        assertThat(ids(send("GET", "/api/v1/teachers?status=ACTIVE", token4, null))).containsExactly(teacher2);
        Resp on = send("PUT", "/api/v1/teachers/" + teacher1 + "/active", token4, "{\"active\":true,\"version\":" + off.json(json).path("version").asLong() + "}");
        assertThat(on.json(json).path("status").asString()).isEqualTo("ACTIVE");
        assertThat(code(send("GET", "/api/v1/teachers/999999", token4, null))).isEqualTo("NOT_FOUND");
    }

    // ---- Phase 2c: classes and subject teachers -------------------------------------------------------------------

    static long classA, classB, classC;

    @Test @Order(24)
    void classesAreCreatedValidatedAndListed() throws Exception {
        assertThat(send("GET", "/api/v1/classes", null, null).status()).as("needs a session").isEqualTo(401);
        long year27 = yearId("២០២៧-២០២៨");
        long grade1 = gradeIdOfLevel(1);
        long grade2 = gradeIdOfLevel(2);

        Resp ok = send("POST", "/api/v1/classes", token4, cls(year27, grade1, "  ក ", null, teacher1, null));
        assertThat(ok.status()).isEqualTo(201);
        JsonNode a = ok.json(json).path("schoolClass");
        classA = a.path("id").asLong();
        assertThat(a.path("nameKm").asString()).isEqualTo("ក");
        assertThat(a.path("capacity").asInt()).as("default capacity").isEqualTo(40);
        assertThat(a.path("homeroomTeacherName").asString()).isEqualTo("លោកគ្រូ សុខា");
        assertThat(a.path("studentCount").asInt()).isZero();
        assertThat(a.path("shift").isNull()).isTrue();
        assertThat(a.path("gradeLevel").asInt()).isEqualTo(1);
        assertThat(a.path("yearName").asString()).isEqualTo("២០២៧-២០២៨");
        classB = send("POST", "/api/v1/classes", token4, cls(year27, grade1, "ខ", 25, null, null)).json(json).path("schoolClass").path("id").asLong();
        Resp otherGrade = send("POST", "/api/v1/classes", token4, cls(year27, grade2, "ក", null, null, null));
        assertThat(otherGrade.status()).as("the same name in another grade is fine").isEqualTo(201);
        classC = otherGrade.json(json).path("schoolClass").path("id").asLong();

        Resp dup = send("POST", "/api/v1/classes", token4, cls(year27, grade1, "ក", null, null, null));
        assertThat(dup.status()).isEqualTo(409);
        assertThat(fieldCodes(dup)).containsExactly("nameKm:DUPLICATE");
        assertThat(send("POST", "/api/v1/classes", token4, cls(year27, grade1, "  ", null, null, null)).status()).as("blank name").isEqualTo(422);
        assertThat(send("POST", "/api/v1/classes", token4, cls(year27, grade1, "គ", 0, null, null)).status()).as("capacity 0").isEqualTo(422);
        assertThat(send("POST", "/api/v1/classes", token4, cls(year27, grade1, "គ", 201, null, null)).status()).as("capacity 201").isEqualTo(422);
        assertThat(fieldCodes(send("POST", "/api/v1/classes", token4, cls(year27, 999999L, "គ", null, null, null)))).containsExactly("gradeId:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/classes", token4, cls(999999L, grade1, "គ", null, null, null)))).containsExactly("academicYearId:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/classes", token4, cls(year27, grade1, "គ", null, 999999L, null)))).containsExactly("homeroomTeacherId:INVALID");
        setTeacherActive(teacher2, false);
        assertThat(fieldCodes(send("POST", "/api/v1/classes", token4, cls(year27, grade1, "គ", null, teacher2, null)))).containsExactly("homeroomTeacherId:TEACHER_INACTIVE");
        setTeacherActive(teacher2, true);
        assertThat(ids(send("GET", "/api/v1/classes?yearId=" + year27, token4, null))).as("rejected requests stored nothing; ordered by grade").containsExactly(classA, classB, classC);
        assertThat(ids(send("GET", "/api/v1/classes?yearId=" + year27 + "&gradeId=" + grade2, token4, null))).containsExactly(classC);
        assertThat(ids(send("GET", "/api/v1/classes?yearId=" + yearId("២០២៦-២០២៧ (កែ)"), token4, null))).as("another year has none yet").isEmpty();
    }

    @Test @Order(25)
    void classesCanBeEditedDeletedAndAreFrozenInAClosedYear() throws Exception {
        JsonNode before = send("GET", "/api/v1/classes/" + classA, token4, null).json(json).path("schoolClass");
        long v = before.path("version").asLong();
        String edit = clsUpdate("ក១", 30, teacher2, "MORNING", v);
        Resp upd = send("PUT", "/api/v1/classes/" + classA, token4, edit);
        assertThat(upd.status()).isEqualTo(200);
        JsonNode c = upd.json(json).path("schoolClass");
        assertThat(c.path("nameKm").asString()).isEqualTo("ក១");
        assertThat(c.path("capacity").asInt()).isEqualTo(30);
        assertThat(c.path("homeroomTeacherName").asString()).isEqualTo("អ្នកគ្រូ ចន្ទា");
        assertThat(c.path("shift").asString()).isEqualTo("MORNING");
        assertThat(code(send("PUT", "/api/v1/classes/" + classA, token4, edit))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");
        long v2 = c.path("version").asLong();
        assertThat(fieldCodes(send("PUT", "/api/v1/classes/" + classA, token4, clsUpdate("ខ", 30, null, null, v2)))).containsExactly("nameKm:DUPLICATE");
        Resp cleared = send("PUT", "/api/v1/classes/" + classA, token4, clsUpdate("ក១", 30, null, null, v2));
        assertThat(cleared.json(json).path("schoolClass").path("homeroomTeacherId").isNull()).as("homeroom teacher can be removed").isTrue();
        assertThat(cleared.json(json).path("schoolClass").path("shift").isNull()).isTrue();

        // a class that never had students can be deleted
        long year27 = yearId("២០២៧-២០២៨");
        long temp = send("POST", "/api/v1/classes", token4, cls(year27, gradeIdOfLevel(3), "ក្លែងក្លាយ", null, null, null)).json(json).path("schoolClass").path("id").asLong();
        assertThat(send("DELETE", "/api/v1/classes/" + temp, token4, null).status()).isEqualTo(204);
        assertThat(code(send("GET", "/api/v1/classes/" + temp, token4, null))).isEqualTo("NOT_FOUND");

        // nothing in a closed year changes
        long year26 = yearId("២០២៦-២០២៧ (កែ)");
        long old = send("POST", "/api/v1/classes", token4, cls(year26, gradeIdOfLevel(1), "ចាស់", null, null, null)).json(json).path("schoolClass").path("id").asLong();
        long oldVersion = send("GET", "/api/v1/classes/" + old, token4, null).json(json).path("schoolClass").path("version").asLong();
        assertThat(send("POST", "/api/v1/academic-years/" + year26 + "/close", token4, null).status()).isEqualTo(200);
        assertThat(code(send("PUT", "/api/v1/classes/" + old, token4, clsUpdate("ថ្មី", 30, null, null, oldVersion)))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("POST", "/api/v1/classes", token4, cls(year26, gradeIdOfLevel(2), "ថ្មី", null, null, null)))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("DELETE", "/api/v1/classes/" + old, token4, null))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("PUT", "/api/v1/classes/" + old + "/teachers", token4, "{\"assignments\":[]}"))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(send("POST", "/api/v1/academic-years/" + year26 + "/reopen", token4, null).status()).isEqualTo(200);
        assertThat(send("DELETE", "/api/v1/classes/" + old, token4, null).status()).as("deletable again once the year is open").isEqualTo(204);
        assertThat(code(send("DELETE", "/api/v1/classes/999999", token4, null))).isEqualTo("NOT_FOUND");
    }

    @Test @Order(26)
    void subjectTeachersAreChosenPerClassFromTheGradesSubjects() throws Exception {
        Map<String, Long> subject = subjectIdsByCode();
        long khmer = subject.get("KHMER");
        long math = subject.get("MATH");

        Resp ok = send("PUT", "/api/v1/classes/" + classA + "/teachers", token4, assignments(khmer, teacher1, math, teacher2));
        assertThat(ok.status()).isEqualTo(200);
        JsonNode list = ok.json(json).path("assignments");
        assertThat(list.size()).isEqualTo(2);
        assertThat(list.get(0).path("subjectName").asString()).isEqualTo("ភាសាខ្មែរ");
        assertThat(list.get(0).path("teacherName").asString()).isEqualTo("លោកគ្រូ សុខា");
        assertThat(send("GET", "/api/v1/classes/" + classA, token4, null).json(json).path("assignments").size()).isEqualTo(2);

        Resp mine = send("GET", "/api/v1/teachers/" + teacher1 + "/classes", token4, null);
        assertThat(mine.json(json).path("assignments").size()).as("the teacher's profile lists the class and subject").isEqualTo(1);
        assertThat(mine.json(json).path("assignments").get(0).path("subjectName").asString()).isEqualTo("ភាសាខ្មែរ");
        assertThat(mine.json(json).path("homeroomClasses").size()).as("teacher1 is no longer a homeroom teacher").isZero();

        assertThat(send("PUT", "/api/v1/classes/" + classA + "/teachers", token4, assignments(khmer, teacher1, khmer, teacher2)).status()).as("one teacher per subject").isEqualTo(422);
        assertThat(fieldCodes(send("PUT", "/api/v1/classes/" + classA + "/teachers", token4, assignments(subject.get("ENGLISH"), teacher1)))).as("English is not studied by grade 1 yet").containsExactly("assignments:SUBJECT_NOT_OFFERED");
        setTeacherActive(teacher2, false);
        assertThat(fieldCodes(send("PUT", "/api/v1/classes/" + classA + "/teachers", token4, assignments(khmer, teacher2)))).containsExactly("assignments:TEACHER_INACTIVE");
        setTeacherActive(teacher2, true);
        assertThat(fieldCodes(send("PUT", "/api/v1/classes/" + classA + "/teachers", token4, assignments(khmer, 999999L)))).containsExactly("assignments:INVALID");
        assertThat(send("GET", "/api/v1/classes/" + classA, token4, null).json(json).path("assignments").size()).as("rejected requests changed nothing").isEqualTo(2);

        assertThat(send("PUT", "/api/v1/classes/" + classA + "/teachers", token4, "{\"assignments\":[]}").json(json).path("assignments").size()).as("may be emptied").isZero();
        assertThat(send("PUT", "/api/v1/classes/" + classA + "/teachers", token4, "{}").status()).as("the list is required").isEqualTo(422);
        assertThat(code(send("PUT", "/api/v1/classes/999999/teachers", token4, "{\"assignments\":[]}"))).isEqualTo("NOT_FOUND");
        send("PUT", "/api/v1/classes/" + classA + "/teachers", token4, assignments(khmer, teacher1, math, teacher2));   // used by the later steps
    }

    // ---- Phase 2d: students and guardians ------------------------------------------------------------------------

    static long s1, s2, dup, sf, s3, s4, s5;

    @Test @Order(27)
    void studentsAreRegisteredWithGuardiansACodeAndAnOptionalClass() throws Exception {
        assertThat(send("GET", "/api/v1/students", null, null).status()).as("needs a session").isEqualTo(401);
        Resp ok = send("POST", "/api/v1/students", token4, studentBody("  សុខ  វណ្ណា ", "FEMALE", "2019-05-01", "2026-10-01", classA, false,
                guardian("សុខ ចាន់", "FATHER", "០១២៣៤៥៦៧៨៩", false), guardian("ម៉ៅ ស្រី", "MOTHER", "098765432", false)));
        assertThat(ok.status()).isEqualTo(201);
        JsonNode a = ok.json(json);
        s1 = a.path("student").path("id").asLong();
        assertThat(a.path("student").path("studentCode").asString()).isEqualTo("2026-0001");
        assertThat(a.path("student").path("nameKm").asString()).as("normalised").isEqualTo("សុខ វណ្ណា");
        assertThat(a.path("student").path("status").asString()).isEqualTo("ACTIVE");
        assertThat(a.path("guardians").size()).isEqualTo(2);
        assertThat(a.path("guardians").get(0).path("primary").asBoolean()).as("the first guardian is primary when none is marked").isTrue();
        assertThat(a.path("guardians").get(0).path("phone").asString()).as("Khmer digits are stored as ASCII").isEqualTo("0123456789");
        assertThat(a.path("guardians").get(1).path("primary").asBoolean()).isFalse();
        assertThat(a.path("enrollments").size()).isEqualTo(1);
        assertThat(a.path("enrollments").get(0).path("status").asString()).isEqualTo("ACTIVE");
        assertThat(a.path("enrollments").get(0).path("className").asString()).isEqualTo("ក១");
        assertThat(a.path("warnings").size()).isZero();

        JsonNode b = send("POST", "/api/v1/students", token4, studentBody("ចាន់ ដារា", "MALE", "2018-03-10", "2026-10-02", null, false)).json(json);
        s2 = b.path("student").path("id").asLong();
        assertThat(b.path("student").path("studentCode").asString()).isEqualTo("2026-0002");
        assertThat(b.path("enrollments").size()).as("registered without a class").isZero();
        assertThat(b.path("guardians").size()).isZero();

        // same Khmer name + date of birth: a warning the user confirms, never a block
        Resp attempt = send("POST", "/api/v1/students", token4, studentBody("សុខ វណ្ណា", "FEMALE", "2019-05-01", "2026-10-03", null, false));
        assertThat(attempt.status()).isEqualTo(409);
        assertThat(code(attempt)).isEqualTo("POSSIBLE_DUPLICATE");
        assertThat(attempt.json(json).path("studentCode").asString()).isEqualTo("2026-0001");
        assertThat(attempt.json(json).path("studentId").asLong()).isEqualTo(s1);
        Resp confirmed = send("POST", "/api/v1/students", token4, studentBody("សុខ វណ្ណា", "FEMALE", "2019-05-01", "2026-10-03", null, true));
        assertThat(confirmed.status()).isEqualTo(201);
        dup = confirmed.json(json).path("student").path("id").asLong();
        assertThat(confirmed.json(json).path("student").path("studentCode").asString()).as("the refused attempt burned no number").isEqualTo("2026-0003");
        JsonNode future = send("POST", "/api/v1/students", token4, studentBody("ឆ្នាំក្រោយ", "MALE", "2020-01-01", "2027-01-10", null, false)).json(json);
        sf = future.path("student").path("id").asLong();
        assertThat(future.path("student").path("studentCode").asString()).as("numbering restarts every year").isEqualTo("2027-0001");

        assertThat(send("POST", "/api/v1/students", token4, studentBody("   ", "MALE", "2019-01-01", "2026-10-01", null, false)).status()).as("blank name").isEqualTo(422);
        assertThat(send("POST", "/api/v1/students", token4, studentBody("ក", "MALE", "2999-01-01", "2026-10-01", null, false)).status()).as("birth date in the future").isEqualTo(422);
        assertThat(send("POST", "/api/v1/students", token4, j("nameKm", "ក", "dateOfBirth", "2019-01-01")).status()).as("gender is required").isEqualTo(422);
        assertThat(send("POST", "/api/v1/students", token4, j("nameKm", "ក", "gender", "OTHER", "dateOfBirth", "2019-01-01")).status()).as("unknown gender").isEqualTo(400);
        assertThat(fieldCodes(send("POST", "/api/v1/students", token4, studentBody("គ", "MALE", "2019-01-01", "2026-10-01", null, false,
                guardian("ក", "FATHER", "", true), guardian("ខ", "MOTHER", "", true))))).as("two primary guardians").containsExactly("guardians:INVALID");
        Map<String, Object> g = guardian("គ", "OTHER", "", false);
        assertThat(fieldCodes(send("POST", "/api/v1/students", token4, studentBody("គ", "MALE", "2019-01-01", "2026-10-01", null, false, g, g, g, g, g, g)))).as("at most five guardians").containsExactly("guardians:INVALID");
        assertThat(send("POST", "/api/v1/students", token4, studentBody("គ", "MALE", "2019-01-01", "2026-10-01", null, false, guardian("  ", "FATHER", "", false))).status()).as("guardian without a name").isEqualTo(422);
        Resp badClass = send("POST", "/api/v1/students", token4, studentBody("ឈ្មោះថ្មី", "MALE", "2019-01-01", "2026-10-01", 999999L, false));
        assertThat(fieldCodes(badClass)).containsExactly("classId:INVALID");
        assertThat(jdbc.queryForObject("select count(*) from students", Integer.class)).as("rejected requests stored no student").isEqualTo(4);
        assertThat(jdbc.queryForObject("select next_value from id_sequences where name = 'student' and year = 2026", Long.class)).as("and burned no number").isEqualTo(3L);
    }

    @Test @Order(28)
    void studentsCanBeSearchedAndFilteredAndShowTheirClassOfTheChosenYear() throws Exception {
        long year26 = yearId("២០២៦-២០២៧ (កែ)");
        long grade1 = gradeIdOfLevel(1);
        Resp all = send("GET", "/api/v1/students", token4, null);
        assertThat(ids(all)).containsExactly(s1, s2, dup, sf);
        JsonNode first = all.json(json).get(0);
        assertThat(first.path("className").asString()).isEqualTo("ក១");
        assertThat(first.path("gradeLevel").asInt()).isEqualTo(1);
        assertThat(first.path("yearName").asString()).as("the current year by default").isEqualTo("២០២៧-២០២៨");
        assertThat(all.json(json).get(1).path("classId").isNull()).as("not enrolled: no class").isTrue();

        assertThat(ids(send("GET", "/api/v1/students?q=" + enc("វណ្ណា"), token4, null))).as("by Khmer name").containsExactly(s1, dup);
        assertThat(ids(send("GET", "/api/v1/students?q=2027-0001", token4, null))).as("by student code").containsExactly(sf);
        assertThat(ids(send("GET", "/api/v1/students?q=2026-", token4, null))).containsExactly(s1, s2, dup);
        assertThat(ids(send("GET", "/api/v1/students?q=" + enc("ម៉ៅ"), token4, null))).as("by guardian name").containsExactly(s1);
        assertThat(ids(send("GET", "/api/v1/students?q=" + enc("ចាន់"), token4, null))).as("a student's own name or a guardian's").containsExactly(s1, s2);
        assertThat(ids(send("GET", "/api/v1/students?q=" + enc("០១២៣"), token4, null))).as("Khmer digits find a guardian's ASCII phone").containsExactly(s1);
        assertThat(ids(send("GET", "/api/v1/students?q=%25", token4, null))).as("a typed % is literal").isEmpty();

        assertThat(ids(send("GET", "/api/v1/students?gender=FEMALE", token4, null))).containsExactly(s1, dup);
        assertThat(ids(send("GET", "/api/v1/students?gender=MALE", token4, null))).containsExactly(s2, sf);
        assertThat(ids(send("GET", "/api/v1/students?status=ACTIVE", token4, null))).hasSize(4);
        assertThat(ids(send("GET", "/api/v1/students?classId=" + classA, token4, null))).containsExactly(s1);
        assertThat(ids(send("GET", "/api/v1/students?gradeId=" + grade1, token4, null))).containsExactly(s1);
        assertThat(ids(send("GET", "/api/v1/students?unenrolled=true", token4, null))).containsExactly(s2, dup, sf);
        assertThat(ids(send("GET", "/api/v1/students?yearId=" + year26 + "&unenrolled=true", token4, null))).as("nobody is enrolled in the other year").hasSize(4);
        assertThat(ids(send("GET", "/api/v1/students?yearId=" + year26 + "&classId=" + classA, token4, null))).isEmpty();
    }

    @Test @Order(29)
    void studentsCanBeEditedAndTheirGuardiansReplaced() throws Exception {
        JsonNode d = studentDetail(s2);
        long v = d.path("student").path("version").asLong();
        String edit = studentUpdate("ចាន់ ដារ៉ា", "MALE", "2018-03-10", "2026-10-02", false, v, guardian("ចាន់ ម៉ូលី", "MOTHER", "011222333", true));
        Resp upd = send("PUT", "/api/v1/students/" + s2, token4, edit);
        assertThat(upd.status()).isEqualTo(200);
        assertThat(upd.json(json).path("student").path("nameKm").asString()).isEqualTo("ចាន់ ដារ៉ា");
        assertThat(upd.json(json).path("student").path("studentCode").asString()).as("the code never changes").isEqualTo("2026-0002");
        assertThat(upd.json(json).path("guardians").size()).isEqualTo(1);
        assertThat(upd.json(json).path("guardians").get(0).path("primary").asBoolean()).isTrue();
        assertThat(code(send("PUT", "/api/v1/students/" + s2, token4, edit))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");

        long v2 = upd.json(json).path("student").path("version").asLong();
        Resp clash = send("PUT", "/api/v1/students/" + s2, token4, studentUpdate("សុខ វណ្ណា", "MALE", "2019-05-01", "2026-10-02", false, v2));
        assertThat(code(clash)).as("renaming into somebody else's name + birth date").isEqualTo("POSSIBLE_DUPLICATE");
        assertThat(clash.json(json).path("studentCode").asString()).isIn("2026-0001", "2026-0003");
        assertThat(studentDetail(s2).path("student").path("nameKm").asString()).as("the refused edit changed nothing").isEqualTo("ចាន់ ដារ៉ា");

        long v1 = studentDetail(s1).path("student").path("version").asLong();
        Map<String, Object> father = guardian("សុខ ចាន់", "FATHER", "0123456789", true);
        Map<String, Object> mother = guardian("ម៉ៅ ស្រី", "MOTHER", "098765432", false);
        assertThat(code(send("PUT", "/api/v1/students/" + s1, token4, studentUpdate("សុខ វណ្ណា", "FEMALE", "2019-05-01", "2026-10-01", false, v1, father, mother))))
                .as("student 1 shares its name and birth date with the duplicate confirmed earlier").isEqualTo("POSSIBLE_DUPLICATE");
        Resp confirmedSame = send("PUT", "/api/v1/students/" + s1, token4, studentUpdate("សុខ វណ្ណា", "FEMALE", "2019-05-01", "2026-10-01", true, v1, father, mother));
        assertThat(confirmedSame.status()).as("...and saving is possible once the user confirms").isEqualTo(200);

        long v3 = send("GET", "/api/v1/students/" + s2, token4, null).json(json).path("student").path("version").asLong();
        Resp none = send("PUT", "/api/v1/students/" + s2, token4, studentUpdate("ចាន់ ដារ៉ា", "MALE", "2018-03-10", "2026-10-02", false, v3));
        assertThat(none.status()).as("a student is not a duplicate of itself").isEqualTo(200);
        assertThat(none.json(json).path("guardians").size()).as("guardians can be removed").isZero();
        assertThat(code(send("GET", "/api/v1/students/999999", token4, null))).isEqualTo("NOT_FOUND");
    }

    // ---- Phase 2e: enrollment, transfer, leaving ------------------------------------------------------------------

    static long classD;

    @Test @Order(30)
    void studentsAreEnrolledMovedAndLeaveWithTheirHistoryKept() throws Exception {
        long year27 = yearId("២០២៧-២០២៨");
        long year26 = yearId("២០២៦-២០២៧ (កែ)");
        Resp en = send("POST", "/api/v1/enrollments", token4, enrollBody(s2, classB));
        assertThat(en.status()).isEqualTo(201);
        long e2 = en.json(json).path("enrollment").path("id").asLong();
        assertThat(en.json(json).path("enrollment").path("status").asString()).isEqualTo("ACTIVE");
        assertThat(en.json(json).path("warnings").size()).isZero();
        assertThat(code(send("POST", "/api/v1/enrollments", token4, enrollBody(s2, classB)))).as("already in a class this year").isEqualTo("ENROLLMENT_EXISTS");
        assertThat(code(send("POST", "/api/v1/enrollments", token4, enrollBody(s2, classC)))).as("one class per year").isEqualTo("ENROLLMENT_EXISTS");
        assertThat(fieldCodes(send("POST", "/api/v1/enrollments", token4, enrollBody(999999L, classB)))).containsExactly("studentId:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/enrollments", token4, enrollBody(dup, 999999L)))).containsExactly("classId:INVALID");
        assertThat(rosterStudents(classB)).containsExactly(s2);
        assertThat(send("GET", "/api/v1/classes/" + classB, token4, null).json(json).path("schoolClass").path("studentCount").asInt()).isEqualTo(1);

        assertThat(setStudentStatus(dup, "INACTIVE").status()).isEqualTo(200);
        assertThat(code(send("POST", "/api/v1/enrollments", token4, enrollBody(dup, classB)))).as("an inactive student cannot be enrolled").isEqualTo("STUDENT_NOT_ACTIVE");
        assertThat(setStudentStatus(dup, "ACTIVE").status()).isEqualTo(200);

        // moving to another class of the same year keeps both rows
        Resp mv = send("POST", "/api/v1/enrollments/" + e2 + "/transfer", token4, "{\"classId\":" + classA + "}");
        assertThat(mv.status()).isEqualTo(200);
        long e2b = mv.json(json).path("enrollment").path("id").asLong();
        assertThat(e2b).isNotEqualTo(e2);
        assertThat(mv.json(json).path("enrollment").path("classId").asLong()).isEqualTo(classA);
        JsonNode history = studentDetail(s2).path("enrollments");
        assertThat(history.size()).isEqualTo(2);
        assertThat(history.get(0).path("status").asString()).as("newest first").isEqualTo("ACTIVE");
        assertThat(history.get(0).path("className").asString()).isEqualTo("ក១");
        assertThat(history.get(1).path("status").asString()).isEqualTo("CHANGED_CLASS");
        assertThat(history.get(1).path("leftOn").isNull()).as("the old row says when the student left that class").isFalse();
        assertThat(rosterStudents(classB)).isEmpty();
        assertThat(rosterStudents(classA)).containsExactly(s1, s2);
        assertThat(longs(send("GET", "/api/v1/classes/" + classB + "/students?includeEnded=true", token4, null), "studentId")).as("history of the class stays").containsExactly(s2);

        assertThat(code(send("POST", "/api/v1/enrollments/" + e2 + "/transfer", token4, "{\"classId\":" + classB + "}"))).as("the old, closed row").isEqualTo("ENROLLMENT_NOT_ACTIVE");
        assertThat(fieldCodes(send("POST", "/api/v1/enrollments/" + e2b + "/transfer", token4, "{\"classId\":" + classA + "}"))).as("same class").containsExactly("classId:INVALID");
        long otherYearClass = send("POST", "/api/v1/classes", token4, cls(year26, gradeIdOfLevel(1), "ចាស់២", null, null, null)).json(json).path("schoolClass").path("id").asLong();
        assertThat(fieldCodes(send("POST", "/api/v1/enrollments/" + e2b + "/transfer", token4, "{\"classId\":" + otherYearClass + "}"))).as("a class of another year").containsExactly("classId:INVALID");
        assertThat(send("DELETE", "/api/v1/classes/" + otherYearClass, token4, null).status()).isEqualTo(204);
        assertThat(fieldCodes(send("POST", "/api/v1/enrollments/" + e2b + "/transfer", token4, "{\"classId\":" + classB + ",\"date\":\"1999-01-01\"}"))).as("before the student joined").containsExactly("date:INVALID_DATE");
        assertThat(code(send("DELETE", "/api/v1/classes/" + classB, token4, null))).as("a class that once had students is kept").isEqualTo("CLASS_HAS_STUDENTS");

        // leaving the school
        Resp lv = send("POST", "/api/v1/enrollments/" + e2b + "/leave", token4, "{\"reason\":\"ផ្លាស់ទីលំនៅ\"}");
        assertThat(lv.status()).isEqualTo(200);
        assertThat(lv.json(json).path("status").asString()).isEqualTo("LEFT");
        assertThat(lv.json(json).path("endReason").asString()).isEqualTo("ផ្លាស់ទីលំនៅ");
        assertThat(studentDetail(s2).path("student").path("status").asString()).as("leaving makes the student inactive").isEqualTo("INACTIVE");
        assertThat(code(send("POST", "/api/v1/enrollments", token4, enrollBody(s2, classB)))).isEqualTo("STUDENT_NOT_ACTIVE");
        assertThat(setStudentStatus(s2, "ACTIVE").status()).isEqualTo(200);
        assertThat(send("POST", "/api/v1/enrollments", token4, enrollBody(s2, classB)).status()).as("a LEFT row does not block coming back").isEqualTo(201);

        // going over capacity is a warning, not a block
        classD = send("POST", "/api/v1/classes", token4, cls(year27, gradeIdOfLevel(1), "ឃ", 1, null, null)).json(json).path("schoolClass").path("id").asLong();
        Resp third = send("POST", "/api/v1/students", token4, studentBody("ថ្មី មួយ", "MALE", "2019-01-01", null, classD, false));
        s3 = third.json(json).path("student").path("id").asLong();
        assertThat(third.json(json).path("warnings").size()).as("the class has room for one").isZero();
        Resp fourth = send("POST", "/api/v1/students", token4, studentBody("ថ្មី ពីរ", "MALE", "2019-01-02", null, classD, false));
        assertThat(fourth.status()).as("allowed").isEqualTo(201);
        s4 = fourth.json(json).path("student").path("id").asLong();
        assertThat(fourth.json(json).path("warnings").get(0).asString()).isEqualTo("CLASS_OVER_CAPACITY");
        assertThat(send("GET", "/api/v1/classes/" + classD, token4, null).json(json).path("schoolClass").path("studentCount").asInt()).isEqualTo(2);
    }

    @Test @Order(31)
    void statusChangesEndEnrollmentsAndStudentsWithHistoryAreNeverDeleted() throws Exception {
        assertThat(send("POST", "/api/v1/enrollments", token4, enrollBody(dup, classB)).status()).isEqualTo(201);
        Resp grad = setStudentStatus(dup, "GRADUATED");
        assertThat(grad.status()).isEqualTo(200);
        assertThat(grad.json(json).path("student").path("status").asString()).isEqualTo("GRADUATED");
        assertThat(grad.json(json).path("enrollments").get(0).path("status").asString()).as("graduating ends the enrollment").isEqualTo("GRADUATED");
        assertThat(rosterStudents(classB)).as("the class lists only students in it now").containsExactly(s2);
        assertThat(longs(send("GET", "/api/v1/classes/" + classB + "/students?includeEnded=true", token4, null), "studentId")).contains(dup);
        assertThat(fieldCodes(setStudentStatus(dup, "FOO"))).containsExactly("status:INVALID");
        long vOld = studentDetail(dup).path("student").path("version").asLong() - 1;
        assertThat(code(send("PUT", "/api/v1/students/" + dup + "/status", token4, "{\"status\":\"ACTIVE\",\"version\":" + vOld + "}"))).isEqualTo("OPTIMISTIC_LOCK");

        assertThat(code(send("DELETE", "/api/v1/students/" + dup, token4, null))).as("a student whose enrollment ended has history").isEqualTo("STUDENT_HAS_HISTORY");
        assertThat(send("GET", "/api/v1/students/" + dup, token4, null).status()).isEqualTo(200);

        assertThat(send("DELETE", "/api/v1/students/" + sf, token4, null).status()).as("never enrolled: a mistake can be undone").isEqualTo(204);
        assertThat(code(send("GET", "/api/v1/students/" + sf, token4, null))).isEqualTo("NOT_FOUND");
        int enrollmentsBefore = jdbc.queryForObject("select count(*) from enrollments", Integer.class);
        assertThat(send("DELETE", "/api/v1/students/" + s4, token4, null).status()).as("only an unended enrollment: deleted with it").isEqualTo(204);
        assertThat(jdbc.queryForObject("select count(*) from enrollments", Integer.class)).isEqualTo(enrollmentsBefore - 1);
        assertThat(send("GET", "/api/v1/classes/" + classD, token4, null).json(json).path("schoolClass").path("studentCount").asInt()).isEqualTo(1);

        // the foreign keys are the real guard: a record that refers to the enrollment (what attendance will be in Phase 3) blocks the delete
        jdbc.execute("create table zz_history (enrollment_id integer references enrollments(id))");
        try {
            long enr = jdbc.queryForObject("select id from enrollments where student_id = ? and status = 'ACTIVE'", Long.class, s3);
            jdbc.update("insert into zz_history values (?)", enr);
            assertThat(code(send("DELETE", "/api/v1/students/" + s3, token4, null))).isEqualTo("STUDENT_HAS_HISTORY");
            assertThat(send("GET", "/api/v1/students/" + s3, token4, null).status()).as("nothing was deleted").isEqualTo(200);
            assertThat(jdbc.queryForObject("select count(*) from enrollments where student_id = ?", Integer.class, s3)).isEqualTo(1);
        } finally {
            jdbc.execute("drop table zz_history");
        }
    }

    // ---- Phase 2e: year-end promotion -----------------------------------------------------------------------------

    @Test @Order(32)
    void promotionIsCheckedPreviewedAndAppliedAllOrNothingAndCannotRunTwice() throws Exception {
        long year27 = yearId("២០២៧-២០២៨");
        String y28 = json.writeValueAsString(Map.of("nameKm", "២០២៨-២០២៩", "startDate", "2028-11-01", "endDate", "2029-08-31", "makeCurrent", false));
        long year28 = send("POST", "/api/v1/academic-years", token4, y28).json(json).path("id").asLong();
        long toG1 = send("POST", "/api/v1/classes", token4, cls(year28, gradeIdOfLevel(1), "ក", null, null, null)).json(json).path("schoolClass").path("id").asLong();
        long toG2 = send("POST", "/api/v1/classes", token4, cls(year28, gradeIdOfLevel(2), "ក", 1, null, null)).json(json).path("schoolClass").path("id").asLong();
        long class6 = send("POST", "/api/v1/classes", token4, cls(year27, gradeIdOfLevel(6), "ក", null, null, null)).json(json).path("schoolClass").path("id").asLong();
        s5 = send("POST", "/api/v1/students", token4, studentBody("គ្រូ ដំបូង", "FEMALE", "2013-02-02", "2026-10-04", class6, false)).json(json).path("student").path("id").asLong();
        long e1 = activeEnrollmentId(s1), e2 = activeEnrollmentId(s2), e3 = activeEnrollmentId(s3), e5 = activeEnrollmentId(s5);
        int before = jdbc.queryForObject("select count(*) from enrollments", Integer.class);

        // every kind of mistake is reported, and nothing is written
        assertThat(fieldCodes(promote(true, year27, year28, dec(e1, "PROMOTED", toG1)))).as("promoted into the same grade").containsExactly("decisions[0]:INVALID_TARGET_CLASS");
        assertThat(fieldCodes(promote(true, year27, year28, dec(e2, "REPEATED", toG2)))).as("repeating into another grade").containsExactly("decisions[0]:INVALID_TARGET_CLASS");
        assertThat(fieldCodes(promote(true, year27, year28, dec(e1, "GRADUATED", null)))).as("only grade 6 graduates").containsExactly("decisions[0]:NOT_FINAL_GRADE");
        assertThat(fieldCodes(promote(true, year27, year28, dec(e5, "GRADUATED", toG1)))).as("graduating has no class").containsExactly("decisions[0]:INVALID_TARGET_CLASS");
        assertThat(fieldCodes(promote(true, year27, year28, dec(999999L, "PROMOTED", toG2)))).containsExactly("decisions[0]:INVALID");
        assertThat(fieldCodes(promote(true, year27, year28, dec(e1, "PROMOTED", toG2), dec(e1, "PROMOTED", toG2)))).as("the same enrollment twice").containsExactly("decisions[1]:INVALID");
        assertThat(fieldCodes(promote(true, year27, year28, dec(e1, "PROMOTED", classC)))).as("a class of the wrong year").containsExactly("decisions[0]:INVALID_TARGET_CLASS");
        assertThat(fieldCodes(promote(true, year27, year28, dec(e1, "FOO", toG2)))).containsExactly("decisions[0]:INVALID");
        assertThat(fieldCodes(promote(true, year27, year28, dec(e1, "PROMOTED", toG1), dec(999999L, "PROMOTED", toG2)))).as("all problems at once")
                .containsExactlyInAnyOrder("decisions[0]:INVALID_TARGET_CLASS", "decisions[1]:INVALID");
        assertThat(fieldCodes(promote(true, year27, year27, dec(e1, "PROMOTED", toG2)))).containsExactly("toYearId:INVALID");
        assertThat(fieldCodes(promote(true, year27, year28))).containsExactly("decisions:REQUIRED");
        assertThat(send("POST", "/api/v1/academic-years/" + year28 + "/close", token4, null).status()).isEqualTo(200);
        assertThat(code(promote(true, year27, year28, dec(e1, "PROMOTED", toG2)))).as("into a closed year").isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(send("POST", "/api/v1/academic-years/" + year28 + "/reopen", token4, null).status()).isEqualTo(200);

        // the preview writes nothing
        Resp preview = send("POST", "/api/v1/enrollments/promote", token4,
                promoBody(year27, year28, dec(e1, "PROMOTED", toG2), dec(e3, "PROMOTED", toG2), dec(e2, "REPEATED", toG1), dec(e5, "GRADUATED", null)));
        assertThat(preview.status()).isEqualTo(200);
        JsonNode sum = preview.json(json);
        assertThat(sum.path("dryRun").asBoolean()).as("a preview unless dryRun=false is asked for").isTrue();
        assertThat(sum.path("promoted").asInt()).isEqualTo(2);
        assertThat(sum.path("repeated").asInt()).isEqualTo(1);
        assertThat(sum.path("graduated").asInt()).isEqualTo(1);
        JsonNode load2 = null;
        for (JsonNode c : sum.path("classes")) if (c.path("classId").asLong() == toG2) load2 = c;
        assertThat(load2.path("adding").asInt()).isEqualTo(2);
        assertThat(load2.path("capacity").asInt()).as("the summary shows the class would be over capacity").isEqualTo(1);
        assertThat(load2.path("current").asInt()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from enrollments", Integer.class)).as("nothing written by a preview").isEqualTo(before);
        assertThat(studentDetail(s5).path("student").path("status").asString()).isEqualTo("ACTIVE");

        // one bad decision stops everything
        Resp bad = send("POST", "/api/v1/enrollments/promote?dryRun=false", token4, promoBody(year27, year28, dec(e1, "PROMOTED", toG2), dec(e2, "PROMOTED", toG1)));
        assertThat(bad.status()).isEqualTo(422);
        assertThat(activeEnrollmentId(s1)).as("the valid decision was NOT applied either").isEqualTo(e1);
        assertThat(jdbc.queryForObject("select count(*) from enrollments", Integer.class)).isEqualTo(before);

        // apply
        String body = promoBody(year27, year28, dec(e1, "PROMOTED", toG2), dec(e3, "PROMOTED", toG2), dec(e2, "REPEATED", toG1), dec(e5, "GRADUATED", null));
        Resp applied = send("POST", "/api/v1/enrollments/promote?dryRun=false", token4, body);
        assertThat(applied.status()).isEqualTo(200);
        assertThat(applied.json(json).path("dryRun").asBoolean()).isFalse();
        JsonNode h1 = studentDetail(s1).path("enrollments");
        assertThat(h1.size()).isEqualTo(2);
        assertThat(h1.get(0).path("status").asString()).isEqualTo("ACTIVE");
        assertThat(h1.get(0).path("yearName").asString()).isEqualTo("២០២៨-២០២៩");
        assertThat(h1.get(0).path("className").asString()).isEqualTo("ក");
        assertThat(h1.get(1).path("status").asString()).as("last year's row is kept, closed with the outcome").isEqualTo("PROMOTED");
        assertThat(h1.get(1).path("className").asString()).isEqualTo("ក១");
        assertThat(studentDetail(s2).path("enrollments").get(1).path("status").asString()).isEqualTo("REPEATED");
        JsonNode d5 = studentDetail(s5);
        assertThat(d5.path("student").path("status").asString()).as("graduating also graduates the student").isEqualTo("GRADUATED");
        assertThat(d5.path("enrollments").size()).as("and opens nothing new").isEqualTo(1);
        assertThat(d5.path("enrollments").get(0).path("status").asString()).isEqualTo("GRADUATED");
        assertThat(rosterStudents(toG2)).containsExactly(s1, s3);
        assertThat(send("GET", "/api/v1/classes/" + toG2, token4, null).json(json).path("schoolClass").path("studentCount").asInt()).as("over capacity was only a warning").isEqualTo(2);
        assertThat(ids(send("GET", "/api/v1/students?yearId=" + year28 + "&classId=" + toG2, token4, null))).containsExactly(s1, s3);
        assertThat(jdbc.queryForObject("select count(*) from enrollments", Integer.class)).isEqualTo(before + 3);

        // running it again cannot duplicate anything
        Resp again = send("POST", "/api/v1/enrollments/promote?dryRun=false", token4, body);
        assertThat(again.status()).isEqualTo(422);
        assertThat(fieldCodes(again)).containsExactly("decisions[0]:ENROLLMENT_NOT_ACTIVE", "decisions[1]:ENROLLMENT_NOT_ACTIVE",
                "decisions[2]:ENROLLMENT_NOT_ACTIVE", "decisions[3]:ENROLLMENT_NOT_ACTIVE");
        assertThat(jdbc.queryForObject("select count(*) from enrollments", Integer.class)).isEqualTo(before + 3);
    }

    // ---- Phase 2d: student photos ---------------------------------------------------------------------------------

    @Test @Order(33)
    void studentPhotosAreValidatedResizedAndServedSafely() throws Exception {
        Path dir = DataDirs.studentUploads();
        assertThat(list(dir)).as("no photos yet").isEmpty();
        Resp up = upload("/api/v1/students/" + s1 + "/photo", token4, "me.png", "image/png", png(1000, 600));
        assertThat(up.status()).isEqualTo(200);
        String name = up.json(json).path("student").path("photoFile").asString();
        assertThat(name).matches("^photo-[0-9a-f-]{36}\\.jpg$");
        assertThat(list(dir)).containsExactly(name);

        Resp file = send("GET", "/api/v1/files/students/" + name, token4, null);
        assertThat(file.status()).isEqualTo(200);
        assertThat(file.headers().firstValue("Content-Type").orElse("")).contains("image/jpeg");
        assertThat(file.bytes()[0] & 0xFF).as("a JPEG").isEqualTo(0xFF);
        assertThat(file.bytes()[1] & 0xFF).isEqualTo(0xD8);
        BufferedImage served = ImageIO.read(new ByteArrayInputStream(file.bytes()));
        assertThat(served.getWidth()).as("1000x600 capped to 512 wide").isEqualTo(512);
        assertThat(served.getHeight()).isEqualTo(307);
        assertThat(send("GET", "/api/v1/files/students/" + name, null, null).status()).as("photos need a session").isEqualTo(401);

        Resp notImage = upload("/api/v1/students/" + s1 + "/photo", token4, "evil.jpg", "image/jpeg", "this is not an image".getBytes(StandardCharsets.UTF_8));
        assertThat(fieldCodes(notImage)).containsExactly("file:INVALID_IMAGE");
        assertThat(list(dir)).as("a rejected upload stored nothing").containsExactly(name);
        for (String bad : List.of("..%2F..%2Fdatabase%2Fschool.db", "..%5C..%5Cdatabase%5Cschool.db", "photo-x.jpg", "%2E%2E%2Fsecret")) {
            assertThat(send("GET", "/api/v1/files/students/" + bad, token4, null).status()).as("traversal attempt " + bad).isIn(400, 404);
        }

        Resp replaced = upload("/api/v1/students/" + s1 + "/photo", token4, "me2.png", "image/png", png(200, 200));
        String name2 = replaced.json(json).path("student").path("photoFile").asString();
        assertThat(name2).isNotEqualTo(name);
        assertThat(list(dir)).as("the replaced photo's file is deleted").containsExactly(name2);

        Map<String, Object> deep = deepCheck("UPLOADS_CONSISTENCY");
        assertThat(deep.get("status")).as("a photo that the database refers to is not an orphan").isEqualTo("OK");
        Files.writeString(dir.resolve("photo-stray.jpg"), "x");
        assertThat(deepCheck("UPLOADS_CONSISTENCY").get("code")).as("an unreferenced file is reported").isEqualTo("ORPHAN_UPLOADS");
        Files.delete(dir.resolve("photo-stray.jpg"));
        Files.delete(dir.resolve(name2));
        assertThat(deepCheck("UPLOADS_CONSISTENCY").get("code")).as("a missing file is reported").isEqualTo("STUDENT_PHOTO_MISSING");

        Resp removed = send("DELETE", "/api/v1/students/" + s1 + "/photo", token4, null);
        assertThat(removed.json(json).path("student").path("photoFile").isNull()).isTrue();
        assertThat(deepCheck("UPLOADS_CONSISTENCY").get("status")).isEqualTo("OK");
        assertThat(code(upload("/api/v1/students/999999/photo", token4, "x.png", "image/png", png(10, 10)))).isEqualTo("NOT_FOUND");
    }

    // ---- Phase 2f: the student list as an Excel file ---------------------------------------------------------------

    @Test @Order(34)
    void theStudentListIsExportedToExcelWithKhmerTextIntact() throws Exception {
        Map<String, String> labels = new java.util.LinkedHashMap<>();
        labels.put("sheet", "បញ្ជីសិស្ស");
        labels.put("no", "ល.រ");
        labels.put("code", "លេខសម្គាល់");
        labels.put("nameKm", "ឈ្មោះខ្មែរ");
        labels.put("gender", "ភេទ");
        labels.put("MALE", "ប្រុស");
        labels.put("FEMALE", "ស្រី");
        labels.put("ACTIVE", "កំពុងសិក្សា");
        labels.put("GRADUATED", "បញ្ចប់ការសិក្សា");
        long year28 = yearId("២០២៨-២០២៩");

        Resp none = exec("POST", "/api/v1/students/export", null, true, exportBody(null, labels).getBytes(StandardCharsets.UTF_8), "application/json", Map.of());
        assertThat(none.status()).as("needs a session").isEqualTo(401);
        assertThat(send("POST", "/api/v1/students/export", token4, "{\"q\":\"x\"}").status()).as("the labels are required").isEqualTo(422);

        Resp all = send("POST", "/api/v1/students/export", token4, exportBody("{\"yearId\":" + year28 + "}", labels));
        assertThat(all.status()).isEqualTo(200);
        assertThat(all.headers().firstValue("Content-Type").orElse("")).contains("spreadsheetml.sheet");
        assertThat(all.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(all.bytes()[0]).as("an .xlsx is a zip").isEqualTo((byte) 'P');
        try (org.apache.poi.xssf.usermodel.XSSFWorkbook wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook(new ByteArrayInputStream(all.bytes()))) {
            org.apache.poi.ss.usermodel.Sheet sheet = wb.getSheetAt(0);
            assertThat(sheet.getSheetName()).isEqualTo("បញ្ជីសិស្ស");
            org.apache.poi.ss.usermodel.Row head = sheet.getRow(0);
            assertThat(head.getCell(0).getStringCellValue()).isEqualTo("ល.រ");
            assertThat(head.getCell(2).getStringCellValue()).isEqualTo("ឈ្មោះខ្មែរ");
            assertThat(head.getCell(3).getStringCellValue()).as("an unlabelled column shows its key").isEqualTo("nameEn");
            assertThat(wb.getFontAt(head.getCell(0).getCellStyle().getFontIndex()).getFontName()).as("a Khmer-capable font").isEqualTo("Khmer UI");
            assertThat(sheet.getLastRowNum()).as("header + the five students still on the books").isEqualTo(5);

            org.apache.poi.ss.usermodel.Row row = null;
            for (int i = 1; i <= sheet.getLastRowNum(); i++) if ("2026-0001".equals(sheet.getRow(i).getCell(1).getStringCellValue())) row = sheet.getRow(i);
            assertThat(row).as("student 1's row").isNotNull();
            assertThat(row.getCell(2).getStringCellValue()).as("Khmer name round-trips exactly").isEqualTo("សុខ វណ្ណា");
            assertThat(row.getCell(4).getStringCellValue()).as("value names come from the labels").isEqualTo("ស្រី");
            assertThat(row.getCell(5).getCellType()).isEqualTo(org.apache.poi.ss.usermodel.CellType.NUMERIC);
            assertThat(org.apache.poi.ss.usermodel.DateUtil.isCellDateFormatted(row.getCell(5))).as("a real Excel date").isTrue();
            assertThat(row.getCell(5).getLocalDateTimeCellValue().toLocalDate().toString()).isEqualTo("2019-05-01");
            assertThat(row.getCell(6).getStringCellValue()).as("grade of the chosen year").isEqualTo("ថ្នាក់ទី២");
            assertThat(row.getCell(7).getStringCellValue()).isEqualTo("ក");
            assertThat(row.getCell(8).getStringCellValue()).isEqualTo("កំពុងសិក្សា");
            assertThat(row.getCell(9).getStringCellValue()).as("primary guardian").isEqualTo("សុខ ចាន់");
            assertThat(row.getCell(10).getCellType()).as("a phone number is text").isEqualTo(org.apache.poi.ss.usermodel.CellType.STRING);
            assertThat(row.getCell(10).getStringCellValue()).as("and keeps its leading zero").isEqualTo("0123456789");
        }

        Resp active = send("POST", "/api/v1/students/export", token4, exportBody("{\"status\":\"ACTIVE\"}", labels));
        try (org.apache.poi.xssf.usermodel.XSSFWorkbook wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook(new ByteArrayInputStream(active.bytes()))) {
            assertThat(wb.getSheetAt(0).getLastRowNum()).as("filters apply: three students are active").isEqualTo(3);
        }
        Resp female = send("POST", "/api/v1/students/export", token4, exportBody("{\"gender\":\"FEMALE\"}", labels));
        try (org.apache.poi.xssf.usermodel.XSSFWorkbook wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook(new ByteArrayInputStream(female.bytes()))) {
            assertThat(wb.getSheetAt(0).getLastRowNum()).as("student 1, her namesake and graduate student 5").isEqualTo(3);
        }
        Resp bare = send("POST", "/api/v1/students/export", token4, "{\"labels\":{}}");
        assertThat(bare.status()).as("no labels at all still works").isEqualTo(200);
        try (org.apache.poi.xssf.usermodel.XSSFWorkbook wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook(new ByteArrayInputStream(bare.bytes()))) {
            assertThat(wb.getSheetAt(0).getSheetName()).isEqualTo("sheet");
            assertThat(wb.getSheetAt(0).getRow(0).getCell(1).getStringCellValue()).isEqualTo("code");
        }
    }

    /** {"...filters...", "labels": {...}}: {@code filters} is a JSON object text or null. */
    String exportBody(String filters, Map<String, String> labels) {
        String labelJson = json.writeValueAsString(labels);
        if (filters == null || filters.equals("{}")) return "{\"labels\":" + labelJson + "}";
        return filters.substring(0, filters.length() - 1) + ",\"labels\":" + labelJson + "}";
    }

    // ---- Phase 3: attendance, grading scales, examinations, scores, report cards, homework -------------------------

    static long p3Year, p3Class, ps1, ps2, ps3, pe1, pe2, pe3, p3Exam, esKhmer, esMath, p3Whole, p3Morning;
    static final String TODAY = java.time.LocalDate.now(CLOCK).toString();      // the application's own idea of "today"
    static String p3YearStart;

    long enrollmentOf(long studentId) throws Exception { return activeEnrollmentId(studentId); }

    String att(String date, Long periodId, String note, Object... enrollmentStatusRemark) { return attFor(p3Class, date, periodId, note, enrollmentStatusRemark); }

    String attFor(long classId, String date, Long periodId, String note, Object... enrollmentStatusRemark) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 0; i < enrollmentStatusRemark.length; i += 3) {
            java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("enrollmentId", enrollmentStatusRemark[i]);
            m.put("status", enrollmentStatusRemark[i + 1]);
            m.put("remark", enrollmentStatusRemark[i + 2]);
            list.add(m);
        }
        java.util.LinkedHashMap<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("classId", classId);
        body.put("date", date);
        body.put("periodId", periodId);
        body.put("note", note);
        body.put("records", list);
        return json.writeValueAsString(body);
    }

    static java.math.BigDecimal num(JsonNode n) { return n.decimalValue(); }

    @Test @Order(35)
    void attendanceIsRecordedPerClassDayAndSessionWithoutDuplicatesAndCorrectionsKeepTheOldValue() throws Exception {
        p3Year = yearId("២០២៦-២០២៧ (កែ)");
        // attendance cannot be taken for a future day and needs a year that is under way: bracket today so the scenario never expires
        java.time.LocalDate today = java.time.LocalDate.now(CLOCK);
        p3YearStart = today.minusDays(30).toString();
        String redate = json.writeValueAsString(Map.of("nameKm", "២០២៦-២០២៧ (កែ)", "startDate", p3YearStart, "endDate", today.plusDays(200).toString(), "version", yearById(p3Year).path("version").asLong()));
        assertThat(send("PUT", "/api/v1/academic-years/" + p3Year, token4, redate).status()).isEqualTo(200);
        p3Class =send("POST", "/api/v1/classes", token4, cls(p3Year, gradeIdOfLevel(1), "ក", null, null, null)).json(json).path("schoolClass").path("id").asLong();
        ps1 = send("POST", "/api/v1/students", token4, studentBody("សិស្ស មួយ", "MALE", "2019-01-01", null, p3Class, false)).json(json).path("student").path("id").asLong();
        ps2 = send("POST", "/api/v1/students", token4, studentBody("សិស្ស ពីរ", "FEMALE", "2019-01-02", null, p3Class, false)).json(json).path("student").path("id").asLong();
        ps3 = send("POST", "/api/v1/students", token4, studentBody("សិស្ស បី", "MALE", "2019-01-03", null, p3Class, false)).json(json).path("student").path("id").asLong();
        pe1 = enrollmentOf(ps1);
        pe2 = enrollmentOf(ps2);
        pe3 = enrollmentOf(ps3);
        assertThat(send("GET", "/api/v1/attendance/sheet?classId=" + p3Class + "&date=" + TODAY, null, null).status()).as("needs a session").isEqualTo(401);

        int sessionsBefore = jdbc.queryForObject("select count(*) from attendance_sessions", Integer.class);
        JsonNode blank = send("GET", "/api/v1/attendance/sheet?classId=" + p3Class + "&date=" + TODAY, token4, null).json(json);
        assertThat(blank.path("rows").size()).isEqualTo(3);
        assertThat(blank.path("sessionId").isNull()).as("nothing is recorded yet").isTrue();
        assertThat(blank.path("rows").get(0).path("status").isNull()).isTrue();
        JsonNode startPeriods = send("GET", "/api/v1/attendance-periods?academicYearId=" + p3Year, token4, null).json(json);
        assertThat(startPeriods.size()).as("a year starts with one session").isEqualTo(1);
        p3Whole = startPeriods.get(0).path("id").asLong();
        assertThat(startPeriods.get(0).path("nameKm").asString()).as("the whole day, with no times (nothing is invented)").isEqualTo(AttendancePeriodService.DEFAULT_NAME);
        assertThat(startPeriods.get(0).path("startTime").isNull() && startPeriods.get(0).path("endTime").isNull()).isTrue();
        assertThat(startPeriods.get(0).path("enabled").asBoolean()).isTrue();
        assertThat(blank.path("period").path("id").asLong()).as("with no session chosen the sheet opens on the year's first enabled one").isEqualTo(p3Whole);
        assertThat(blank.path("period").path("nameKm").asString()).isEqualTo(AttendancePeriodService.DEFAULT_NAME);
        assertThat(blank.path("recordedPeriodIds").size()).as("no sheet yet").isZero();
        assertThat(jdbc.queryForObject("select count(*) from attendance_sessions", Integer.class)).as("reading the sheet creates nothing").isEqualTo(sessionsBefore);
        String yesterday = java.time.LocalDate.now(CLOCK).minusDays(1).toString();
        assertThat(send("GET", "/api/v1/attendance/sheet?classId=" + p3Class + "&date=" + yesterday, token4, null).json(json).path("rows").size())
                .as("students enrolled today are not on yesterday's list").isZero();

        Resp saved = send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, null, "ថ្ងៃធម្មតា", pe1, "PRESENT", null, pe2, "ABSENT", "ឈឺ", pe3, "LATE", null));
        assertThat(saved.status()).isEqualTo(200);
        JsonNode sheet = saved.json(json);
        assertThat(sheet.path("sessionId").isNull()).isFalse();
        assertThat(sheet.path("note").asString()).isEqualTo("ថ្ងៃធម្មតា");
        assertThat(sheet.path("rows").get(1).path("status").asString()).isEqualTo("ABSENT");
        assertThat(sheet.path("rows").get(1).path("remark").asString()).isEqualTo("ឈឺ");
        assertThat(jdbc.queryForObject("select count(*) from attendance_records", Integer.class)).isEqualTo(3);

        assertThat(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, p3Whole,"ថ្ងៃធម្មតា", pe1, "PRESENT", null, pe2, "ABSENT", "ឈឺ", pe3, "LATE", null)).status()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from attendance_sessions where class_id = ?", Integer.class, p3Class)).as("saving the same day again is not a second session").isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from attendance_records", Integer.class)).as("nor duplicate records").isEqualTo(3);

        // a correction updates in place and the audit trail keeps what it replaced (a status code only)
        assertThat(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, p3Whole,"ថ្ងៃធម្មតា", pe2, "PRESENT", "បានមកដល់", pe1, "PRESENT", null)).status()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from attendance_records", Integer.class)).isEqualTo(3);
        List<Map<String, Object>> trail = jdbc.queryForList("select before_json, after_json, summary from audit_logs where action = 'ATTENDANCE_CORRECTED'");
        assertThat(trail).hasSize(1);
        assertThat(trail.get(0).get("before_json")).isEqualTo("{\"status\":\"ABSENT\"}");
        assertThat(trail.get(0).get("after_json")).isEqualTo("{\"status\":\"PRESENT\"}");
        assertThat(trail.get(0).toString()).as("no remark or name in the trail").doesNotContain("ឈឺ").doesNotContain("បានមកដល់").doesNotContain("សិស្ស");
        assertThat(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, p3Whole,"ថ្ងៃធម្មតា", pe2, "ABSENT", "ឈឺ")).status()).isEqualTo(200);   // back to the original for the rest of the steps

        // a second session of the same day, made by the administrator, is a separate sheet (the times are an example, not the school's hours)
        Resp morning = send("POST", "/api/v1/attendance-periods", token4, json.writeValueAsString(Map.of("academicYearId", p3Year, "nameKm", "ពេលព្រឹក", "startTime", "07:00", "endTime", "11:00")));
        assertThat(morning.status()).isEqualTo(201);
        p3Morning = morning.json(json).path("id").asLong();
        assertThat(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, p3Morning, null, pe1, "ABSENT", null, pe2, "LEAVE", null)).status()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from attendance_sessions where class_id = ?", Integer.class, p3Class)).isEqualTo(2);
        assertThat(send("GET", "/api/v1/attendance/sheet?classId=" + p3Class + "&date=" + TODAY, token4, null).json(json).path("recordedPeriodIds").toString())
                .as("the screen ticks the sessions already taken").isEqualTo("[" + p3Whole + "," + p3Morning + "]");

        assertThat(fieldCodes(send("PUT", "/api/v1/attendance/sheet", token4, att(java.time.LocalDate.now(CLOCK).plusDays(2).toString(), null, null, pe1, "PRESENT", null)))).containsExactly("date:FUTURE_DATE");
        assertThat(fieldCodes(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, null, null, pe1, "SICK", null)))).as("unknown status").containsExactly("records:INVALID");
        assertThat(fieldCodes(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, null, null, pe1, "PRESENT", null, pe1, "ABSENT", null)))).as("the same student twice").containsExactly("records:INVALID");
        assertThat(fieldCodes(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, null, null, 999999L, "PRESENT", null)))).as("a student of another class").containsExactly("records:INVALID");
        assertThat(fieldCodes(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, 999999L, null, pe1, "PRESENT", null)))).as("a session that does not exist").containsExactly("periodId:INVALID");
        assertThat(fieldCodes(send("PUT", "/api/v1/attendance/sheet", token4, att("2026-13-45", null, null, pe1, "PRESENT", null)))).containsExactly("date:INVALID_DATE");
        assertThat(send("GET", "/api/v1/attendance/sheet?classId=999999&date=" + TODAY, token4, null).status()).isEqualTo(422);
        assertThat(jdbc.queryForObject("select count(*) from attendance_sessions where class_id = ?", Integer.class, p3Class)).as("rejected requests stored nothing").isEqualTo(2);
    }

    @Test @Order(36)
    void attendanceHistoryAndSummariesCountEachStatus() throws Exception {
        String range = "&from=" + TODAY + "&to=" + TODAY;
        JsonNode sessions = send("GET", "/api/v1/attendance/sessions?classId=" + p3Class + range, token4, null).json(json);
        assertThat(sessions.size()).isEqualTo(2);
        assertThat(sessions.get(0).path("periodId").asLong()).as("in the order of the school day").isEqualTo(p3Whole);
        assertThat(sessions.get(1).path("periodNameKm").asString()).isEqualTo("ពេលព្រឹក");
        JsonNode day = null;
        for (JsonNode s : sessions) if (s.path("periodId").asLong() == p3Whole) day = s;
        assertThat(day.path("present").asInt()).isEqualTo(1);
        assertThat(day.path("absent").asInt()).isEqualTo(1);
        assertThat(day.path("late").asInt()).isEqualTo(1);
        assertThat(day.path("total").asInt()).isEqualTo(3);

        JsonNode summary = send("GET", "/api/v1/attendance/summary?classId=" + p3Class + range, token4, null).json(json);
        assertThat(summary.size()).isEqualTo(3);
        JsonNode first = summary.get(0);
        assertThat(first.path("studentId").asLong()).isEqualTo(ps1);
        assertThat(first.path("present").asInt()).as("student 1: present in the day session").isEqualTo(1);
        assertThat(first.path("absent").asInt()).as("...absent in the morning session").isEqualTo(1);
        assertThat(first.path("total").asInt()).isEqualTo(2);
        assertThat(summary.get(1).path("leave").asInt()).isEqualTo(1);

        JsonNode mine = send("GET", "/api/v1/students/" + ps1 + "/attendance?from=2026-01-01&to=2099-12-31", token4, null).json(json);
        assertThat(mine.path("total").asInt()).isEqualTo(2);
        assertThat(mine.path("rows").size()).isEqualTo(2);
        assertThat(mine.path("rows").get(0).path("className").asString()).isEqualTo("ក");
        assertThat(send("GET", "/api/v1/attendance/sessions?classId=" + p3Class + "&from=bad&to=" + TODAY, token4, null).status()).isEqualTo(422);
        assertThat(send("GET", "/api/v1/attendance/sessions?classId=" + p3Class + "&from=2000-01-01&to=2000-01-02", token4, null).json(json).size()).as("another period is empty").isZero();
    }

    // ---- grading scales -------------------------------------------------------------------------------------------

    @Test @Order(37)
    void gradingScalesHaveBandsAPassMarkAndExactlyOneDefault() throws Exception {
        assertThat(send("GET", "/api/v1/grading-scales", null, null).status()).isEqualTo(401);
        JsonNode list = send("GET", "/api/v1/grading-scales", token4, null).json(json);
        assertThat(list.size()).isEqualTo(1);
        JsonNode std = list.get(0);
        long stdId = std.path("id").asLong();
        assertThat(std.path("isDefault").asBoolean()).isTrue();
        assertThat(num(std.path("passPercent"))).isEqualByComparingTo("50");
        assertThat(std.path("bands").size()).isEqualTo(6);
        assertThat(std.path("bands").get(0).path("letter").asString()).as("highest first").isEqualTo("A");
        assertThat(num(std.path("bands").get(5).path("minPercent"))).isEqualByComparingTo("0");

        String ok = "{\"nameKm\":\"មាត្រដ្ឋានថ្មី\",\"passPercent\":45.5,\"bands\":[{\"minPercent\":0,\"labelKm\":\"ខ្សោយ\",\"letter\":\"F\"},{\"minPercent\":80,\"labelKm\":\"ល្អ\",\"letter\":\"A\"}]}";
        Resp created = send("POST", "/api/v1/grading-scales", token4, ok);
        assertThat(created.status()).isEqualTo(201);
        JsonNode mine = created.json(json);
        long myId = mine.path("id").asLong();
        assertThat(mine.path("isDefault").asBoolean()).isFalse();
        assertThat(mine.path("bands").get(0).path("letter").asString()).as("stored highest first").isEqualTo("A");

        assertThat(fieldCodes(send("POST", "/api/v1/grading-scales", token4, "{\"nameKm\":\"ក\",\"passPercent\":50,\"bands\":[{\"minPercent\":10,\"labelKm\":\"x\",\"letter\":\"A\"}]}"))).as("nobody below 10% would have a band").containsExactly("bands:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/grading-scales", token4, "{\"nameKm\":\"ក\",\"passPercent\":50,\"bands\":[{\"minPercent\":0,\"labelKm\":\"x\",\"letter\":\"A\"},{\"minPercent\":0,\"labelKm\":\"y\",\"letter\":\"B\"}]}"))).as("two bands with the same minimum").containsExactly("bands:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/grading-scales", token4, "{\"nameKm\":\"ក\",\"passPercent\":101,\"bands\":[{\"minPercent\":0,\"labelKm\":\"x\",\"letter\":\"A\"}]}"))).containsExactly("passPercent:INVALID_NUMBER");
        assertThat(fieldCodes(send("POST", "/api/v1/grading-scales", token4, "{\"nameKm\":\"ក\",\"passPercent\":50,\"bands\":[{\"minPercent\":0.001,\"labelKm\":\"x\",\"letter\":\"A\"}]}"))).as("three decimals").containsExactly("bands:INVALID_NUMBER");
        assertThat(send("POST", "/api/v1/grading-scales", token4, "{\"nameKm\":\"  \",\"passPercent\":50,\"bands\":[{\"minPercent\":0,\"labelKm\":\"x\",\"letter\":\"A\"}]}").status()).isEqualTo(422);
        assertThat(send("POST", "/api/v1/grading-scales", token4, "{\"nameKm\":\"ក\",\"passPercent\":50,\"bands\":[]}").status()).as("no bands").isEqualTo(422);
        assertThat(jdbc.queryForObject("select count(*) from grading_scales", Integer.class)).as("rejected requests stored nothing").isEqualTo(2);

        String edit = "{\"nameKm\":\"មាត្រដ្ឋានកែ\",\"passPercent\":40,\"bands\":[{\"minPercent\":0,\"labelKm\":\"ធ្លាក់\",\"letter\":\"F\"},{\"minPercent\":40,\"labelKm\":\"ជាប់\",\"letter\":\"P\"}],\"version\":" + mine.path("version").asLong() + "}";
        Resp upd = send("PUT", "/api/v1/grading-scales/" + myId, token4, edit);
        assertThat(upd.status()).isEqualTo(200);
        assertThat(upd.json(json).path("bands").size()).isEqualTo(2);
        assertThat(upd.json(json).path("bands").get(0).path("letter").asString()).isEqualTo("P");
        assertThat(code(send("PUT", "/api/v1/grading-scales/" + myId, token4, edit))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");

        assertThat(send("POST", "/api/v1/grading-scales/" + myId + "/set-default", token4, null).json(json).path("isDefault").asBoolean()).isTrue();
        int defaults = 0;
        for (JsonNode s : send("GET", "/api/v1/grading-scales", token4, null).json(json)) if (s.path("isDefault").asBoolean()) defaults++;
        assertThat(defaults).as("exactly one default").isEqualTo(1);
        assertThat(send("POST", "/api/v1/grading-scales/" + stdId + "/set-default", token4, null).status()).as("back to the starting scale").isEqualTo(200);
        assertThat(code(send("POST", "/api/v1/grading-scales/999999/set-default", token4, null))).isEqualTo("NOT_FOUND");
    }

    // ---- examinations, scores, results ----------------------------------------------------------------------------

    @Test @Order(38)
    void examinationsStartWithEverySubjectAndTheSchoolEditsMaximumsAndWeights() throws Exception {
        Map<String, Long> subject = subjectIdsByCode();
        long grade1 = gradeIdOfLevel(1);
        String body = json.writeValueAsString(Map.of("academicYearId", p3Year, "nameKm", " ប្រឡងប្រចាំខែ ១ ", "kind", "MONTHLY", "termNo", 1, "startDate", "2026-11-01", "endDate", "2026-11-05"));
        Resp created = send("POST", "/api/v1/examinations", token4, body);
        assertThat(created.status()).isEqualTo(201);
        p3Exam = created.json(json).path("id").asLong();
        assertThat(created.json(json).path("nameKm").asString()).isEqualTo("ប្រឡងប្រចាំខែ ១");
        assertThat(created.json(json).path("scoreCount").asInt()).isZero();

        JsonNode rows = send("GET", "/api/v1/examinations/" + p3Exam + "/subjects", token4, null).json(json);
        int grade1Rows = 0;
        for (JsonNode r : rows) if (r.path("gradeId").asLong() == grade1) {
            grade1Rows++;
            assertThat(num(r.path("maxScore"))).as("every subject starts at 100").isEqualByComparingTo("100");
            assertThat(num(r.path("weight"))).as("with weight 1").isEqualByComparingTo("1");
        }
        assertThat(grade1Rows).as("all the subjects grade 1 studies").isGreaterThanOrEqualTo(7);

        assertThat(code(send("POST", "/api/v1/examinations", token4, body))).as("same name in the same year").isEqualTo("DUPLICATE");
        assertThat(fieldCodes(send("POST", "/api/v1/examinations", token4, json.writeValueAsString(Map.of("academicYearId", p3Year, "nameKm", "ក", "kind", "WEEKLY"))))).containsExactly("kind:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/examinations", token4, json.writeValueAsString(Map.of("academicYearId", p3Year, "nameKm", "ខ", "kind", "FINAL", "startDate", "2026-12-05", "endDate", "2026-12-01"))))).containsExactly("endDate:END_BEFORE_START");
        assertThat(fieldCodes(send("POST", "/api/v1/examinations", token4, json.writeValueAsString(Map.of("academicYearId", 999999, "nameKm", "គ", "kind", "FINAL"))))).containsExactly("academicYearId:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/examinations", token4, json.writeValueAsString(Map.of("academicYearId", p3Year, "nameKm", "ឃ", "kind", "FINAL", "termNo", 13))))).containsExactly("termNo:OUT_OF_RANGE");

        // keep only Khmer (max 10, weight 1) and Mathematics (max 100, weight 2) for grade 1
        for (JsonNode r : rows) {
            if (r.path("gradeId").asLong() != grade1) continue;
            long sid = r.path("subjectId").asLong();
            long rowId = r.path("id").asLong();
            if (sid == subject.get("KHMER")) { esKhmer = rowId; assertThat(send("PUT", "/api/v1/examinations/" + p3Exam + "/subjects/" + rowId, token4, "{\"maxScore\":10,\"weight\":1}").status()).isEqualTo(200); }
            else if (sid == subject.get("MATH")) { esMath = rowId; assertThat(send("PUT", "/api/v1/examinations/" + p3Exam + "/subjects/" + rowId, token4, "{\"maxScore\":100,\"weight\":2}").status()).isEqualTo(200); }
            else assertThat(send("DELETE", "/api/v1/examinations/" + p3Exam + "/subjects/" + rowId, token4, null).status()).isEqualTo(204);
        }
        JsonNode kept = send("GET", "/api/v1/examinations/" + p3Exam + "/subjects", token4, null).json(json);
        int now = 0;
        for (JsonNode r : kept) if (r.path("gradeId").asLong() == grade1) now++;
        assertThat(now).isEqualTo(2);

        assertThat(fieldCodes(send("PUT", "/api/v1/examinations/" + p3Exam + "/subjects/" + esKhmer, token4, "{\"maxScore\":0,\"weight\":1}"))).containsExactly("maxScore:INVALID_NUMBER");
        assertThat(fieldCodes(send("PUT", "/api/v1/examinations/" + p3Exam + "/subjects/" + esKhmer, token4, "{\"maxScore\":10,\"weight\":-1}"))).containsExactly("weight:INVALID_NUMBER");
        assertThat(code(send("POST", "/api/v1/examinations/" + p3Exam + "/subjects", token4, json.writeValueAsString(Map.of("gradeId", grade1, "subjectId", subject.get("KHMER"), "maxScore", 10, "weight", 1))))).as("a subject twice").isEqualTo("DUPLICATE");
        Resp added = send("POST", "/api/v1/examinations/" + p3Exam + "/subjects", token4, json.writeValueAsString(Map.of("gradeId", grade1, "subjectId", subject.get("ART"), "maxScore", 20, "weight", 1)));
        assertThat(added.status()).isEqualTo(201);
        assertThat(send("DELETE", "/api/v1/examinations/" + p3Exam + "/subjects/" + added.json(json).path("id").asLong(), token4, null).status()).isEqualTo(204);

        long version = created.json(json).path("version").asLong();
        String rename = json.writeValueAsString(Map.of("nameKm", "ប្រឡងខែទី១", "kind", "MONTHLY", "termNo", 1, "version", version));
        assertThat(send("PUT", "/api/v1/examinations/" + p3Exam, token4, rename).json(json).path("nameKm").asString()).isEqualTo("ប្រឡងខែទី១");
        assertThat(code(send("PUT", "/api/v1/examinations/" + p3Exam, token4, rename))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");

        long temp = send("POST", "/api/v1/examinations", token4, json.writeValueAsString(Map.of("academicYearId", p3Year, "nameKm", "បណ្តោះអាសន្ន", "kind", "OTHER"))).json(json).path("id").asLong();
        assertThat(send("DELETE", "/api/v1/examinations/" + temp, token4, null).status()).as("no scores: can be deleted").isEqualTo(204);
        assertThat(code(send("GET", "/api/v1/examinations/" + temp, token4, null))).isEqualTo("NOT_FOUND");
        assertThat(ids(send("GET", "/api/v1/examinations?yearId=" + p3Year, token4, null))).containsExactly(p3Exam);
    }

    String scores(Object... enrollmentScoreAbsent) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 0; i < enrollmentScoreAbsent.length; i += 3) {
            java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("enrollmentId", enrollmentScoreAbsent[i]);
            m.put("score", enrollmentScoreAbsent[i + 1]);
            m.put("absent", enrollmentScoreAbsent[i + 2]);
            list.add(m);
        }
        return list.isEmpty() ? "[]" : json.writeValueAsString(list);
    }

    Resp putScores(long subjectCode, String scoresJson) throws Exception {
        return send("PUT", "/api/v1/examinations/" + p3Exam + "/scores", token4, "{\"classId\":" + p3Class + ",\"subjectId\":" + subjectCode + ",\"scores\":" + scoresJson + "}");
    }

    JsonNode resultOf(JsonNode results, long enrollmentId) {
        for (JsonNode s : results.path("students")) if (s.path("enrollmentId").asLong() == enrollmentId) return s;
        throw new AssertionError("no result for enrollment " + enrollmentId);
    }

    @Test @Order(39)
    void scoresAreEnteredPerSubjectAndResultsAreWeightedBandedAndRanked() throws Exception {
        Map<String, Long> subject = subjectIdsByCode();
        long khmer = subject.get("KHMER"), math = subject.get("MATH");
        String sheetUrl = "/api/v1/examinations/" + p3Exam + "/scores?classId=" + p3Class + "&subjectId=";
        JsonNode blank = send("GET", sheetUrl + khmer, token4, null).json(json);
        assertThat(blank.path("rows").size()).isEqualTo(3);
        assertThat(num(blank.path("maxScore"))).isEqualByComparingTo("10");
        assertThat(blank.path("rows").get(0).path("score").isNull()).as("nothing entered yet is not a zero").isTrue();

        // rejected input
        assertThat(fieldCodes(putScores(khmer, scores(pe1, 10.01, false)))).as("above the maximum").containsExactly("scores:OUT_OF_RANGE");
        assertThat(fieldCodes(putScores(khmer, scores(pe1, new java.math.BigDecimal("7.255"), false)))).as("three decimals").containsExactly("scores:INVALID_NUMBER");
        assertThat(fieldCodes(putScores(khmer, scores(pe1, -1, false)))).containsExactly("scores:INVALID_NUMBER");
        assertThat(fieldCodes(putScores(khmer, scores(pe1, 5, true)))).as("absent AND a score").containsExactly("scores:INVALID");
        assertThat(fieldCodes(putScores(khmer, scores(999999L, 5, false)))).as("a student of another class").containsExactly("scores:INVALID");
        assertThat(fieldCodes(putScores(subject.get("ART"), scores(pe1, 5, false)))).as("a subject this examination does not cover for the grade").containsExactly("subjectId:INVALID");
        assertThat(send("PUT", "/api/v1/examinations/" + p3Exam + "/scores", token4, "{\"classId\":" + classA + ",\"subjectId\":" + khmer + ",\"scores\":[]}").status()).as("a class of another year").isEqualTo(422);
        assertThat(send("GET", sheetUrl + khmer, token4, null).json(json).path("rows").get(0).path("score").isNull()).as("rejected requests stored nothing").isTrue();

        // Khmer (max 10): 8.5, absent, 10 - Mathematics (max 100, weight 2): 90, 55.5, 100
        Resp k = putScores(khmer, scores(pe1, 8.5, false, pe2, null, true, pe3, 10, false));
        assertThat(k.status()).isEqualTo(200);
        assertThat(num(k.json(json).path("rows").get(0).path("score"))).isEqualByComparingTo("8.5");
        assertThat(k.json(json).path("rows").get(1).path("absent").asBoolean()).isTrue();
        assertThat(k.json(json).path("rows").get(1).path("score").isNull()).isTrue();

        JsonNode incomplete = send("GET", "/api/v1/examinations/" + p3Exam + "/results?classId=" + p3Class, token4, null).json(json);
        JsonNode r1 = resultOf(incomplete, pe1);
        assertThat(r1.path("complete").asBoolean()).as("Mathematics is not entered yet").isFalse();
        assertThat(r1.path("percent").isNull()).isTrue();
        assertThat(r1.path("rank").isNull()).isTrue();
        assertThat(r1.path("passed").isNull()).isTrue();

        assertThat(putScores(math, scores(pe1, 90, false, pe2, 55.5, false, pe3, 100, false)).status()).isEqualTo(200);
        JsonNode res = send("GET", "/api/v1/examinations/" + p3Exam + "/results?classId=" + p3Class, token4, null).json(json);
        assertThat(num(res.path("passPercent"))).isEqualByComparingTo("50");
        assertThat(res.path("subjects").size()).isEqualTo(2);
        JsonNode a = resultOf(res, pe1), b = resultOf(res, pe2), c = resultOf(res, pe3);
        // student 1: (8.5*1 + 90*2) / (10*1 + 100*2) = 188.5 / 210 = 89.76 %
        assertThat(num(a.path("percent"))).isEqualByComparingTo("89.76");
        assertThat(num(a.path("total"))).isEqualByComparingTo("98.5");
        assertThat(num(a.path("totalMax"))).isEqualByComparingTo("110");
        assertThat(a.path("bandLetter").asString()).isEqualTo("B");
        assertThat(a.path("bandLabel").asString()).isEqualTo("ល្អណាស់");
        assertThat(a.path("passed").asBoolean()).isTrue();
        assertThat(a.path("rank").asInt()).isEqualTo(2);
        // student 2: absent in Khmer counts as 0, flagged: (0 + 55.5*2) / 210 = 52.86 %
        assertThat(num(b.path("percent"))).isEqualByComparingTo("52.86");
        assertThat(b.path("absentCount").asInt()).isEqualTo(1);
        assertThat(b.path("bandLetter").asString()).isEqualTo("E");
        assertThat(b.path("rank").asInt()).isEqualTo(3);
        // student 3: full marks
        assertThat(num(c.path("percent"))).isEqualByComparingTo("100");
        assertThat(c.path("bandLetter").asString()).isEqualTo("A");
        assertThat(c.path("rank").asInt()).isEqualTo(1);

        // a correction keeps the old score in the trail; the percentage follows: (8.5 + 91*2) / 210 = 90.71 %
        assertThat(putScores(math, scores(pe1, 91, false)).status()).isEqualTo(200);
        List<Map<String, Object>> trail = jdbc.queryForList("select before_json, after_json from audit_logs where action = 'SCORE_CORRECTED'");
        assertThat(trail).hasSize(1);
        assertThat(trail.get(0).get("before_json")).isEqualTo("{\"scoreX100\":9000,\"absent\":false}");
        assertThat(trail.get(0).get("after_json")).isEqualTo("{\"scoreX100\":9100,\"absent\":false}");
        JsonNode corrected = send("GET", "/api/v1/examinations/" + p3Exam + "/results?classId=" + p3Class, token4, null).json(json);
        assertThat(num(resultOf(corrected, pe1).path("percent"))).isEqualByComparingTo("90.71");
        assertThat(resultOf(corrected, pe1).path("bandLetter").asString()).isEqualTo("A");

        // ties share a rank and the next one is skipped: student 2 now scores the same as student 1
        assertThat(putScores(khmer, scores(pe2, 8.5, false)).status()).isEqualTo(200);
        assertThat(putScores(math, scores(pe2, 91, false)).status()).isEqualTo(200);
        JsonNode tied = send("GET", "/api/v1/examinations/" + p3Exam + "/results?classId=" + p3Class, token4, null).json(json);
        assertThat(resultOf(tied, pe3).path("rank").asInt()).isEqualTo(1);
        assertThat(resultOf(tied, pe1).path("rank").asInt()).isEqualTo(2);
        assertThat(resultOf(tied, pe2).path("rank").asInt()).as("a tie").isEqualTo(2);
        assertThat(resultOf(tied, pe2).path("absentCount").asInt()).as("no longer absent").isZero();

        // one student's results across examinations
        JsonNode mine = send("GET", "/api/v1/students/" + ps1 + "/results", token4, null).json(json);
        assertThat(mine.size()).isEqualTo(1);
        assertThat(mine.get(0).path("examinationName").asString()).isEqualTo("ប្រឡងខែទី១");
        assertThat(mine.get(0).path("result").path("rank").asInt()).isEqualTo(2);

        // what already has scores is protected
        assertThat(fieldCodes(send("PUT", "/api/v1/examinations/" + p3Exam + "/subjects/" + esMath, token4, "{\"maxScore\":50,\"weight\":2}"))).as("the maximum may not drop below a score entered").containsExactly("maxScore:OUT_OF_RANGE");
        assertThat(code(send("DELETE", "/api/v1/examinations/" + p3Exam + "/subjects/" + esMath, token4, null))).isEqualTo("EXAM_SUBJECT_HAS_SCORES");
        assertThat(code(send("DELETE", "/api/v1/examinations/" + p3Exam, token4, null))).isEqualTo("EXAMINATION_HAS_SCORES");
        assertThat(send("GET", "/api/v1/examinations/" + p3Exam, token4, null).json(json).path("scoreCount").asInt()).isEqualTo(6);
    }

    // ---- report cards ---------------------------------------------------------------------------------------------

    @Test @Order(40)
    void reportCardsCarryTheResultTheAttendanceAndTheTeachersComment() throws Exception {
        String url = "/api/v1/report-cards/data?examinationId=" + p3Exam + "&classId=" + p3Class;
        assertThat(send("GET", url, null, null).status()).isEqualTo(401);
        JsonNode cards = send("GET", url, token4, null).json(json);
        assertThat(cards.size()).isEqualTo(3);
        JsonNode card = null;
        for (JsonNode c : cards) if (c.path("studentId").asLong() == ps1) card = c;
        assertThat(card.path("nameKm").asString()).isEqualTo("សិស្ស មួយ");
        assertThat(card.has("photoFile") && card.path("photoFile").isNull()).as("the card says which photo the student has (none here), for the optional photo block").isTrue();
        assertThat(card.path("className").asString()).isEqualTo("ក");
        assertThat(card.path("gradeName").asString()).isEqualTo("ថ្នាក់ទី១");
        assertThat(card.path("yearName").asString()).isEqualTo("២០២៦-២០២៧ (កែ)");
        assertThat(card.path("examinationName").asString()).isEqualTo("ប្រឡងខែទី១");
        assertThat(card.path("subjects").size()).isEqualTo(2);
        assertThat(card.path("subjects").get(0).path("subjectName").asString()).as("in the order of the subject list").isEqualTo("ភាសាខ្មែរ");
        assertThat(num(card.path("subjects").get(0).path("score"))).isEqualByComparingTo("8.5");
        assertThat(num(card.path("subjects").get(1).path("weight"))).isEqualByComparingTo("2");
        assertThat(num(card.path("percent"))).isEqualByComparingTo("90.71");
        assertThat(card.path("bandLetter").asString()).isEqualTo("A");
        assertThat(card.path("passed").asBoolean()).isTrue();
        assertThat(card.path("rank").asInt()).isEqualTo(2);
        assertThat(card.path("rankedCount").asInt()).isEqualTo(3);
        // the official method is DAY until the school chooses: present in the day session and absent in the morning one is ONE partial day, never two days
        assertThat(card.path("attendance").path("basis").asString()).isEqualTo("DAY");
        assertThat(card.path("attendance").path("partial").asInt()).as("present in one session, absent in another: one partial day").isEqualTo(1);
        assertThat(card.path("attendance").path("present").asInt()).isZero();
        assertThat(card.path("attendance").path("absent").asInt()).isZero();
        assertThat(card.path("attendance").path("total").asInt()).as("one day, not two sessions").isEqualTo(1);
        assertThat(card.path("attendance").path("from").asString()).as("from the first day of the year").isEqualTo(p3YearStart);
        assertThat(card.path("attendance").path("to").asString()).as("to today, the year is still running").isEqualTo(TODAY);
        assertThat(card.path("comment").isNull()).isTrue();

        // the school can make SESSIONS the official count: then the same student has one session present and one absent (two sheets), and the card says so
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"attendance.officialBasis\":\"SESSION\"}").status()).isEqualTo(200);
        JsonNode bySession = send("GET", url + "&studentId=" + ps1, token4, null).json(json).get(0).path("attendance");
        assertThat(bySession.path("basis").asString()).isEqualTo("SESSION");
        assertThat(List.of(bySession.path("present").asInt(), bySession.path("absent").asInt(), bySession.path("late").asInt(), bySession.path("leave").asInt(), bySession.path("partial").asInt(), bySession.path("total").asInt()))
                .as("present, absent, late, leave, partial, total sessions").containsExactly(1, 1, 0, 0, 0, 2);
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"attendance.officialBasis\":\"DAY\"}").status()).isEqualTo(200);

        assertThat(send("GET", url + "&studentId=" + ps3, token4, null).json(json).size()).as("one student's card").isEqualTo(1);
        assertThat(code(send("GET", url + "&studentId=999999", token4, null))).isEqualTo("NOT_FOUND");

        // the teacher's comment: saved, replaced, removed
        String comment = "{\"examinationId\":" + p3Exam + ",\"enrollmentId\":" + pe1 + ",\"comment\":\"  ខិតខំប្រឹងប្រែងល្អ  \"}";
        assertThat(send("PUT", "/api/v1/report-cards/comment", token4, comment).status()).isEqualTo(204);
        assertThat(send("GET", url + "&studentId=" + ps1, token4, null).json(json).get(0).path("comment").asString()).as("trimmed").isEqualTo("ខិតខំប្រឹងប្រែងល្អ");
        assertThat(send("PUT", "/api/v1/report-cards/comment", token4, comment.replace("ខិតខំប្រឹងប្រែងល្អ", "កែថ្មី")).status()).isEqualTo(204);
        assertThat(jdbc.queryForObject("select count(*) from report_card_comments", Integer.class)).as("replaced, not duplicated").isEqualTo(1);
        assertThat(send("GET", url + "&studentId=" + ps1, token4, null).json(json).get(0).path("comment").asString()).isEqualTo("កែថ្មី");
        assertThat(jdbc.queryForObject("select group_concat(summary) from audit_logs where action = 'REPORT_COMMENT_SAVED'", String.class)).as("the trail never holds the text").doesNotContain("កែថ្មី");
        assertThat(send("PUT", "/api/v1/report-cards/comment", token4, comment.replace("ខិតខំប្រឹងប្រែងល្អ", "")).status()).isEqualTo(204);
        assertThat(send("GET", url + "&studentId=" + ps1, token4, null).json(json).get(0).path("comment").isNull()).as("empty removes it").isTrue();
        assertThat(fieldCodes(send("PUT", "/api/v1/report-cards/comment", token4, "{\"examinationId\":" + p3Exam + ",\"enrollmentId\":" + enrollmentOf(s1) + ",\"comment\":\"x\"}"))).as("a student of another year").containsExactly("enrollmentId:INVALID");
        assertThat(fieldCodes(send("PUT", "/api/v1/report-cards/comment", token4, "{\"examinationId\":" + p3Exam + ",\"enrollmentId\":" + pe1 + ",\"comment\":\"" + "ក".repeat(1001) + "\"}"))).containsExactly("comment:Size");

        // an examination nobody has scored yet: cards exist but are incomplete
        long open = send("POST", "/api/v1/examinations", token4, json.writeValueAsString(Map.of("academicYearId", p3Year, "nameKm", "ប្រឡងមិនទាន់បញ្ចូល", "kind", "FINAL"))).json(json).path("id").asLong();
        JsonNode empty = send("GET", "/api/v1/report-cards/data?examinationId=" + open + "&classId=" + p3Class, token4, null).json(json);
        assertThat(empty.size()).isEqualTo(3);
        assertThat(empty.get(0).path("complete").asBoolean()).isFalse();
        assertThat(empty.get(0).path("percent").isNull()).isTrue();
        assertThat(empty.get(0).path("rank").isNull()).isTrue();
        assertThat(send("DELETE", "/api/v1/examinations/" + open, token4, null).status()).isEqualTo(204);
    }

    // ---- homework -------------------------------------------------------------------------------------------------

    @Test @Order(41)
    void homeworkIsRecordedFilteredAndMarkedDone() throws Exception {
        long khmer = subjectIdsByCode().get("KHMER");
        assertThat(send("GET", "/api/v1/homework", null, null).status()).isEqualTo(401);
        String body = json.writeValueAsString(Map.of("classId", p3Class, "subjectId", khmer, "title", "  លំហាត់ទំព័រ ១២ ", "description", "ធ្វើលំហាត់ទាំងអស់", "assignedDate", "2026-11-02", "dueDate", "2026-11-04"));
        Resp created = send("POST", "/api/v1/homework", token4, body);
        assertThat(created.status()).isEqualTo(201);
        JsonNode h = created.json(json);
        long id = h.path("id").asLong();
        assertThat(h.path("title").asString()).as("normalised").isEqualTo("លំហាត់ទំព័រ ១២");
        assertThat(h.path("status").asString()).isEqualTo("ASSIGNED");
        assertThat(h.path("subjectName").asString()).isEqualTo("ភាសាខ្មែរ");
        assertThat(h.path("className").asString()).isEqualTo("ក");
        long later = send("POST", "/api/v1/homework", token4, json.writeValueAsString(Map.of("classId", p3Class, "subjectId", subjectIdsByCode().get("MATH"), "title", "លំហាត់គណិត", "assignedDate", "2026-11-03", "dueDate", "2026-11-10"))).json(json).path("id").asLong();

        assertThat(ids(send("GET", "/api/v1/homework?classId=" + p3Class, token4, null))).as("soonest due first").containsExactly(id, later);
        assertThat(ids(send("GET", "/api/v1/homework?from=2026-11-05", token4, null))).containsExactly(later);
        assertThat(ids(send("GET", "/api/v1/homework?to=2026-11-05", token4, null))).containsExactly(id);
        assertThat(ids(send("GET", "/api/v1/homework?status=DONE", token4, null))).isEmpty();

        assertThat(fieldCodes(send("POST", "/api/v1/homework", token4, body.replace("2026-11-04", "2026-11-01")))).containsExactly("dueDate:DUE_BEFORE_ASSIGNED");
        assertThat(send("POST", "/api/v1/homework", token4, body.replace("  លំហាត់ទំព័រ ១២ ", "   ")).status()).as("blank title").isEqualTo(422);
        assertThat(fieldCodes(send("POST", "/api/v1/homework", token4, body.replace("\"classId\":" + p3Class, "\"classId\":999999")))).containsExactly("classId:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/homework", token4, body.replace("\"subjectId\":" + khmer, "\"subjectId\":999999")))).containsExactly("subjectId:INVALID");

        String edit = json.writeValueAsString(Map.of("classId", p3Class, "subjectId", khmer, "title", "លំហាត់ទំព័រ ១៣", "assignedDate", "2026-11-02", "dueDate", "2026-11-04", "version", h.path("version").asLong()));
        Resp upd = send("PUT", "/api/v1/homework/" + id, token4, edit);
        assertThat(upd.json(json).path("title").asString()).isEqualTo("លំហាត់ទំព័រ ១៣");
        assertThat(upd.json(json).path("description").isNull()).as("an omitted description is stored as nothing").isTrue();
        assertThat(code(send("PUT", "/api/v1/homework/" + id, token4, edit))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");

        long v = upd.json(json).path("version").asLong();
        assertThat(send("PUT", "/api/v1/homework/" + id + "/status", token4, "{\"status\":\"DONE\",\"version\":" + v + "}").json(json).path("status").asString()).isEqualTo("DONE");
        assertThat(ids(send("GET", "/api/v1/homework?status=DONE", token4, null))).containsExactly(id);
        assertThat(fieldCodes(send("PUT", "/api/v1/homework/" + id + "/status", token4, "{\"status\":\"LOST\",\"version\":" + (v + 1) + "}"))).containsExactly("status:INVALID");
        assertThat(code(send("GET", "/api/v1/homework/999999", token4, null))).isEqualTo("NOT_FOUND");
    }

    // ---- a closed year freezes all of it; records now protect students from deletion --------------------------------

    @Test @Order(42)
    void aClosedYearFreezesAttendanceExamsScoresAndHomeworkAndRecordsProtectStudents() throws Exception {
        long khmer = subjectIdsByCode().get("KHMER");
        assertThat(code(send("DELETE", "/api/v1/students/" + ps1, token4, null))).as("attendance and scores refer to this student's enrollment").isEqualTo("STUDENT_HAS_HISTORY");
        assertThat(send("GET", "/api/v1/students/" + ps1, token4, null).status()).isEqualTo(200);

        assertThat(send("POST", "/api/v1/academic-years/" + p3Year + "/close", token4, null).status()).isEqualTo(200);
        assertThat(code(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, null, null, pe1, "ABSENT", null)))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(putScores(khmer, scores(pe1, 5, false)))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("POST", "/api/v1/examinations", token4, json.writeValueAsString(Map.of("academicYearId", p3Year, "nameKm", "ចុងក្រោយ", "kind", "FINAL"))))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("PUT", "/api/v1/examinations/" + p3Exam + "/subjects/" + esKhmer, token4, "{\"maxScore\":10,\"weight\":1}"))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("POST", "/api/v1/homework", token4, json.writeValueAsString(Map.of("classId", p3Class, "subjectId", khmer, "title", "ក", "assignedDate", "2026-11-02", "dueDate", "2026-11-04"))))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("PUT", "/api/v1/report-cards/comment", token4, "{\"examinationId\":" + p3Exam + ",\"enrollmentId\":" + pe1 + ",\"comment\":\"x\"}"))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(send("GET", "/api/v1/examinations/" + p3Exam + "/results?classId=" + p3Class, token4, null).status()).as("reading is still allowed").isEqualTo(200);
        assertThat(send("GET", "/api/v1/attendance/sheet?classId=" + p3Class + "&date=" + TODAY, token4, null).status()).isEqualTo(200);
        assertThat(send("POST", "/api/v1/academic-years/" + p3Year + "/reopen", token4, null).status()).isEqualTo(200);
        assertThat(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, null, null, pe1, "PRESENT", null)).status()).as("open again").isEqualTo(200);
    }

    // ---- Phase 4: frozen grading scale, school events, dashboard, report options, Excel, fees ----------------------------

    static long evSoon, evOngoing, catMonthly, catBook, chargeA, chargeB;

    JsonNode defaultScaleNode() throws Exception {
        for (JsonNode s : send("GET", "/api/v1/grading-scales", token4, null).json(json)) if (s.path("isDefault").asBoolean()) return s;
        throw new AssertionError("no default grading scale");
    }

    String scaleBody(String name, int pass, long version) {
        return "{\"nameKm\":\"" + name + "\",\"passPercent\":" + pass + ",\"bands\":[{\"minPercent\":0,\"labelKm\":\"ធ្លាក់\",\"letter\":\"F\"},{\"minPercent\":" + pass
                + ",\"labelKm\":\"ជាប់\",\"letter\":\"P\"}],\"version\":" + version + "}";
    }

    @Test @Order(43)
    void aGradingScaleIsFrozenForTheExaminationsGradedWithItAndEditingItMakesANewVersion() throws Exception {
        long khmer = subjectIdsByCode().get("KHMER"), math = subjectIdsByCode().get("MATH");
        // student 2 now sits between the old pass mark (50) and the new one (60): (8.5 + 55.5 x 2) / 210 = 56.90 %
        assertThat(putScores(math, scores(pe2, 55.5, false)).status()).isEqualTo(200);
        JsonNode before = defaultScaleNode();
        long oldId = before.path("id").asLong();
        assertThat(jdbc.queryForObject("select grading_scale_id from examinations where id = ?", Long.class, p3Exam)).as("recorded when its first score was entered").isEqualTo(oldId);

        Resp edited = send("PUT", "/api/v1/grading-scales/" + oldId, token4, scaleBody("មាត្រដ្ឋានថ្មី ៦០", 60, before.path("version").asLong()));
        assertThat(edited.status()).isEqualTo(200);
        JsonNode fresh = edited.json(json);
        long newId = fresh.path("id").asLong();
        assertThat(newId).as("a NEW scale: the old one is kept for the examinations that used it").isNotEqualTo(oldId);
        assertThat(fresh.path("isDefault").asBoolean()).isTrue();
        assertThat(num(fresh.path("passPercent"))).isEqualByComparingTo("60");
        int defaults = 0;
        for (JsonNode s : send("GET", "/api/v1/grading-scales", token4, null).json(json)) {
            assertThat(s.path("id").asLong()).as("an archived version is not listed").isNotEqualTo(oldId);
            if (s.path("isDefault").asBoolean()) defaults++;
        }
        assertThat(defaults).as("still exactly one default").isEqualTo(1);

        JsonNode frozen = send("GET", "/api/v1/examinations/" + p3Exam + "/results?classId=" + p3Class, token4, null).json(json);
        assertThat(num(frozen.path("passPercent"))).as("the old examination keeps its pass mark").isEqualByComparingTo("50");
        assertThat(frozen.path("scaleName").asString()).isEqualTo(before.path("nameKm").asString());
        assertThat(num(resultOf(frozen, pe2).path("percent"))).isEqualByComparingTo("56.9");
        assertThat(resultOf(frozen, pe2).path("passed").asBoolean()).as("56.9 % passes 50 %, it would fail the new 60 %").isTrue();
        assertThat(resultOf(frozen, pe2).path("bandLetter").asString()).as("and keeps its old band").isEqualTo("E");

        // a new examination follows the default until its first score, then it is frozen to the default of that moment
        long ex2 = send("POST", "/api/v1/examinations", token4, json.writeValueAsString(Map.of("academicYearId", p3Year, "nameKm", "ប្រឡងប្រចាំខែ ២", "kind", "MONTHLY"))).json(json).path("id").asLong();
        assertThat(jdbc.queryForObject("select grading_scale_id from examinations where id = ?", Long.class, ex2)).as("nothing scored yet").isNull();
        assertThat(num(send("GET", "/api/v1/examinations/" + ex2 + "/results?classId=" + p3Class, token4, null).json(json).path("passPercent"))).isEqualByComparingTo("60");
        String one = "{\"classId\":" + p3Class + ",\"subjectId\":" + khmer + ",\"scores\":[{\"enrollmentId\":" + pe1 + ",\"score\":80,\"absent\":false}]}";
        assertThat(send("PUT", "/api/v1/examinations/" + ex2 + "/scores", token4, one).status()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select grading_scale_id from examinations where id = ?", Long.class, ex2)).isEqualTo(newId);
        assertThat(send("PUT", "/api/v1/examinations/" + ex2 + "/scores", token4, "{\"classId\":" + p3Class + ",\"subjectId\":" + khmer + ",\"scores\":[]}").status()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select grading_scale_id from examinations where id = ?", Long.class, ex2)).as("saving nothing changes nothing").isEqualTo(newId);

        // editing the scale that is now frozen into ex2 makes another version; ex2 keeps the 60 %
        JsonNode current = defaultScaleNode();
        Resp again = send("PUT", "/api/v1/grading-scales/" + newId, token4, scaleBody("មាត្រដ្ឋានថ្មី ៧០", 70, current.path("version").asLong()));
        assertThat(again.json(json).path("id").asLong()).isNotEqualTo(newId);
        assertThat(num(send("GET", "/api/v1/examinations/" + ex2 + "/results?classId=" + p3Class, token4, null).json(json).path("passPercent"))).isEqualByComparingTo("60");
        assertThat(jdbc.queryForObject("select count(*) from grading_scales where archived = 1", Integer.class)).isEqualTo(2);

        // a replaced scale can be neither edited nor made the default (the screen that held it is out of date)
        assertThat(code(send("PUT", "/api/v1/grading-scales/" + oldId, token4, scaleBody("x", 40, 0)))).isEqualTo("OPTIMISTIC_LOCK");
        assertThat(code(send("POST", "/api/v1/grading-scales/" + oldId + "/set-default", token4, null))).isEqualTo("OPTIMISTIC_LOCK");

        // a scale nothing was graded with is still edited in place
        long plain = send("POST", "/api/v1/grading-scales", token4, scaleBody("មាត្រដ្ឋានមិនទាន់ប្រើ", 30, 0).replace(",\"version\":0", "")).json(json).path("id").asLong();
        Resp inPlace = send("PUT", "/api/v1/grading-scales/" + plain, token4, scaleBody("មាត្រដ្ឋានមិនទាន់ប្រើ ២", 35, 0));
        assertThat(inPlace.status()).isEqualTo(200);
        assertThat(inPlace.json(json).path("id").asLong()).as("same scale, edited in place").isEqualTo(plain);
        assertThat(num(inPlace.json(json).path("passPercent"))).isEqualByComparingTo("35");
    }

    String eventBody(String title, java.time.LocalDate start, java.time.LocalDate end, String note, Long version) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("titleKm", title);
        m.put("startDate", start.toString());
        m.put("endDate", end == null ? null : end.toString());
        m.put("note", note);
        if (version != null) m.put("version", version);
        return json.writeValueAsString(m);
    }

    @Test @Order(44)
    void schoolEventsAreKeptEditedAndListedByDate() throws Exception {
        assertThat(send("GET", "/api/v1/school-events", null, null).status()).as("needs a session").isEqualTo(401);
        java.time.LocalDate today = java.time.LocalDate.now(CLOCK);
        Resp created = send("POST", "/api/v1/school-events", token4, eventBody("  សប្តាហ៍ប្រឡង ", today.plusDays(3), today.plusDays(5), "សូមមកទាន់ពេល", null));
        assertThat(created.status()).isEqualTo(201);
        evSoon = created.json(json).path("id").asLong();
        assertThat(created.json(json).path("titleKm").asString()).as("normalised").isEqualTo("សប្តាហ៍ប្រឡង");
        long past = send("POST", "/api/v1/school-events", token4, eventBody("ថ្ងៃឈប់សម្រាក", today.minusDays(1), null, null, null)).json(json).path("id").asLong();
        evOngoing = send("POST", "/api/v1/school-events", token4, eventBody("កិច្ចប្រជុំគ្រូ", today.minusDays(1), today.plusDays(1), null, null)).json(json).path("id").asLong();

        assertThat(ids(send("GET", "/api/v1/school-events", token4, null))).as("earliest first").containsExactly(past, evOngoing, evSoon);
        assertThat(ids(send("GET", "/api/v1/school-events?from=" + today, token4, null))).as("upcoming: what already ended is left out, what is under way stays").containsExactly(evOngoing, evSoon);
        assertThat(ids(send("GET", "/api/v1/school-events?to=" + today, token4, null))).as("started by today").containsExactly(past, evOngoing);
        assertThat(ids(send("GET", "/api/v1/school-events?limit=1", token4, null))).hasSize(1);
        assertThat(send("GET", "/api/v1/school-events?from=bad", token4, null).status()).isEqualTo(422);

        assertThat(fieldCodes(send("POST", "/api/v1/school-events", token4, eventBody("   ", today, null, null, null)))).containsExactly("titleKm:NotBlank");
        assertThat(fieldCodes(send("POST", "/api/v1/school-events", token4, eventBody("ក", today.plusDays(2), today.plusDays(1), null, null)))).containsExactly("endDate:END_BEFORE_START");
        assertThat(fieldCodes(send("POST", "/api/v1/school-events", token4, eventBody("ក".repeat(151), today, null, null, null)))).containsExactly("titleKm:Size");
        assertThat(fieldCodes(send("POST", "/api/v1/school-events", token4, eventBody("ក", today, null, "ក".repeat(501), null)))).containsExactly("note:Size");
        assertThat(fieldCodes(send("POST", "/api/v1/school-events", token4, "{\"titleKm\":\"ក\",\"startDate\":\"2026-13-45\"}"))).containsExactly("startDate:INVALID_DATE");
        assertThat(ids(send("GET", "/api/v1/school-events", token4, null))).as("rejected requests stored nothing").hasSize(3);

        long version = send("GET", "/api/v1/school-events", token4, null).json(json).get(2).path("version").asLong();
        Resp upd = send("PUT", "/api/v1/school-events/" + evSoon, token4, eventBody("សប្តាហ៍ប្រឡងឆមាស", today.plusDays(3), null, null, version));
        assertThat(upd.status()).isEqualTo(200);
        assertThat(upd.json(json).path("titleKm").asString()).isEqualTo("សប្តាហ៍ប្រឡងឆមាស");
        assertThat(upd.json(json).path("endDate").isNull()).isTrue();
        assertThat(code(send("PUT", "/api/v1/school-events/" + evSoon, token4, eventBody("ក", today, null, null, version)))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");

        assertThat(send("DELETE", "/api/v1/school-events/" + past, token4, null).status()).isEqualTo(204);
        assertThat(ids(send("GET", "/api/v1/school-events", token4, null))).containsExactly(evOngoing, evSoon);
        assertThat(code(send("DELETE", "/api/v1/school-events/" + past, token4, null))).isEqualTo("NOT_FOUND");
    }

    @Test @Order(45)
    void theDashboardCountsPeopleAttendanceExaminationsEventsAndLeavesFeesOutWhileTheyAreOff() throws Exception {
        assertThat(send("GET", "/api/v1/dashboard", null, null).status()).as("needs a session").isEqualTo(401);
        assertThat(send("POST", "/api/v1/academic-years/" + p3Year + "/set-current", token4, null).status()).isEqualTo(200);
        JsonNode d = send("GET", "/api/v1/dashboard", token4, null).json(json);
        assertThat(d.path("currentYear").path("id").asLong()).isEqualTo(p3Year);
        int active = jdbc.queryForObject("select count(*) from students where status = 'ACTIVE'", Integer.class);
        assertThat(d.path("students").path("active").asInt()).isEqualTo(active);
        assertThat(d.path("students").path("male").asInt() + d.path("students").path("female").asInt()).as("boys + girls = everybody").isEqualTo(active);
        assertThat(d.path("activeTeachers").asInt()).isEqualTo(jdbc.queryForObject("select count(*) from teachers where status = 'ACTIVE'", Integer.class));
        assertThat(d.path("classes").asInt()).isEqualTo(jdbc.queryForObject("select count(*) from classes where academic_year_id = ?", Integer.class, p3Year));

        // today's two sessions of the class: day = present, absent, late; morning = absent, leave
        JsonNode att = d.path("attendanceToday");
        assertThat(att.path("date").asString()).isEqualTo(TODAY);
        assertThat(att.path("classesRecorded").asInt()).as("one class took attendance today").isEqualTo(1);
        assertThat(att.path("classes").asInt()).isEqualTo(d.path("classes").asInt());
        assertThat(att.path("sheets").asInt()).as("the day session and the morning session").isEqualTo(2);
        // official method DAY (the default): three students, one day each. student 1 present then absent = partial, student 2 absent then on leave = absent, student 3 late in the one session taken
        assertThat(att.path("basis").asString()).isEqualTo("DAY");
        assertThat(List.of(att.path("present").asInt(), att.path("late").asInt(), att.path("partial").asInt(), att.path("absent").asInt(), att.path("leave").asInt())).containsExactly(0, 1, 1, 1, 0);
        // official method SESSION: every record of every sheet is counted
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"attendance.officialBasis\":\"SESSION\"}").status()).isEqualTo(200);
        JsonNode bySheet = send("GET", "/api/v1/dashboard", token4, null).json(json).path("attendanceToday");
        assertThat(bySheet.path("basis").asString()).isEqualTo("SESSION");
        assertThat(List.of(bySheet.path("present").asInt(), bySheet.path("absent").asInt(), bySheet.path("late").asInt(), bySheet.path("leave").asInt(), bySheet.path("partial").asInt())).containsExactly(1, 2, 1, 1, 0);
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"attendance.officialBasis\":\"DAY\"}").status()).isEqualTo(200);

        JsonNode exams = d.path("recentExams");
        assertThat(exams.size()).isBetween(2, 3);
        assertThat(exams.get(0).path("nameKm").asString()).as("newest first").isEqualTo("ប្រឡងប្រចាំខែ ២");
        assertThat(exams.get(0).path("scoreCount").asInt()).isEqualTo(1);
        List<String> titles = new ArrayList<>();
        d.path("events").forEach(e -> titles.add(e.path("titleKm").asString()));
        assertThat(titles).as("upcoming events, earliest first").containsExactly("កិច្ចប្រជុំគ្រូ", "សប្តាហ៍ប្រឡងឆមាស");
        assertThat(d.path("fees").isNull()).as("fees are switched off").isTrue();
    }

    @Test @Order(46)
    void reportOptionsAndFeeSettingsAreNormalisedAndAnyBadValueRejectsTheWholeRequest() throws Exception {
        String app = send("GET", "/api/v1/settings/app", token4, null).body();
        assertThat(app).contains("\"report.moeysHeader\":\"false\"").contains("\"report.khmerNumerals\":\"false\"").contains("\"fees.enabled\":\"false\"")
                .contains("\"fees.currencies\":\"KHR\"").contains("\"report.headerLine1\":\"ព្រះរាជាណាចក្រកម្ពុជា\"").contains("\"report.headerLine3\":\"\"");
        Resp ok = send("PUT", "/api/v1/settings/app", token4, "{\"report.headerLine3\":\"  ខេត្តកណ្តាល  \",\"report.moeysHeader\":\"true\",\"report.khmerNumerals\":\"true\"}");
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.body()).contains("\"report.headerLine3\":\"ខេត្តកណ្តាល\"").contains("\"report.moeysHeader\":\"true\"").contains("\"report.khmerNumerals\":\"true\"");

        Resp bad = send("PUT", "/api/v1/settings/app", token4, "{\"report.headerLine3\":\"ok\",\"report.moeysHeader\":\"maybe\",\"fees.currencies\":\"EUR\",\"report.headerLine2\":\"" + "ក".repeat(101) + "\",\"nope\":\"1\"}");
        assertThat(bad.status()).isEqualTo(422);
        assertThat(fieldCodes(bad)).containsExactlyInAnyOrder("report.moeysHeader:INVALID_SETTING", "fees.currencies:INVALID_SETTING", "report.headerLine2:INVALID_SETTING", "nope:INVALID_SETTING");
        assertThat(send("GET", "/api/v1/settings/app", token4, null).body()).as("nothing from a rejected request was stored").contains("\"report.headerLine3\":\"ខេត្តកណ្តាល\"");

        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"report.headerLine3\":\"\",\"report.moeysHeader\":\"false\",\"report.khmerNumerals\":\"false\"}").status()).as("an empty header line is allowed").isEqualTo(200);

        // the report card's layout: the defaults are today's card (a photo is the only new block, and it is off), every value is checked, a bad one stores nothing
        assertThat(app).contains("\"card.showLogo\":\"true\"").contains("\"card.showNationalHeader\":\"true\"").contains("\"card.showPhoto\":\"false\"").contains("\"card.showAttendance\":\"true\"")
                .contains("\"card.showRank\":\"true\"").contains("\"card.showComment\":\"true\"").contains("\"card.signatureCount\":\"1\"").contains("\"card.signature1\":\"\"")
                .contains("\"card.footerNote\":\"\"").contains("\"card.subjectOrder\":\"default\"");
        Resp tmpl = send("PUT", "/api/v1/settings/app", token4, j("card.showRank", "false", "card.showPhoto", "true", "card.signatureCount", "3", "card.signature1", "  នាយកសាលា  ", "card.signature2", "គ្រូប្រចាំថ្នាក់",
                "card.signature3", "ឪពុកម្តាយ", "card.footerNote", "  សូមរក្សាទុកសន្លឹកនេះ  ", "card.subjectOrder", "name"));
        assertThat(tmpl.status()).as(tmpl.body()).isEqualTo(200);
        assertThat(tmpl.body()).contains("\"card.showRank\":\"false\"").contains("\"card.showPhoto\":\"true\"").contains("\"card.signatureCount\":\"3\"").contains("\"card.signature1\":\"នាយកសាលា\"")
                .contains("\"card.footerNote\":\"សូមរក្សាទុកសន្លឹកនេះ\"").contains("\"card.subjectOrder\":\"name\"");
        Resp badTemplate = send("PUT", "/api/v1/settings/app", token4, j("card.showLogo", "false", "card.signatureCount", "4", "card.subjectOrder", "random", "card.signature2", "ក".repeat(61), "card.footerNote", "ក".repeat(201), "card.showComment", "yes"));
        assertThat(fieldCodes(badTemplate)).containsExactlyInAnyOrder("card.signatureCount:INVALID_SETTING", "card.subjectOrder:INVALID_SETTING", "card.signature2:INVALID_SETTING", "card.footerNote:INVALID_SETTING", "card.showComment:INVALID_SETTING");
        assertThat(send("GET", "/api/v1/settings/app", token4, null).body()).as("the valid logo switch in that request was not stored either").contains("\"card.showLogo\":\"true\"").contains("\"card.signatureCount\":\"3\"");
        // back to the defaults for the rest of the scenario
        assertThat(send("PUT", "/api/v1/settings/app", token4, j("card.showRank", "true", "card.showPhoto", "false", "card.signatureCount", "1", "card.signature1", "", "card.signature2", "", "card.signature3", "", "card.footerNote", "", "card.subjectOrder", "default")).status()).isEqualTo(200);
    }

    @Test @Order(47)
    void anyReportBecomesAnExcelFileThatIsTheSameTableAsThePrintedPage() throws Exception {
        String schoolName = send("GET", "/api/v1/settings/school", token4, null).json(json).path("nameKm").asString();
        List<Object> second = java.util.Arrays.asList("ក", null, null, null);
        String body = json.writeValueAsString(Map.of("sheetName", "តារាង/សាកល្បង", "title", "របាយការណ៍សាកល្បង", "subtitle", "ថ្នាក់ទី១ ក",
                "columns", List.of(Map.of("label", "លេខសម្គាល់", "type", "TEXT", "width", 14), Map.of("label", "ចំនួន", "type", "INTEGER"), Map.of("label", "ភាគរយ", "type", "DECIMAL"), Map.of("label", "ថ្ងៃ", "type", "DATE")),
                "rows", List.of(List.of("0123456789", 7, 89.76, "2026-11-02"), second)));
        assertThat(exec("POST", "/api/v1/reports/export", null, true, body.getBytes(StandardCharsets.UTF_8), "application/json", Map.of()).status()).as("needs a session").isEqualTo(401);
        Resp file = send("POST", "/api/v1/reports/export", token4, body);
        assertThat(file.status()).isEqualTo(200);
        assertThat(file.headers().firstValue("Content-Type").orElse("")).contains("spreadsheetml");
        assertThat(new String(file.bytes(), 0, 2, StandardCharsets.ISO_8859_1)).as("an .xlsx is a zip").isEqualTo("PK");

        try (org.apache.poi.xssf.usermodel.XSSFWorkbook wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook(new java.io.ByteArrayInputStream(file.bytes()))) {
            org.apache.poi.ss.usermodel.Sheet sheet = wb.getSheetAt(0);
            assertThat(sheet.getSheetName()).as("characters Excel forbids in a name become spaces").isEqualTo("តារាង សាកល្បង");
            assertThat(sheet.getRow(0).getCell(0).getStringCellValue()).as("the school's name").isEqualTo(schoolName);
            assertThat(sheet.getRow(1).getCell(0).getStringCellValue()).isEqualTo("របាយការណ៍សាកល្បង");
            assertThat(sheet.getRow(2).getCell(0).getStringCellValue()).isEqualTo("ថ្នាក់ទី១ ក");
            assertThat(sheet.getRow(3)).as("one empty row before the table").isNull();
            assertThat(sheet.getRow(4).getCell(0).getStringCellValue()).isEqualTo("លេខសម្គាល់");
            assertThat(sheet.getRow(4).getCell(3).getStringCellValue()).isEqualTo("ថ្ងៃ");
            org.apache.poi.ss.usermodel.Row r = sheet.getRow(5);
            assertThat(r.getCell(0).getCellType()).as("a phone number stays text").isEqualTo(org.apache.poi.ss.usermodel.CellType.STRING);
            assertThat(r.getCell(0).getStringCellValue()).isEqualTo("0123456789");
            assertThat(r.getCell(1).getNumericCellValue()).isEqualTo(7.0);
            assertThat(r.getCell(2).getNumericCellValue()).isEqualTo(89.76);
            assertThat(r.getCell(2).getCellStyle().getDataFormatString()).isEqualTo("0.00");
            assertThat(org.apache.poi.ss.usermodel.DateUtil.isCellDateFormatted(r.getCell(3))).as("a real date cell").isTrue();
            assertThat(r.getCell(3).getLocalDateTimeCellValue().toLocalDate()).isEqualTo(java.time.LocalDate.parse("2026-11-02"));
            assertThat(sheet.getRow(6).getCell(0).getStringCellValue()).isEqualTo("ក");
            assertThat(sheet.getRow(6).getCell(1).getCellType()).as("an empty value is an empty cell").isEqualTo(org.apache.poi.ss.usermodel.CellType.BLANK);
            assertThat(sheet.getPaneInformation().isFreezePane()).isTrue();
            assertThat((int) sheet.getPaneInformation().getHorizontalSplitTopRow()).as("the header stays in view").isEqualTo(5);
            assertThat(sheet.getNumMergedRegions()).as("school, title and subtitle span the table").isEqualTo(3);
        }

        List<Object> short1 = List.of("a");
        assertThat(fieldCodes(send("POST", "/api/v1/reports/export", token4, json.writeValueAsString(Map.of("columns", List.of(Map.of("label", "a"), Map.of("label", "b")), "rows", List.of(short1)))))).as("a row of the wrong length").containsExactly("rows:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/reports/export", token4, json.writeValueAsString(Map.of("columns", List.of(Map.of("label", "a", "type", "MONEY")), "rows", List.of()))))).as("unknown column type").containsExactly("columns:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/reports/export", token4, json.writeValueAsString(Map.of("columns", List.<Object>of(), "rows", List.of()))))).containsExactly("columns:NotEmpty");
        assertThat(fieldCodes(send("POST", "/api/v1/reports/export", token4, json.writeValueAsString(Map.of("columns", List.of(Map.of("label", "d", "type", "DATE")), "rows", List.of(List.of("2026-13-45"))))))).as("not a date").containsExactly("rows:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/reports/export", token4, json.writeValueAsString(Map.of("columns", List.of(Map.of("label", "n", "type", "INTEGER")), "rows", List.of(List.of("seven"))))))).as("text in a number column").containsExactly("rows:INVALID");
        assertThat(send("POST", "/api/v1/reports/export", token4, json.writeValueAsString(Map.of("columns", List.of(Map.of("label", "a")), "rows", List.of()))).status()).as("a table with no rows is a valid report").isEqualTo(200);
    }

    // ---- fees ----------------------------------------------------------------------------------------------------------

    String payBody(Object amount, String paidOn, String method, String reference) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("amount", amount);
        m.put("paidOn", paidOn);
        m.put("method", method);
        m.put("reference", reference);
        return json.writeValueAsString(m);
    }

    JsonNode ledger(long enrollmentId) throws Exception { return send("GET", "/api/v1/fees/enrollments/" + enrollmentId, token4, null).json(json); }

    JsonNode chargeOf(JsonNode ledger, String dueDate) {
        for (JsonNode c : ledger.path("charges")) if (c.path("dueDate").asString().equals(dueDate)) return c;
        throw new AssertionError("no charge due " + dueDate);
    }

    @Test @Order(48)
    void feesAreOffByDefaultAndEveryCallAnswers409UntilTheyAreSwitchedOn() throws Exception {
        for (String path : List.of("/api/v1/fees/categories", "/api/v1/fees/class?classId=" + p3Class, "/api/v1/fees/enrollments/" + pe1, "/api/v1/fees/payments/1/receipt")) {
            Resp r = send("GET", path, token4, null);
            assertThat(r.status()).as(path).isEqualTo(409);
            assertThat(code(r)).as(path).isEqualTo("FEES_DISABLED");
        }
        assertThat(code(send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"ក\"}"))).isEqualTo("FEES_DISABLED");
        assertThat(code(send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":" + pe1 + ",\"categoryId\":1}"))).isEqualTo("FEES_DISABLED");
        assertThat(code(send("POST", "/api/v1/fees/charges/1/payments", token4, payBody(1, TODAY, "CASH", null)))).isEqualTo("FEES_DISABLED");
        assertThat(send("GET", "/api/v1/fees/categories", null, null).status()).as("needs a session").isEqualTo(401);

        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.enabled\":\"true\"}").status()).isEqualTo(200);
        Resp none = send("GET", "/api/v1/fees/categories", token4, null);
        assertThat(none.status()).isEqualTo(200);
        assertThat(none.json(json).size()).isZero();
    }

    @Test @Order(49)
    void feeCategoriesAreNamedUniqueEditableAndInOneOfTheAllowedCurrencies() throws Exception {
        Resp created = send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"  ថ្លៃសិក្សាប្រចាំខែ \",\"defaultAmount\":15000}");
        assertThat(created.status()).isEqualTo(201);
        JsonNode c = created.json(json);
        catMonthly = c.path("id").asLong();
        assertThat(c.path("nameKm").asString()).isEqualTo("ថ្លៃសិក្សាប្រចាំខែ");
        assertThat(c.path("currency").asString()).as("KHR is the only currency until the school says otherwise").isEqualTo("KHR");
        assertThat(num(c.path("defaultAmount"))).isEqualByComparingTo("15000");
        assertThat(c.path("active").asBoolean()).isTrue();

        assertThat(code(send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"ថ្លៃសិក្សាប្រចាំខែ\"}"))).isEqualTo("DUPLICATE");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"   \"}"))).containsExactly("nameKm:NotBlank");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"ថ្លៃសៀវភៅ\",\"currency\":\"USD\"}"))).as("USD is not allowed yet").containsExactly("currency:CURRENCY_NOT_ALLOWED");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"ថ្លៃសៀវភៅ\",\"defaultAmount\":12.5}"))).as("riel have no decimals").containsExactly("defaultAmount:INVALID_NUMBER");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"ថ្លៃសៀវភៅ\",\"defaultAmount\":-1}"))).containsExactly("defaultAmount:INVALID_NUMBER");
        assertThat(send("GET", "/api/v1/fees/categories", token4, null).json(json).size()).as("rejected requests stored nothing").isEqualTo(1);

        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.currencies\":\"KHR,USD\"}").status()).isEqualTo(200);
        Resp usd = send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"ថ្លៃសៀវភៅ\",\"currency\":\"USD\",\"defaultAmount\":12.5}");
        assertThat(usd.status()).isEqualTo(201);
        catBook = usd.json(json).path("id").asLong();
        assertThat(num(usd.json(json).path("defaultAmount"))).isEqualByComparingTo("12.5");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"ថ្លៃឯកសណ្ឋាន\",\"currency\":\"USD\",\"defaultAmount\":12.345}"))).as("cents, not tenths of a cent").containsExactly("defaultAmount:INVALID_NUMBER");

        String rename = "{\"nameKm\":\"ថ្លៃសិក្សា\",\"defaultAmount\":16000,\"currency\":\"KHR\",\"version\":" + c.path("version").asLong() + "}";
        Resp upd = send("PUT", "/api/v1/fees/categories/" + catMonthly, token4, rename);
        assertThat(upd.status()).isEqualTo(200);
        assertThat(upd.json(json).path("nameKm").asString()).isEqualTo("ថ្លៃសិក្សា");
        assertThat(code(send("PUT", "/api/v1/fees/categories/" + catMonthly, token4, rename))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");
        assertThat(send("PUT", "/api/v1/fees/categories/" + catMonthly, token4, rename.replace("16000", "15000").replace("\"version\":" + c.path("version").asLong(), "\"version\":" + upd.json(json).path("version").asLong())).status()).isEqualTo(200);

        long v = send("GET", "/api/v1/fees/categories", token4, null).json(json).get(0).path("version").asLong();
        assertThat(send("PUT", "/api/v1/fees/categories/" + catMonthly + "/active", token4, "{\"active\":false,\"version\":" + v + "}").json(json).path("active").asBoolean()).isFalse();
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":" + pe1 + ",\"categoryId\":" + catMonthly + "}"))).as("a deactivated category cannot be charged").containsExactly("categoryId:FEE_CATEGORY_INACTIVE");
        assertThat(send("PUT", "/api/v1/fees/categories/" + catMonthly + "/active", token4, "{\"active\":true,\"version\":" + (v + 1) + "}").json(json).path("active").asBoolean()).isTrue();
        assertThat(fieldCodes(send("PUT", "/api/v1/fees/categories/" + catMonthly + "/active", token4, "{\"version\":" + (v + 2) + "}"))).as("the flag is required").containsExactly("active:NotNull");
    }

    @Test @Order(50)
    void chargesPaymentsReceiptsAndVoidingKeepEveryNumberAndNeverDeleteAPayment() throws Exception {
        // one charge, with the category's own amount
        Resp one = send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":" + pe1 + ",\"categoryId\":" + catMonthly + ",\"dueDate\":\"2026-11-30\",\"note\":\"ខែវិច្ឆិកា\"}");
        assertThat(one.status()).isEqualTo(201);
        chargeA = one.json(json).path("id").asLong();
        assertThat(num(one.json(json).path("amountDue"))).as("the default amount of the category").isEqualByComparingTo("15000");
        assertThat(num(one.json(json).path("balance"))).isEqualByComparingTo("15000");

        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":" + pe1 + ",\"categoryId\":" + catMonthly + ",\"amount\":0}"))).containsExactly("amount:INVALID_NUMBER");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":" + pe1 + ",\"categoryId\":" + catBook + ",\"amount\":12.345}"))).containsExactly("amount:INVALID_NUMBER");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":" + pe1 + ",\"categoryId\":999999}"))).containsExactly("categoryId:INVALID");
        assertThat(code(send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":999999,\"categoryId\":" + catMonthly + "}"))).isEqualTo("NOT_FOUND");
        long ended = jdbc.queryForObject("select id from enrollments where status <> 'ACTIVE' limit 1", Long.class);
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":" + ended + ",\"categoryId\":" + catMonthly + "}"))).as("only a student who is in a class now").containsExactly("enrollmentId:ENROLLMENT_NOT_ACTIVE");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":" + pe1 + ",\"categoryId\":" + catMonthly + ",\"dueDate\":\"2026-13-45\"}"))).containsExactly("dueDate:INVALID_DATE");

        // the same charge for a whole class: a repeat cannot double-charge
        String all = "{\"classId\":" + p3Class + ",\"categoryId\":" + catMonthly + ",\"amount\":20000,\"dueDate\":\"2026-12-31\"}";
        JsonNode first = send("POST", "/api/v1/fees/charges/class", token4, all).json(json);
        assertThat(List.of(first.path("created").asInt(), first.path("skipped").asInt())).as("three students charged").containsExactly(3, 0);
        JsonNode repeat = send("POST", "/api/v1/fees/charges/class", token4, all).json(json);
        assertThat(List.of(repeat.path("created").asInt(), repeat.path("skipped").asInt())).as("a repeat charges nobody twice").containsExactly(0, 3);
        JsonNode later = send("POST", "/api/v1/fees/charges/class", token4, all.replace("2026-12-31", "2027-01-31")).json(json);
        assertThat(later.path("created").asInt()).as("another due date is another charge").isEqualTo(3);
        chargeB = chargeOf(ledger(pe2), "2026-12-31").path("id").asLong();

        // payments: a receipt number each, gap-free, and never more than what is owed
        int year = java.time.LocalDate.parse(TODAY).getYear();
        Resp p1 = send("POST", "/api/v1/fees/charges/" + chargeA + "/payments", token4, payBody(5000, TODAY, "CASH", null));
        assertThat(p1.status()).isEqualTo(201);
        long pay1 = p1.json(json).path("id").asLong();
        assertThat(p1.json(json).path("receiptNo").asString()).isEqualTo(String.format("R-%d-00001", year));
        JsonNode receipt1 = send("GET", "/api/v1/fees/payments/" + pay1 + "/receipt", token4, null).json(json);
        assertThat(receipt1.path("studentCode").asString()).isEqualTo(send("GET", "/api/v1/students/" + ps1, token4, null).json(json).path("student").path("studentCode").asString());
        assertThat(num(receipt1.path("amountDue"))).isEqualByComparingTo("15000");
        assertThat(num(receipt1.path("balanceAfter"))).as("what is still owed after this payment").isEqualByComparingTo("10000");
        assertThat(receipt1.path("categoryName").asString()).isEqualTo("ថ្លៃសិក្សា");
        Resp p2 = send("POST", "/api/v1/fees/charges/" + chargeA + "/payments", token4, payBody(10000, TODAY, "BANK", "ធនាគារ ១២៣"));
        long pay2 = p2.json(json).path("id").asLong();
        assertThat(p2.json(json).path("receiptNo").asString()).isEqualTo(String.format("R-%d-00002", year));
        assertThat(num(chargeOf(ledger(pe1), "2026-11-30").path("balance"))).isEqualByComparingTo("0");

        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges/" + chargeA + "/payments", token4, payBody(1, TODAY, "CASH", null)))).as("it is paid in full").containsExactly("amount:OVERPAYMENT");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges/" + chargeB + "/payments", token4, payBody(20000.5, TODAY, "CASH", null)))).as("riel have no decimals").containsExactly("amount:INVALID_NUMBER");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges/" + chargeB + "/payments", token4, payBody(0, TODAY, "CASH", null)))).containsExactly("amount:INVALID_NUMBER");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges/" + chargeB + "/payments", token4, payBody(100, java.time.LocalDate.parse(TODAY).plusDays(1).toString(), "CASH", null)))).containsExactly("paidOn:FUTURE_DATE");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges/" + chargeB + "/payments", token4, payBody(100, TODAY, "CHEQUE", null)))).containsExactly("method:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges/" + chargeB + "/payments", token4, payBody(100, "2026-13-45", "CASH", null)))).containsExactly("paidOn:INVALID_DATE");
        assertThat(jdbc.queryForObject("select count(*) from fee_payments", Integer.class)).as("refused payments stored nothing and burned no receipt number").isEqualTo(2);

        // a mistake is voided with a reason: the number stays on record, the balance comes back, and the number is not reused
        assertThat(fieldCodes(send("POST", "/api/v1/fees/payments/" + pay2 + "/void", token4, "{}"))).containsExactly("reason:REQUIRED");
        Resp voided = send("POST", "/api/v1/fees/payments/" + pay2 + "/void", token4, "{\"reason\":\"ព្រីនខុសចំនួនប្រាក់\"}");
        assertThat(voided.status()).isEqualTo(200);
        assertThat(voided.json(json).path("voided").asBoolean()).isTrue();
        assertThat(num(chargeOf(ledger(pe1), "2026-11-30").path("balance"))).as("the voided money is owed again").isEqualByComparingTo("10000");
        assertThat(code(send("POST", "/api/v1/fees/payments/" + pay2 + "/void", token4, "{\"reason\":\"ម្តងទៀត\"}"))).isEqualTo("ALREADY_VOIDED");
        Resp p3 = send("POST", "/api/v1/fees/charges/" + chargeA + "/payments", token4, payBody(10000, TODAY, "CASH", null));
        assertThat(p3.json(json).path("receiptNo").asString()).as("a voided receipt number is never reused").isEqualTo(String.format("R-%d-00003", year));
        assertThat(send("GET", "/api/v1/fees/payments/" + pay2 + "/receipt", token4, null).json(json).path("payment").path("voided").asBoolean()).as("the voided receipt can still be printed, marked void").isTrue();

        // changing and deleting charges
        JsonNode a = chargeOf(ledger(pe1), "2026-11-30");
        assertThat(a.path("payments").size()).as("all three payments are listed, one voided").isEqualTo(3);
        assertThat(fieldCodes(send("PUT", "/api/v1/fees/charges/" + chargeA, token4, "{\"amount\":14000,\"dueDate\":\"2026-11-30\",\"version\":" + a.path("version").asLong() + "}"))).as("below what was paid").containsExactly("amount:BELOW_PAID");
        Resp raised = send("PUT", "/api/v1/fees/charges/" + chargeA, token4, "{\"amount\":16000,\"dueDate\":\"2026-11-30\",\"note\":\"ខែវិច្ឆិកា\",\"version\":" + a.path("version").asLong() + "}");
        assertThat(raised.status()).isEqualTo(200);
        assertThat(num(raised.json(json).path("balance"))).isEqualByComparingTo("1000");
        assertThat(code(send("PUT", "/api/v1/fees/charges/" + chargeA, token4, "{\"amount\":16000,\"version\":" + a.path("version").asLong() + "}"))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");
        assertThat(code(send("DELETE", "/api/v1/fees/charges/" + chargeA, token4, null))).as("a charge with payments (even voided ones) is history").isEqualTo("FEE_HAS_PAYMENTS");
        long spare = chargeOf(ledger(pe3), "2027-01-31").path("id").asLong();
        assertThat(send("DELETE", "/api/v1/fees/charges/" + spare, token4, null).status()).as("nothing was paid on it").isEqualTo(204);
        assertThat(code(send("DELETE", "/api/v1/fees/charges/" + spare, token4, null))).isEqualTo("NOT_FOUND");

        // the class overview and the dashboard add up
        JsonNode summary = send("GET", "/api/v1/fees/class?classId=" + p3Class, token4, null).json(json);
        assertThat(summary.path("rows").size()).isEqualTo(3);
        java.util.Map<Long, JsonNode> byEnrollment = new java.util.HashMap<>();
        summary.path("rows").forEach(row -> byEnrollment.put(row.path("enrollmentId").asLong(), row.path("totals").get(0)));
        assertThat(num(byEnrollment.get(pe1).path("due"))).as("16000 + 20000 + 20000").isEqualByComparingTo("56000");
        assertThat(num(byEnrollment.get(pe1).path("paid"))).isEqualByComparingTo("15000");
        assertThat(num(byEnrollment.get(pe2).path("due"))).isEqualByComparingTo("40000");
        assertThat(num(byEnrollment.get(pe3).path("due"))).as("one of its charges was deleted").isEqualByComparingTo("20000");
        JsonNode total = summary.path("totals").get(0);
        assertThat(total.path("currency").asString()).isEqualTo("KHR");
        assertThat(num(total.path("due"))).isEqualByComparingTo("116000");
        assertThat(num(total.path("paid"))).isEqualByComparingTo("15000");
        assertThat(num(total.path("balance"))).isEqualByComparingTo("101000");
        JsonNode dash = send("GET", "/api/v1/dashboard", token4, null).json(json);
        assertThat(dash.path("fees").path("outstanding").get(0).path("currency").asString()).isEqualTo("KHR");
        assertThat(num(dash.path("fees").path("outstanding").get(0).path("balance"))).as("the dashboard shows the same still-due figure").isEqualByComparingTo("101000");
        JsonNode led = ledger(pe1);
        assertThat(led.path("enrollmentActive").asBoolean()).isTrue();
        assertThat(led.path("yearClosed").asBoolean()).isFalse();
        assertThat(led.path("totals").get(0).path("currency").asString()).isEqualTo("KHR");

        // the trail names the receipt, never a name, an amount's reason, or free text
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where summary like '%ព្រីនខុស%' or summary like '%ធនាគារ%' or summary like '%ខែវិច្ឆិកា%'", Integer.class)).as("free text stays in the record, not in the trail").isZero();
        assertThat(jdbc.queryForObject("select summary from audit_logs where action = 'PAYMENT_VOIDED'", String.class)).contains(String.format("R-%d-00002", year));
    }

    @Test @Order(51)
    void aClosedYearFreezesChargesButMoneyCanStillBePaidAndVoidedAndSwitchingFeesOffLosesNothing() throws Exception {
        assertThat(send("POST", "/api/v1/academic-years/" + p3Year + "/close", token4, null).status()).isEqualTo(200);
        assertThat(code(send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":" + pe1 + ",\"categoryId\":" + catMonthly + "}"))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("POST", "/api/v1/fees/charges/class", token4, "{\"classId\":" + p3Class + ",\"categoryId\":" + catMonthly + "}"))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        long spare = chargeOf(ledger(pe3), "2026-12-31").path("id").asLong();
        assertThat(code(send("DELETE", "/api/v1/fees/charges/" + spare, token4, null))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        JsonNode b = chargeOf(ledger(pe2), "2026-12-31");
        assertThat(code(send("PUT", "/api/v1/fees/charges/" + chargeB, token4, "{\"amount\":21000,\"version\":" + b.path("version").asLong() + "}"))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(ledger(pe2).path("yearClosed").asBoolean()).isTrue();

        // arrears can still be collected, and a mistake still voided
        Resp late = send("POST", "/api/v1/fees/charges/" + chargeB + "/payments", token4, payBody(1000, TODAY, "CASH", null));
        assertThat(late.status()).as("money owed does not vanish with the year").isEqualTo(201);
        assertThat(send("POST", "/api/v1/fees/payments/" + late.json(json).path("id").asLong() + "/void", token4, "{\"reason\":\"កត់ខុស\"}").status()).isEqualTo(200);
        assertThat(send("POST", "/api/v1/academic-years/" + p3Year + "/reopen", token4, null).status()).isEqualTo(200);

        // switching fees off hides everything and deletes nothing
        int payments = jdbc.queryForObject("select count(*) from fee_payments", Integer.class);
        assertThat(payments).isEqualTo(4);
        assertThat(jdbc.queryForObject("select count(*) from fee_payments where voided_at is not null", Integer.class)).isEqualTo(2);
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.enabled\":\"false\",\"fees.currencies\":\"KHR\"}").status()).isEqualTo(200);
        assertThat(code(send("GET", "/api/v1/fees/class?classId=" + p3Class, token4, null))).isEqualTo("FEES_DISABLED");
        assertThat(send("GET", "/api/v1/dashboard", token4, null).json(json).path("fees").isNull()).as("the dashboard drops the fee figures").isTrue();
        assertThat(jdbc.queryForObject("select count(*) from fee_payments", Integer.class)).isEqualTo(payments);
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.enabled\":\"true\"}").status()).isEqualTo(200);
        assertThat(ledger(pe1).path("charges").size()).as("everything is still there when fees are switched back on").isEqualTo(3);
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.enabled\":\"false\"}").status()).isEqualTo(200);
    }

    @Test @Order(52)
    void feesOwedByAStudentWhoChangedClassStayVisibleInTheOldClassAndTheDashboard() throws Exception {
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.enabled\":\"true\"}").status()).isEqualTo(200);
        long target = send("POST", "/api/v1/classes", token4, cls(p3Year, gradeIdOfLevel(1), "ឃ", null, null, null)).json(json).path("schoolClass").path("id").asLong();
        long ps4 = send("POST", "/api/v1/students", token4, studentBody("សិស្ស បួន", "FEMALE", "2019-01-04", null, p3Class, false)).json(json).path("student").path("id").asLong();
        long pe4 = enrollmentOf(ps4);
        assertThat(send("GET", "/api/v1/fees/class?classId=" + p3Class, token4, null).json(json).path("rows").size()).isEqualTo(4);

        // pe3 owes a charge; ps4 owes nothing. Both change class.
        assertThat(send("POST", "/api/v1/enrollments/" + pe3 + "/transfer", token4, "{\"classId\":" + target + "}").status()).isEqualTo(200);
        assertThat(send("POST", "/api/v1/enrollments/" + pe4 + "/transfer", token4, "{\"classId\":" + target + "}").status()).isEqualTo(200);

        JsonNode old = send("GET", "/api/v1/fees/class?classId=" + p3Class, token4, null).json(json);
        List<Long> oldRows = new ArrayList<>();
        old.path("rows").forEach(r -> oldRows.add(r.path("enrollmentId").asLong()));
        assertThat(oldRows).as("the old class still lists the student who owes money, and no longer the one who owes nothing").containsExactlyInAnyOrder(pe1, pe2, pe3);
        assertThat(num(old.path("totals").get(0).path("due"))).as("the class total did not lose pe3's charge").isEqualByComparingTo("116000");
        JsonNode moved = send("GET", "/api/v1/fees/class?classId=" + target, token4, null).json(json);
        assertThat(moved.path("rows").size()).as("the new class lists both students, neither owes anything there").isEqualTo(2);
        assertThat(moved.path("rows").get(0).path("totals").size()).isZero();

        // the old account can still be looked at and paid, and the dashboard still counts the debt
        JsonNode account = ledger(pe3);
        assertThat(account.path("enrollmentActive").asBoolean()).isFalse();
        long chargeId = chargeOf(account, "2026-12-31").path("id").asLong();
        assertThat(send("POST", "/api/v1/fees/charges/" + chargeId + "/payments", token4, payBody(1000, TODAY, "CASH", null)).status()).isEqualTo(201);
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":" + pe3 + ",\"categoryId\":" + catMonthly + "}"))).as("but nothing new is charged to a closed enrollment").containsExactly("enrollmentId:ENROLLMENT_NOT_ACTIVE");
        java.math.BigDecimal stillDue = num(send("GET", "/api/v1/dashboard", token4, null).json(json).path("fees").path("outstanding").get(0).path("balance"));
        JsonNode oldAfter = send("GET", "/api/v1/fees/class?classId=" + p3Class, token4, null).json(json);
        assertThat(stillDue).as("the dashboard and the class overview agree").isEqualByComparingTo(num(oldAfter.path("totals").get(0).path("balance")));
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.enabled\":\"false\"}").status()).isEqualTo(200);
    }

    // ---- Phase 5: backups, restore staging, the audit viewer, the reminder ------------------------------------------

    static String backup1, backup2;

    static JsonNode healthCheck(JsonNode report, String id) {
        for (JsonNode c : report.path("checks")) if (c.path("id").asString().equals(id)) return c;
        throw new AssertionError("no health check " + id);
    }

    JsonNode backups(String token) throws Exception {
        Resp r = send("GET", "/api/v1/backups", token, null);
        assertThat(r.status()).as(r.body()).isEqualTo(200);
        return r.json(json);
    }

    long countRows(String table) { return jdbc.queryForObject("select count(*) from " + table, Long.class); }

    static long countIn(Connection c, String table) throws Exception {
        try (var st = c.createStatement(); var rs = st.executeQuery("select count(*) from " + table)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    @Test @Order(53)
    void aBackupIsMadeAndReadBackFromTheOutsideAndTheLastGoodOneCannotBeDeleted() throws Exception {
        JsonNode none = backups(token4);
        assertThat(none.path("backups").size()).isZero();
        assertThat(none.path("reminderDays").asInt()).as("the school's own setting, read from the preferences")
                .isEqualTo(Integer.parseInt(send("GET", "/api/v1/settings/app", token4, null).json(json).path("backup.reminderDays").asString()));
        assertThat(none.path("externalOverdue").asBoolean()).as("no backup yet, nothing to nag about").isFalse();
        assertThat(none.path("localState").asString()).as("no good backup at all: the dashboard and the backup page warn").isEqualTo("NONE");
        assertThat(none.path("localAgeHours").isNull()).isTrue();
        assertThat(none.path("autoDue").asBoolean()).as("one will be made when the program closes").isTrue();
        JsonNode noneHealth = healthCheck(send("GET", "/api/v1/system/health", token4, null).json(json), "BACKUP_AGE");
        assertThat(noneHealth.path("status").asString()).isEqualTo("WARN");
        assertThat(noneHealth.path("code").asString()).isEqualTo("NO_SUCCESSFUL_BACKUP");
        assertThat(none.path("staged").isNull()).isTrue();
        assertThat(none.path("lastRestore").isNull()).isTrue();
        assertThat(none.path("neededMb").asLong()).as("the space estimate includes a margin").isGreaterThanOrEqualTo(64);

        Resp made = send("POST", "/api/v1/backups", token4, null);
        assertThat(made.status()).as(made.body()).isEqualTo(201);
        JsonNode b = made.json(json);
        backup1 = b.path("id").asString();
        assertThat(backup1).matches("SchoolBackup_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}");
        assertThat(b.path("kind").asString()).isEqualTo("MANUAL");
        assertThat(b.path("verifiedAt").isNull()).as("verified right after it was made").isFalse();
        assertThat(b.path("schemaVersion").asInt()).isEqualTo(Integer.parseInt(latestMigrationVersion()));
        Path zip = DataDirs.backups().resolve(backup1 + ".zip");
        assertThat(zip).isRegularFile();
        assertThat(b.path("sizeBytes").asLong()).isEqualTo(Files.size(zip));
        assertThat(DataDirs.config().resolve("backup-history.json")).as("the history is a file, not a table").isRegularFile();

        // read the zip as a stranger would: the manifest, every photo, and a database holding the school's rows
        try (ZipFile z = new ZipFile(zip.toFile())) {
            List<String> names = new ArrayList<>();
            z.entries().asIterator().forEachRemaining(e -> names.add(e.getName()));
            assertThat(names).contains("manifest.json", "school.db");
            JsonNode manifest = json.readTree(new String(z.getInputStream(z.getEntry("manifest.json")).readAllBytes(), StandardCharsets.UTF_8));
            assertThat(manifest.path("app").asString()).isEqualTo("sms-offline");
            assertThat(manifest.path("schemaVersion").asInt()).isEqualTo(Integer.parseInt(latestMigrationVersion()));
            for (String p : list(DataDirs.studentUploads())) assertThat(names).contains("uploads/students/" + p);
            for (String p : list(DataDirs.schoolUploads())) assertThat(names).contains("uploads/school/" + p);
            Path copy = Files.createTempFile(DATA_ROOT, "snapshot", ".db");   // inside the Khmer-named folder
            try {
                Files.copy(z.getInputStream(z.getEntry("school.db")), copy, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + copy.toString().replace('\\', '/'))) {
                    for (String t : List.of("students", "teachers", "classes", "enrollments", "examinations", "student_scores", "fee_payments", "app_users")) {
                        assertThat(countIn(c, t)).as("rows of " + t + " in the backup").isEqualTo(countRows(t));
                    }
                }
            } finally {
                Files.deleteIfExists(copy);
            }
        }

        assertThat(backups(token4).path("autoDue").asBoolean()).as("a backup was just made").isFalse();
        assertThat(backups(token4).path("localState").asString()).as("a good backup less than 24 hours old").isEqualTo("OK");
        assertThat(backups(token4).path("localAgeHours").asLong()).isZero();
        JsonNode localOk = healthCheck(send("GET", "/api/v1/system/health", token4, null).json(json), "BACKUP_AGE");
        assertThat(localOk.path("status").asString()).as("the backups on this laptop are what the dashboard shows").isEqualTo("OK");
        assertThat(localOk.path("params").path("hours").asLong()).isZero();
        JsonNode never = healthCheck(send("GET", "/api/v1/system/health", token4, null).json(json), "EXTERNAL_COPY");
        assertThat(never.path("code").asString()).as("backups exist but none has been copied elsewhere yet; a USB copy is optional, so too early to nag").isEqualTo("EXTERNAL_COPY_NEVER");
        assertThat(never.path("status").asString()).isEqualTo("INFO");
        assertThat(send("POST", "/api/v1/backups/" + backup1 + "/verify", token4, null).json(json).path("verifiedAt").isNull()).isFalse();
        assertThat(send("DELETE", "/api/v1/backups/" + backup1, token4, null).status()).isEqualTo(409);
        assertThat(code(send("DELETE", "/api/v1/backups/" + backup1, token4, null))).as("the only good backup").isEqualTo("BACKUP_LAST_VERIFIED");

        CLOCK.advance(Duration.ofMinutes(2));
        backup2 = send("POST", "/api/v1/backups", token4, null).json(json).path("id").asString();
        assertThat(backup2).isNotEqualTo(backup1);
        assertThat(send("DELETE", "/api/v1/backups/" + backup1, token4, null).status()).as("an older one may go").isEqualTo(204);
        assertThat(zip).doesNotExist();
        assertThat(code(send("DELETE", "/api/v1/backups/" + backup2, token4, null))).isEqualTo("BACKUP_LAST_VERIFIED");
        assertThat(backups(token4).path("backups").size()).isEqualTo(1);

        // an id that is not a backup id never reaches the file system
        assertThat(code(send("POST", "/api/v1/backups/SchoolBackup_2000-01-01_00-00-00/verify", token4, null))).isEqualTo("BACKUP_NOT_FOUND");
        assertThat(send("POST", "/api/v1/backups/..%2F..%2Fdatabase%2Fschool/verify", token4, null).status()).isIn(400, 404);
        assertThat(send("DELETE", "/api/v1/backups/config", token4, null).status()).isEqualTo(404);
        assertThat(DataDirs.config()).isDirectory();

        // a copy on a USB stick is recorded only with the right hash
        Path z2 = DataDirs.backups().resolve(backup2 + ".zip");
        String sha = BackupArchive.sha256(z2);
        assertThat(code(send("POST", "/api/v1/backups/" + backup2 + "/external-copy", token4, j("sha256", "0".repeat(64))))).isEqualTo("BACKUP_COPY_MISMATCH");
        assertThat(send("POST", "/api/v1/backups/" + backup2 + "/external-copy", token4, j("sha256", "abc")).status()).isEqualTo(422);
        assertThat(backups(token4).path("lastExternalCopyAt").isNull()).as("a wrong hash records nothing").isTrue();
        Resp copied = send("POST", "/api/v1/backups/" + backup2 + "/external-copy", token4, j("sha256", sha));
        assertThat(copied.status()).as(copied.body()).isEqualTo(200);
        assertThat(copied.json(json).path("externalCopyAt").isNull()).isFalse();
        JsonNode over = backups(token4);
        assertThat(over.path("lastExternalCopyAt").isNull()).isFalse();
        assertThat(over.path("externalOverdue").asBoolean()).isFalse();

        // the health page knows about backups: age, room, and (deep) that the newest one really opens
        JsonNode quick = send("GET", "/api/v1/system/health", token4, null).json(json);
        assertThat(healthCheck(quick, "BACKUP_AGE").path("status").asString()).isEqualTo("OK");
        assertThat(healthCheck(quick, "EXTERNAL_COPY").path("status").asString()).as("a proved copy elsewhere").isEqualTo("OK");
        assertThat(healthCheck(quick, "BACKUP_SPACE").path("status").asString()).isEqualTo("OK");
        JsonNode deep = send("POST", "/api/v1/system/health/deep", token4, null).json(json);
        assertThat(healthCheck(deep, "BACKUP_VERIFY").path("status").asString()).isEqualTo("OK");
        assertThat(code(send("GET", "/api/v1/backups", null, null))).as("a session is needed").isEqualTo("UNAUTHENTICATED");
    }

    @Test @Order(54)
    void aBackupIsStagedCheckedConfirmedAndCancelledWhileTheSwapItselfWaitsForTheNextStart() throws Exception {
        Path incoming = DataDirs.backups().resolve("incoming");
        String stage = "/api/v1/backups/restore/stage";
        for (String name : List.of("incoming-1.zip", "../school.zip", "x.zip", "incoming-1.zip.exe", "incoming-.zip")) {
            assertThat(code(send("POST", stage, token4, j("fileName", name)))).as(name).isEqualTo("BACKUP_NOT_FOUND");
        }
        assertThat(send("POST", stage, token4, j("fileName", "")).status()).isEqualTo(422);

        Files.writeString(incoming.resolve("incoming-111.zip"), "garbage", StandardCharsets.UTF_8);
        Resp damaged = send("POST", stage, token4, j("fileName", "incoming-111.zip"));
        assertThat(damaged.status()).isEqualTo(422);
        assertThat(code(damaged)).isEqualTo("BACKUP_CORRUPT");
        assertThat(incoming.resolve("incoming-111.zip")).as("the incoming copy is always removed").doesNotExist();
        assertThat(send("GET", "/api/v1/backups/restore", token4, null).json(json).path("staged").isNull()).isTrue();

        Path good = DataDirs.backups().resolve(backup2 + ".zip");
        int newer = Integer.parseInt(latestMigrationVersion()) + 1;
        BackupFixture.craft(good, incoming.resolve("incoming-222.zip"), e -> {
            try {
                e.put("school.db", BackupFixture.databaseWithMigration(e.get("school.db"), newer, DATA_ROOT));
            } catch (Exception ex) { throw new IllegalStateException(ex); }
            BackupFixture.fixManifest(e, newer);
        });
        Resp tooNew = send("POST", stage, token4, j("fileName", "incoming-222.zip"));
        assertThat(tooNew.status()).isEqualTo(422);
        assertThat(code(tooNew)).as("made by a newer program").isEqualTo("BACKUP_SCHEMA_NEWER");
        assertThat(DataDirs.backups().resolve("restore-pending")).doesNotExist();

        // a backup that is already listed (a safety backup, an automatic one) can be staged without a file dialog; nothing is copied or removed
        Resp byId = send("POST", stage, token4, j("backupId", backup2));
        assertThat(byId.status()).as(byId.body()).isEqualTo(200);
        assertThat(byId.json(json).path("state").asString()).isEqualTo("STAGED");
        assertThat(good).isRegularFile();
        assertThat(code(send("POST", stage, token4, j("backupId", "SchoolBackup_2000-01-01_00-00-00")))).isEqualTo("BACKUP_NOT_FOUND");
        assertThat(fieldCodes(send("POST", stage, token4, "{\"fileName\":\"incoming-1.zip\",\"backupId\":\"" + backup2 + "\"}"))).as("exactly one of the two").containsExactly("backupId:INVALID");

        Files.copy(good, incoming.resolve("incoming-333.zip"));
        Resp staged = send("POST", stage, token4, j("fileName", "incoming-333.zip"));
        assertThat(staged.status()).as(staged.body()).isEqualTo(200);
        JsonNode s = staged.json(json);
        assertThat(s.path("state").asString()).isEqualTo("STAGED");
        assertThat(s.path("students").asLong()).isEqualTo(countRows("students"));
        assertThat(s.path("teachers").asLong()).isEqualTo(countRows("teachers"));
        assertThat(s.path("classes").asLong()).isEqualTo(countRows("classes"));
        assertThat(s.path("schemaVersion").asInt()).isEqualTo(Integer.parseInt(latestMigrationVersion()));
        assertThat(DataDirs.backups().resolve("restore-pending/school.db")).isRegularFile();
        assertThat(incoming.resolve("incoming-333.zip")).doesNotExist();
        assertThat(send("GET", "/api/v1/backups/restore", token4, null).json(json).path("staged").path("state").asString()).isEqualTo("STAGED");
        assertThat(backups(token4).path("staged").path("state").asString()).isEqualTo("STAGED");

        Resp applied = send("POST", "/api/v1/backups/restore/apply", token4, null);
        assertThat(applied.status()).as(applied.body()).isEqualTo(200);
        assertThat(applied.json(json).path("state").asString()).isEqualTo("CONFIRMED");
        assertThat(Files.readString(DataDirs.backups().resolve("restore-pending/restore.json"), StandardCharsets.UTF_8)).contains("CONFIRMED");
        assertThat(DataDirs.database()).as("the swap happens at the next start, before the database opens: nothing was replaced under the open pool").isRegularFile();
        assertThat(countRows("students")).isEqualTo(s.path("students").asLong());

        assertThat(send("DELETE", "/api/v1/backups/restore", token4, null).status()).isEqualTo(204);
        assertThat(DataDirs.backups().resolve("restore-pending")).doesNotExist();
        assertThat(send("GET", "/api/v1/backups/restore", token4, null).json(json).path("staged").isNull()).isTrue();
        assertThat(code(send("POST", "/api/v1/backups/restore/apply", token4, null))).isEqualTo("RESTORE_NOTHING_STAGED");

        // once an account exists, the restore endpoints need a session like everything else
        assertThat(code(send("GET", "/api/v1/backups/restore", null, null))).isEqualTo("UNAUTHENTICATED");
        assertThat(code(send("POST", stage, null, j("fileName", "incoming-1.zip")))).isEqualTo("UNAUTHENTICATED");
        assertThat(code(send("POST", "/api/v1/backups/restore/apply", null, null))).isEqualTo("UNAUTHENTICATED");
        assertThat(code(send("DELETE", "/api/v1/backups/restore", null, null))).isEqualTo("UNAUTHENTICATED");

        assertThat(jdbc.queryForList("select action from audit_logs where action like 'RESTORE_%' order by id", String.class))
                .containsExactly("RESTORE_STAGED", "RESTORE_STAGED", "RESTORE_REQUESTED", "RESTORE_CANCELLED");
    }

    @Test @Order(55)
    void theAuditTrailCanBeReadFilteredAndPagedAndNeverChanged() throws Exception {
        JsonNode page = send("GET", "/api/v1/audit?limit=5", token4, null).json(json);
        assertThat(page.path("rows").size()).isEqualTo(5);
        assertThat(page.path("hasMore").asBoolean()).isTrue();
        assertThat(page.path("rows").get(0).path("action").asString()).as("newest first").isEqualTo("RESTORE_CANCELLED");
        List<Long> ids = new ArrayList<>();
        page.path("rows").forEach(r -> ids.add(r.path("id").asLong()));
        assertThat(ids).isSortedAccordingTo(Comparator.reverseOrder()).doesNotHaveDuplicates();

        // walking the whole trail page by page visits every row exactly once
        long total = countRows("audit_logs");
        List<Long> walked = new ArrayList<>();
        Long before = null;
        boolean more = true;
        while (more) {
            JsonNode p = send("GET", "/api/v1/audit?limit=17" + (before == null ? "" : "&beforeId=" + before), token4, null).json(json);
            p.path("rows").forEach(r -> walked.add(r.path("id").asLong()));
            before = walked.get(walked.size() - 1);
            more = p.path("hasMore").asBoolean();
        }
        assertThat(walked).hasSize((int) total).doesNotHaveDuplicates();

        JsonNode byAction = send("GET", "/api/v1/audit?action=BACKUP_CREATED&limit=200", token4, null).json(json);
        assertThat(byAction.path("rows").size()).isEqualTo(2);
        byAction.path("rows").forEach(r -> assertThat(r.path("action").asString()).isEqualTo("BACKUP_CREATED"));
        JsonNode mine = send("GET", "/api/v1/audit?actor=admin.sokha&limit=200", token4, null).json(json);
        assertThat(mine.path("rows").size()).isPositive();
        mine.path("rows").forEach(r -> assertThat(r.path("actor").asString()).isEqualTo("admin.sokha"));
        assertThat(send("GET", "/api/v1/audit?actor=nobody", token4, null).json(json).path("rows").size()).isZero();
        JsonNode byType = send("GET", "/api/v1/audit?entityType=backup&limit=200", token4, null).json(json);
        assertThat(byType.path("rows").size()).isGreaterThanOrEqualTo(7);
        byType.path("rows").forEach(r -> assertThat(r.path("entityType").asString()).isEqualTo("backup"));

        // days are days on this PC's calendar, both ends included
        java.time.LocalDate day = Instant.parse(page.path("rows").get(0).path("at").asString()).atZone(java.time.ZoneId.systemDefault()).toLocalDate();
        JsonNode today = send("GET", "/api/v1/audit?from=" + day + "&to=" + day + "&limit=200", token4, null).json(json);
        assertThat(today.path("rows").size()).isPositive();
        today.path("rows").forEach(r -> assertThat(Instant.parse(r.path("at").asString()).atZone(java.time.ZoneId.systemDefault()).toLocalDate()).isEqualTo(day));
        assertThat(send("GET", "/api/v1/audit?from=" + day.plusDays(1), token4, null).json(json).path("rows").size()).as("nothing after today").isZero();
        assertThat(send("GET", "/api/v1/audit?to=" + day.minusDays(1) + "&limit=200", token4, null).json(json).path("rows").size())
                .as("rows of earlier days only, here none unless the run crossed midnight").isLessThan((int) total);
        assertThat(fieldCodes(send("GET", "/api/v1/audit?from=not-a-date", token4, null))).containsExactly("from:INVALID_DATE");
        assertThat(send("GET", "/api/v1/audit?limit=0", token4, null).json(json).path("rows").size()).isEqualTo(1);
        assertThat(send("GET", "/api/v1/audit?limit=100000", token4, null).json(json).path("rows").size()).isLessThanOrEqualTo(200);

        JsonNode filters = send("GET", "/api/v1/audit/filters", token4, null).json(json);
        assertThat(filters.path("actions").toString()).contains("BACKUP_CREATED", "RESTORE_STAGED", "STUDENT_CREATED");
        assertThat(filters.path("actors").toString()).contains("admin.sokha");
        assertThat(filters.path("entityTypes").toString()).contains("backup", "student");

        // read only: nothing here changes or deletes a row
        for (String method : List.of("POST", "PUT", "DELETE", "PATCH")) {   // (the container's rejection comes back as 401 here: the /error dispatch is not authenticated, as for any other 405)
            assertThat(send(method, "/api/v1/audit", token4, "{}").status()).as(method).isIn(401, 403, 405);
        }
        assertThat(send("DELETE", "/api/v1/audit/1", token4, null).status()).isIn(401, 404, 405);
        assertThat(countRows("audit_logs")).as("not one row was added, changed or removed by any of that").isEqualTo(total);
    }

    @Test @Order(56)
    void theAcceptanceListShipsPendingAndOnlyTheAdministratorSignsAnItemOffAndCanTakeItBack() throws Exception {
        JsonNode list = send("GET", "/api/v1/acceptance", token4, null).json(json);
        assertThat(list.size()).isEqualTo(13);
        List<String> ids = new ArrayList<>();
        list.forEach(i -> ids.add(i.path("id").asString()));
        assertThat(ids).contains("attendance-sessions", "attendance-counting", "timetable-slots", "grading-rules", "report-card-template", "fee-currency", "national-header", "khmer-wording",
                "usb-backup", "windows-compatibility", "clean-pc-install", "physical-printing", "other-real-world-checks");
        list.forEach(i -> {
            assertThat(i.path("signOff").isNull()).as(i.path("id").asString() + " ships unsigned: no build can accept anything for the school").isTrue();
            assertThat(i.path("pending").asString()).isIn("CONFIGURATION", "OFFICIAL_INFORMATION", "PHYSICAL_TESTING");
            assertThat(i.path("development").asString()).isIn("COMPLETED", "IN_PROGRESS");
        });
        Map<String, String> pending = new HashMap<>();
        list.forEach(i -> pending.put(i.path("id").asString(), i.path("pending").asString()));
        assertThat(pending).containsEntry("grading-rules", "OFFICIAL_INFORMATION").containsEntry("national-header", "OFFICIAL_INFORMATION")
                .containsEntry("fee-currency", "CONFIGURATION").containsEntry("attendance-sessions", "CONFIGURATION").containsEntry("timetable-slots", "CONFIGURATION")
                .containsEntry("usb-backup", "PHYSICAL_TESTING").containsEntry("physical-printing", "PHYSICAL_TESTING");

        assertThat(send("POST", "/api/v1/acceptance/no-such-item/sign-off", token4, "{}").status()).isEqualTo(404);
        for (JsonNode i : list) {
            if (!i.path("development").asString().equals("COMPLETED")) {
                assertThat(code(send("POST", "/api/v1/acceptance/" + i.path("id").asString() + "/sign-off", token4, "{}"))).as("something not finished cannot be accepted").isEqualTo("NOT_READY_FOR_SIGN_OFF");
            }
        }
        assertThat(send("POST", "/api/v1/acceptance/usb-backup/sign-off", null, "{}").status()).isEqualTo(401);
        assertThat(fieldCodes(send("POST", "/api/v1/acceptance/usb-backup/sign-off", token4, j("note", "x".repeat(301))))).containsExactly("note:Size");

        Resp signed = send("POST", "/api/v1/acceptance/usb-backup/sign-off", token4, j("note", "tried with the school's own stick"));
        assertThat(signed.status()).as(signed.body()).isEqualTo(200);
        assertThat(signed.json(json).path("signOff").path("signedBy").asString()).as("the administrator's display name").isEqualTo(jdbc.queryForObject("select display_name from app_users", String.class));
        assertThat(signed.json(json).path("signOff").path("note").asString()).isEqualTo("tried with the school's own stick");
        assertThat(code(send("POST", "/api/v1/acceptance/usb-backup/sign-off", token4, "{}"))).isEqualTo("ALREADY_SIGNED_OFF");
        long signedCount = 0;
        for (JsonNode i : send("GET", "/api/v1/acceptance", token4, null).json(json)) if (!i.path("signOff").isNull()) signedCount++;
        assertThat(signedCount).as("only the one item the administrator signed").isEqualTo(1);

        assertThat(send("DELETE", "/api/v1/acceptance/usb-backup/sign-off", token4, null).status()).isEqualTo(204);
        assertThat(send("DELETE", "/api/v1/acceptance/usb-backup/sign-off", token4, null).status()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select count(*) from acceptance_signoffs", Integer.class)).isZero();
        assertThat(jdbc.queryForList("select action from audit_logs where action like 'ACCEPTANCE_%' order by id", String.class))
                .containsExactly("ACCEPTANCE_SIGNED_OFF", "ACCEPTANCE_WITHDRAWN");
        assertThat(send("GET", "/api/v1/system/info", token4, null).json(json).path("product").path("shortName").asString()).isEqualTo("KPSMS");
    }

    // ---- attendance sessions (the school's timetable changes, so the sessions are data) ---------------------------------

    String periodJson(Long yearId, String name, String start, String end, Long version) throws Exception {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        if (yearId != null) m.put("academicYearId", yearId);
        m.put("nameKm", name);
        m.put("startTime", start);
        m.put("endTime", end);
        if (version != null) m.put("version", version);
        return json.writeValueAsString(m);
    }

    JsonNode periodList(long yearId) throws Exception { return send("GET", "/api/v1/attendance-periods?academicYearId=" + yearId, token4, null).json(json); }

    JsonNode periodNode(long yearId, long id) throws Exception {
        for (JsonNode p : periodList(yearId)) if (p.path("id").asLong() == id) return p;
        throw new AssertionError("session " + id + " is not in the list of year " + yearId);
    }

    Resp switchPeriod(long yearId, long id, boolean enabled) throws Exception {
        return send("PUT", "/api/v1/attendance-periods/" + id + "/enabled", token4, json.writeValueAsString(Map.of("enabled", enabled, "version", periodNode(yearId, id).path("version").asLong())));
    }

    @Test @Order(57)
    void attendanceSessionsAreKeptPerYearEditedSwitchedOffAndNeverRewriteTheHistory() throws Exception {
        String api = "/api/v1/attendance-periods";
        assertThat(send("GET", api + "?academicYearId=" + p3Year, null, null).status()).isEqualTo(401);
        assertThat(fieldCodes(send("GET", api + "?academicYearId=999999", token4, null))).containsExactly("academicYearId:INVALID");
        assertThat(periodList(p3Year).size()).as("the whole day and the one made while taking attendance").isEqualTo(2);

        // making one: a name and optional times (both or neither, HH:mm, the end after the start); nothing is checked against the clock or the other sessions
        assertThat(fieldCodes(send("POST", api, token4, periodJson(p3Year, "   ", null, null, null)))).containsExactly("nameKm:NotBlank");
        assertThat(fieldCodes(send("POST", api, token4, periodJson(p3Year, "ពេលរសៀល", "25:00", "17:00", null)))).containsExactly("startTime:INVALID_TIME");
        assertThat(fieldCodes(send("POST", api, token4, periodJson(p3Year, "ពេលរសៀល", "13:00", null, null)))).as("one time without the other").containsExactly("endTime:REQUIRED");
        assertThat(fieldCodes(send("POST", api, token4, periodJson(p3Year, "ពេលរសៀល", "17:00", "13:00", null)))).containsExactly("endTime:END_TIME_BEFORE_START");
        assertThat(fieldCodes(send("POST", api, token4, periodJson(p3Year, "ពេលព្រឹក", null, null, null)))).as("a name is used once in a year").containsExactly("nameKm:DUPLICATE");
        assertThat(fieldCodes(send("POST", api, token4, periodJson(999999L, "ក", null, null, null)))).containsExactly("academicYearId:INVALID");
        assertThat(periodList(p3Year).size()).as("the refused ones stored nothing").isEqualTo(2);
        Resp special = send("POST", api, token4, periodJson(p3Year, "ថ្នាក់បន្ថែម", null, null, null));
        assertThat(special.status()).as("a session needs no times at all").isEqualTo(201);
        assertThat(special.json(json).path("startTime").isNull()).isTrue();
        long p3Special = special.json(json).path("id").asLong();
        Resp afternoon = send("POST", api, token4, periodJson(p3Year, "ពេលរសៀល", "13:00", "17:00", null));
        assertThat(afternoon.status()).isEqualTo(201);
        long p3Afternoon = afternoon.json(json).path("id").asLong();
        assertThat(afternoon.json(json).path("confirmedAt").isNull()).as("an example time is not the school's timetable until the administrator confirms it").isTrue();
        assertThat(afternoon.json(json).path("enabled").asBoolean()).isTrue();
        List<Long> order = new ArrayList<>();
        periodList(p3Year).forEach(p -> order.add(p.path("id").asLong()));
        assertThat(order).as("in the order they were made").containsExactly(p3Whole, p3Morning, p3Special, p3Afternoon);

        // editing: confirm, then change; the change takes the confirmation back; a stale version is refused; overlapping times are the school's business
        long v = periodNode(p3Year, p3Morning).path("version").asLong();
        Resp conf = send("POST", api + "/" + p3Morning + "/confirm", token4, null);
        assertThat(conf.status()).isEqualTo(200);
        assertThat(conf.json(json).path("confirmedBy").asString()).isEqualTo(jdbc.queryForObject("select display_name from app_users", String.class));
        assertThat(conf.json(json).path("confirmedAt").isNull()).isFalse();
        assertThat(code(send("PUT", api + "/" + p3Morning, token4, periodJson(null, "ព្រឹក", "07:30", "13:30", v)))).as("the version from before the confirmation").isEqualTo("OPTIMISTIC_LOCK");
        Resp edited = send("PUT", api + "/" + p3Morning, token4, periodJson(null, "ព្រឹក", "07:30", "13:30", v + 1));
        assertThat(edited.status()).as(edited.body()).isEqualTo(200);
        assertThat(edited.json(json).path("nameKm").asString()).isEqualTo("ព្រឹក");
        assertThat(edited.json(json).path("confirmedAt").isNull()).as("a changed schedule is not confirmed any more").isTrue();
        assertThat(edited.json(json).path("sheets").asInt()).isEqualTo(1);
        assertThat(fieldCodes(send("PUT", api + "/" + p3Morning, token4, periodJson(null, "ពេលរសៀល", "07:30", "13:30", v + 2)))).as("renamed onto another session of the year").containsExactly("nameKm:DUPLICATE");

        // history is preserved: the sheet taken before the edit keeps the name and times it was saved with; a new day shows the new ones
        JsonNode old = send("GET", "/api/v1/attendance/sheet?classId=" + p3Class + "&date=" + TODAY + "&periodId=" + p3Morning, token4, null).json(json);
        assertThat(old.path("period").path("nameKm").asString()).isEqualTo("ពេលព្រឹក");
        assertThat(old.path("period").path("startTime").asString()).isEqualTo("07:00");
        assertThat(old.path("period").path("endTime").asString()).isEqualTo("11:00");
        String yesterday = java.time.LocalDate.now(CLOCK).minusDays(1).toString();
        JsonNode fresh = send("GET", "/api/v1/attendance/sheet?classId=" + p3Class + "&date=" + yesterday + "&periodId=" + p3Morning, token4, null).json(json);
        assertThat(fresh.path("period").path("nameKm").asString()).isEqualTo("ព្រឹក");
        assertThat(fresh.path("period").path("startTime").asString()).isEqualTo("07:30");
        assertThat(jdbc.queryForObject("select period_name_km from attendance_sessions where class_id = ? and period_id = ?", String.class, p3Class, p3Morning)).isEqualTo("ពេលព្រឹក");
        assertThat(send("GET", "/api/v1/students/" + ps1 + "/attendance?from=2026-01-01&to=2099-12-31", token4, null).json(json).toString()).as("the student's history says what the session was called then").contains("ពេលព្រឹក");

        // switched off: no NEW sheets, but the sheets already taken stay readable and correctable; the last enabled one cannot be switched off
        assertThat(switchPeriod(p3Year, p3Afternoon, false).status()).isEqualTo(200);
        assertThat(code(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, p3Afternoon, null, pe1, "PRESENT", null)))).isEqualTo("ATTENDANCE_PERIOD_DISABLED");
        assertThat(switchPeriod(p3Year, p3Morning, false).status()).isEqualTo(200);
        assertThat(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, p3Morning, null, pe1, "LATE", null, pe2, "LEAVE", null)).status()).as("an existing sheet of a switched-off session can still be corrected").isEqualTo(200);
        assertThat(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, p3Morning, null, pe1, "ABSENT", null, pe2, "LEAVE", null)).status()).isEqualTo(200);
        assertThat(switchPeriod(p3Year, p3Whole, false).status()).isEqualTo(200);
        assertThat(code(switchPeriod(p3Year, p3Special, false))).as("attendance must always have a session to take").isEqualTo("LAST_ENABLED_PERIOD");
        assertThat(send("GET", "/api/v1/attendance/sheet?classId=" + p3Class + "&date=" + TODAY, token4, null).json(json).path("period").path("id").asLong())
                .as("with no session chosen: the first one still switched on").isEqualTo(p3Special);
        assertThat(switchPeriod(p3Year, p3Whole, true).status()).isEqualTo(200);
        assertThat(switchPeriod(p3Year, p3Morning, true).status()).isEqualTo(200);

        // deleting: only a session no sheet has used (a used one is switched off instead)
        assertThat(code(send("DELETE", api + "/" + p3Morning, token4, null))).isEqualTo("ATTENDANCE_PERIOD_IN_USE");
        assertThat(send("DELETE", api + "/" + p3Afternoon, token4, null).status()).isEqualTo(204);
        assertThat(send("DELETE", api + "/" + p3Afternoon, token4, null).status()).isEqualTo(404);

        // the order of the day
        assertThat(fieldCodes(send("PUT", api + "/order", token4, json.writeValueAsString(Map.of("academicYearId", p3Year, "ids", List.of(p3Whole, p3Morning)))))).as("the whole list is needed").containsExactly("ids:INVALID");
        Resp reversed = send("PUT", api + "/order", token4, json.writeValueAsString(Map.of("academicYearId", p3Year, "ids", List.of(p3Special, p3Morning, p3Whole))));
        assertThat(reversed.status()).isEqualTo(200);
        assertThat(reversed.json(json).get(0).path("id").asLong()).isEqualTo(p3Special);
        assertThat(send("GET", "/api/v1/attendance/sheet?classId=" + p3Class + "&date=" + yesterday, token4, null).json(json).path("period").path("id").asLong()).isEqualTo(p3Special);
        assertThat(send("PUT", api + "/order", token4, json.writeValueAsString(Map.of("academicYearId", p3Year, "ids", List.of(p3Whole, p3Morning, p3Special)))).status()).isEqualTo(200);

        // another year: it starts with its own whole-day session and can take over this year's (they start unconfirmed); copying twice adds nothing
        long other = yearId("២០២៧-២០២៨");
        assertThat(periodList(other).size()).isEqualTo(1);
        assertThat(periodList(other).get(0).path("nameKm").asString()).isEqualTo(AttendancePeriodService.DEFAULT_NAME);
        assertThat(periodList(other).get(0).path("id").asLong()).as("a different row from the other year's").isNotEqualTo(p3Whole);
        assertThat(fieldCodes(send("POST", api + "/copy", token4, json.writeValueAsString(Map.of("fromYearId", other, "toYearId", other))))).containsExactly("fromYearId:INVALID");
        JsonNode copied = send("POST", api + "/copy", token4, json.writeValueAsString(Map.of("fromYearId", p3Year, "toYearId", other))).json(json);
        assertThat(copied.size()).as("the whole day was already there; the other two came over").isEqualTo(3);
        copied.forEach(p -> assertThat(p.path("confirmedAt").isNull()).isTrue());
        assertThat(copied.get(1).path("startTime").asString()).isEqualTo("07:30");
        assertThat(send("POST", api + "/copy", token4, json.writeValueAsString(Map.of("fromYearId", p3Year, "toYearId", other))).json(json).size()).isEqualTo(3);

        // a closed year freezes its sessions
        assertThat(send("POST", "/api/v1/academic-years/" + other + "/close", token4, null).status()).isEqualTo(200);
        assertThat(code(send("POST", api, token4, periodJson(other, "ក្នុងឆ្នាំបិទ", null, null, null)))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(code(send("DELETE", api + "/" + periodList(other).get(2).path("id").asLong(), token4, null))).isEqualTo("ACADEMIC_YEAR_CLOSED");
        assertThat(send("POST", "/api/v1/academic-years/" + other + "/reopen", token4, null).status()).isEqualTo(200);

        // one student, one day, one session: even when they changed class in between
        long ps5 = send("POST", "/api/v1/students", token4, studentBody("សិស្ស ប្រាំ", "FEMALE", "2019-01-05", null, p3Class, false)).json(json).path("student").path("id").asLong();
        long pe5 = enrollmentOf(ps5);
        assertThat(send("PUT", "/api/v1/attendance/sheet", token4, att(TODAY, p3Whole, null, pe5, "PRESENT", null)).status()).isEqualTo(200);
        long classB2 = send("POST", "/api/v1/classes", token4, cls(p3Year, gradeIdOfLevel(1), "ខ-សាកល្បង", null, null, null)).json(json).path("schoolClass").path("id").asLong();
        long pe5b = send("POST", "/api/v1/enrollments/" + pe5 + "/transfer", token4, "{\"classId\":" + classB2 + "}").json(json).path("enrollment").path("id").asLong();
        int before = jdbc.queryForObject("select count(*) from attendance_records", Integer.class);
        assertThat(code(send("PUT", "/api/v1/attendance/sheet", token4, attFor(classB2, TODAY, p3Whole, null, pe5b, "ABSENT", null)))).isEqualTo("ATTENDANCE_ALREADY_RECORDED");
        assertThat(jdbc.queryForObject("select count(*) from attendance_records", Integer.class)).as("the refused sheet stored nothing").isEqualTo(before);
        assertThat(send("PUT", "/api/v1/attendance/sheet", token4, attFor(classB2, TODAY, p3Special, null, pe5b, "ABSENT", null)).status()).as("another session of the day is a different record").isEqualTo(200);
        // the database says the same on its own, whatever the program does
        Long sessionOfB2 = jdbc.queryForObject("select id from attendance_sessions where class_id = ?", Long.class, classB2);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO attendance_records (session_id, enrollment_id, student_id, date, period_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ABSENT', 'x', 'x')",
                sessionOfB2, pe5, ps5, TODAY, p3Whole)).as("same student, day and session, a different sheet and enrollment")
                .hasMessageContaining("UNIQUE constraint failed: attendance_records.student_id, attendance_records.date, attendance_records.period_id");   // (Spring does not classify SQLite's error codes)

        // every change is in the audit trail, with codes and no names
        List<String> actions = jdbc.queryForList("select distinct action from audit_logs where action like 'ATTENDANCE_PERIOD_%'", String.class);
        assertThat(actions).contains("ATTENDANCE_PERIOD_CREATED", "ATTENDANCE_PERIOD_UPDATED", "ATTENDANCE_PERIOD_CONFIRMED", "ATTENDANCE_PERIOD_ENABLED", "ATTENDANCE_PERIOD_DISABLED",
                "ATTENDANCE_PERIOD_DELETED", "ATTENDANCE_PERIOD_REORDERED", "ATTENDANCE_PERIOD_COPIED");
        assertThat(jdbc.queryForList("select summary from audit_logs where action like 'ATTENDANCE_PERIOD_%'", String.class).toString()).doesNotContain("ពេលព្រឹក").doesNotContain("ព្រឹក").doesNotContain("ពេលរសៀល");
    }

    // ---- attendance counted by days AND by sessions -----------------------------------------------------------------------------

    private static void expectCounts(JsonNode row, int[] sessions, int[] days) {
        assertThat(List.of(row.path("present").asInt(), row.path("absent").asInt(), row.path("late").asInt(), row.path("leave").asInt(), row.path("total").asInt()))
                .as("sessions (present, absent, late, leave, total) of " + row.path("nameKm").asString()).containsExactly(sessions[0], sessions[1], sessions[2], sessions[3], sessions[4]);
        JsonNode d = row.path("days");
        assertThat(List.of(d.path("present").asInt(), d.path("late").asInt(), d.path("partial").asInt(), d.path("absent").asInt(), d.path("leave").asInt(), d.path("total").asInt()))
                .as("days (present, late, partial, absent, leave, total) of " + row.path("nameKm").asString()).containsExactly(days[0], days[1], days[2], days[3], days[4], days[5]);
    }

    @Test @Order(59)
    void attendanceIsCountedByDaysAndBySessionsAndAStudentOfTwoSessionsIsOneDay() throws Exception {
        long classD = send("POST", "/api/v1/classes", token4, cls(p3Year, gradeIdOfLevel(1), "ច-វត្តមាន", null, null, null)).json(json).path("schoolClass").path("id").asLong();
        String[] letters = {"ក", "ខ", "គ", "ឃ", "ង", "ច", "ឆ", "ជ"};
        long[] student = new long[8];
        long[] enrol = new long[8];
        for (int i = 0; i < 8; i++) {
            student[i] = send("POST", "/api/v1/students", token4, studentBody("សិស្សរាប់ថ្ងៃ " + letters[i], i % 2 == 0 ? "MALE" : "FEMALE", "2019-02-0" + (i + 1), null, classD, false)).json(json).path("student").path("id").asLong();
            enrol[i] = enrollmentOf(student[i]);
        }
        // the day session: a present, b present, c present, d absent, e leave, f absent, g present (h is not on this sheet)
        assertThat(send("PUT", "/api/v1/attendance/sheet", token4, attFor(classD, TODAY, p3Whole, null, enrol[0], "PRESENT", null, enrol[1], "PRESENT", null, enrol[2], "PRESENT", null,
                enrol[3], "ABSENT", null, enrol[4], "LEAVE", null, enrol[5], "ABSENT", null, enrol[6], "PRESENT", null)).status()).isEqualTo(200);
        // the morning session: a present, b late, c ABSENT, d absent, e leave, f LEAVE, h absent (g is not on this sheet)
        assertThat(send("PUT", "/api/v1/attendance/sheet", token4, attFor(classD, TODAY, p3Morning, null, enrol[0], "PRESENT", null, enrol[1], "LATE", null, enrol[2], "ABSENT", null,
                enrol[3], "ABSENT", null, enrol[4], "LEAVE", null, enrol[5], "LEAVE", null, enrol[7], "ABSENT", null)).status()).isEqualTo(200);

        String range = "&from=" + TODAY + "&to=" + TODAY;
        JsonNode rows = send("GET", "/api/v1/attendance/summary?classId=" + classD + range, token4, null).json(json);
        assertThat(rows.size()).isEqualTo(8);
        //                     sessions: present absent late leave total      days: present late partial absent leave total
        expectCounts(rows.get(0), new int[]{2, 0, 0, 0, 2}, new int[]{1, 0, 0, 0, 0, 1});   // a: present in both sessions = a present day
        expectCounts(rows.get(1), new int[]{1, 0, 1, 0, 2}, new int[]{0, 1, 0, 0, 0, 1});   // b: present, then late = a late day
        expectCounts(rows.get(2), new int[]{1, 1, 0, 0, 2}, new int[]{0, 0, 1, 0, 0, 1});   // c: present in one session, absent in the other = ONE partial day, never two days
        expectCounts(rows.get(3), new int[]{0, 2, 0, 0, 2}, new int[]{0, 0, 0, 1, 0, 1});   // d: absent twice = one absent day
        expectCounts(rows.get(4), new int[]{0, 0, 0, 2, 2}, new int[]{0, 0, 0, 0, 1, 1});   // e: leave twice = one leave day
        expectCounts(rows.get(5), new int[]{0, 1, 0, 1, 2}, new int[]{0, 0, 0, 1, 0, 1});   // f: absent and leave, nothing attended = absent (an absence is not hidden)
        expectCounts(rows.get(6), new int[]{1, 0, 0, 0, 1}, new int[]{1, 0, 0, 0, 0, 1});   // g: only one session recorded = that session's status; the other is "not entered", not absent
        expectCounts(rows.get(7), new int[]{0, 1, 0, 0, 1}, new int[]{0, 0, 0, 1, 0, 1});   // h: only the second session recorded

        // the class by date: eight students counted once each, two sheets
        JsonNode days = send("GET", "/api/v1/attendance/days?classId=" + classD + range, token4, null).json(json);
        assertThat(days.size()).isEqualTo(1);
        JsonNode today = days.get(0);
        assertThat(today.path("date").asString()).isEqualTo(TODAY);
        assertThat(List.of(today.path("sheets").asInt(), today.path("students").asInt(), today.path("present").asInt(), today.path("late").asInt(), today.path("partial").asInt(), today.path("absent").asInt(), today.path("leave").asInt()))
                .containsExactly(2, 8, 2, 1, 1, 3, 1);
        assertThat(send("GET", "/api/v1/attendance/days?classId=" + classD + "&from=2000-01-01&to=2000-01-02", token4, null).json(json).size()).as("no sheet, no day").isZero();
        assertThat(send("GET", "/api/v1/attendance/days?classId=" + classD + "&from=bad&to=" + TODAY, token4, null).status()).isEqualTo(422);

        // one student's own history: two sessions, ONE day (partial)
        JsonNode mine = send("GET", "/api/v1/students/" + student[2] + "/attendance?from=2026-01-01&to=2099-12-31", token4, null).json(json);
        assertThat(mine.path("total").asInt()).as("two sessions").isEqualTo(2);
        assertThat(mine.path("days").path("total").asInt()).as("one day").isEqualTo(1);
        assertThat(mine.path("days").path("partial").asInt()).isEqualTo(1);
        assertThat(mine.path("days").path("present").asInt() + mine.path("days").path("absent").asInt()).as("a partial day is neither a present nor an absent day").isZero();

        // history is preserved: renaming a session and switching it off changes no number, only which sessions new sheets may use
        String before = rows.toString() + days.toString();
        JsonNode morning = periodNode(p3Year, p3Morning);
        Resp renamed = send("PUT", "/api/v1/attendance-periods/" + p3Morning, token4, periodJson(null, "ព្រឹក (ប្តូរឈ្មោះ)", morning.path("startTime").asString(), morning.path("endTime").asString(), morning.path("version").asLong()));
        assertThat(renamed.status()).as(renamed.body()).isEqualTo(200);
        assertThat(switchPeriod(p3Year, p3Morning, false).status()).isEqualTo(200);
        String after = send("GET", "/api/v1/attendance/summary?classId=" + classD + range, token4, null).json(json).toString()
                + send("GET", "/api/v1/attendance/days?classId=" + classD + range, token4, null).json(json).toString();
        assertThat(after).as("the same numbers after the session was renamed and switched off").isEqualTo(before);
        assertThat(switchPeriod(p3Year, p3Morning, true).status()).isEqualTo(200);

        // the official method is a setting: DAY until the school says otherwise, and only DAY or SESSION
        assertThat(send("GET", "/api/v1/settings/app", token4, null).body()).contains("\"attendance.officialBasis\":\"DAY\"");
        assertThat(fieldCodes(send("PUT", "/api/v1/settings/app", token4, "{\"attendance.officialBasis\":\"WEEK\"}"))).containsExactly("attendance.officialBasis:INVALID_SETTING");
        assertThat(send("GET", "/api/v1/settings/app", token4, null).body()).contains("\"attendance.officialBasis\":\"DAY\"");
    }

    // ---- riel and dollars are never added together ----------------------------------------------------------------------------

    static JsonNode byCurrency(JsonNode totals, String currency) {
        for (JsonNode t : totals) if (t.path("currency").asString().equals(currency)) return t;
        return null;
    }

    @Test @Order(58)
    void rielAndDollarsAreKeptApartInEveryTotalAndAPaymentIsInTheCurrencyOfItsCharge() throws Exception {
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.enabled\":\"true\",\"fees.currencies\":\"KHR,USD\"}").status()).isEqualTo(200);
        String classUrl = "/api/v1/fees/class?classId=" + p3Class;
        JsonNode rielBefore = byCurrency(send("GET", classUrl, token4, null).json(json).path("totals"), "KHR");
        JsonNode dollarsBefore = byCurrency(send("GET", classUrl, token4, null).json(json).path("totals"), "USD");
        assertThat(rielBefore).as("the school already owes riel").isNotNull();
        java.math.BigDecimal usdDueBefore = dollarsBefore == null ? java.math.BigDecimal.ZERO : num(dollarsBefore.path("due"));
        java.math.BigDecimal usdPaidBefore = dollarsBefore == null ? java.math.BigDecimal.ZERO : num(dollarsBefore.path("paid"));

        // a student who owes riel is also charged 12.50 dollars and pays 5 dollars of it
        Resp charge = send("POST", "/api/v1/fees/charges", token4, "{\"enrollmentId\":" + pe1 + ",\"categoryId\":" + catBook + "}");
        assertThat(charge.status()).as(charge.body()).isEqualTo(201);
        long dollarCharge = charge.json(json).path("id").asLong();
        assertThat(charge.json(json).path("currency").asString()).isEqualTo("USD");
        assertThat(num(charge.json(json).path("amountDue"))).isEqualByComparingTo("12.5");
        assertThat(fieldCodes(send("POST", "/api/v1/fees/charges/" + dollarCharge + "/payments", token4, payBody(15000, TODAY, "CASH", null))))
                .as("15,000 is read as dollars, the currency of the charge, not as riel: it is far more than is owed").containsExactly("amount:OVERPAYMENT");
        Resp paid = send("POST", "/api/v1/fees/charges/" + dollarCharge + "/payments", token4, payBody(5, TODAY, "CASH", null));
        assertThat(paid.status()).as(paid.body()).isEqualTo(201);
        assertThat(jdbc.queryForObject("select f.currency from student_fees f join fee_payments p on p.student_fee_id = f.id where p.id = ?", String.class, paid.json(json).path("id").asLong()))
                .as("a payment has no currency of its own: it is always the currency of the charge it pays").isEqualTo("USD");

        // the class overview: one set of totals per currency, the riel untouched, the dollars exactly what was added
        JsonNode summary = send("GET", classUrl, token4, null).json(json);
        JsonNode riel = byCurrency(summary.path("totals"), "KHR");
        JsonNode dollars = byCurrency(summary.path("totals"), "USD");
        assertThat(dollars).isNotNull();
        assertThat(num(riel.path("due"))).as("riel due did not move").isEqualByComparingTo(num(rielBefore.path("due")));
        assertThat(num(riel.path("paid"))).isEqualByComparingTo(num(rielBefore.path("paid")));
        assertThat(num(riel.path("balance"))).isEqualByComparingTo(num(rielBefore.path("balance")));
        assertThat(num(dollars.path("due"))).isEqualByComparingTo(usdDueBefore.add(new java.math.BigDecimal("12.5")));
        assertThat(num(dollars.path("paid"))).isEqualByComparingTo(usdPaidBefore.add(new java.math.BigDecimal("5")));
        assertThat(num(dollars.path("balance"))).isEqualByComparingTo(num(dollars.path("due")).subtract(num(dollars.path("paid"))));
        assertThat(summary.path("totals").size()).as("exactly one entry per currency, never a combined one").isEqualTo(2);
        for (JsonNode row : summary.path("rows")) {
            if (row.path("enrollmentId").asLong() != pe1) continue;
            assertThat(byCurrency(row.path("totals"), "KHR")).as("the student's riel line is still there").isNotNull();
            assertThat(num(byCurrency(row.path("totals"), "USD").path("balance"))).as("and the dollar line is its own").isEqualByComparingTo(num(byCurrency(row.path("totals"), "USD").path("due")).subtract(num(byCurrency(row.path("totals"), "USD").path("paid"))));
        }

        // the dashboard and the student's own ledger agree, in two currencies
        JsonNode outstanding = send("GET", "/api/v1/dashboard", token4, null).json(json).path("fees").path("outstanding");
        assertThat(outstanding.size()).isGreaterThanOrEqualTo(2);
        assertThat(num(byCurrency(outstanding, "USD").path("balance"))).isEqualByComparingTo(num(dollars.path("balance")));
        assertThat(byCurrency(outstanding, "KHR")).isNotNull();
        JsonNode mine = ledger(pe1).path("totals");
        assertThat(byCurrency(mine, "KHR")).isNotNull();
        assertThat(num(byCurrency(mine, "USD").path("paid"))).isEqualByComparingTo("5");

        // ---- D9: the preferred currency (KHR until the school chooses); it only matters when both are allowed, and it never changes recorded money
        assertThat(send("GET", "/api/v1/settings/app", token4, null).json(json).path("fees.defaultCurrency").asString()).as("KHR until chosen").isEqualTo("KHR");
        assertThat(fieldCodes(send("PUT", "/api/v1/settings/app", token4, "{\"fees.defaultCurrency\":\"EUR\"}"))).as("only KHR or USD").containsExactly("fees.defaultCurrency:INVALID_SETTING");
        long khrFirst = send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"ប្រភេទរូបិយប័ណ្ណដើម\"}").json(json).path("id").asLong();
        assertThat(categoryCurrency(khrFirst)).as("a new category starts in the preferred currency, riel by default").isEqualTo("KHR");
        BigDecimalSnapshot before = new BigDecimalSnapshot(num(byCurrency(send("GET", classUrl, token4, null).json(json).path("totals"), "KHR").path("due")), num(byCurrency(send("GET", classUrl, token4, null).json(json).path("totals"), "USD").path("due")));
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.defaultCurrency\":\"USD\"}").status()).isEqualTo(200);
        long usdFirst = send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"ប្រភេទរូបិយប័ណ្ណដុល្លារ\"}").json(json).path("id").asLong();
        assertThat(categoryCurrency(usdFirst)).as("with dollars preferred a new category starts in dollars").isEqualTo("USD");
        assertThat(categoryCurrency(khrFirst)).as("a category that already exists keeps its currency").isEqualTo("KHR");
        JsonNode afterPreferred = send("GET", classUrl, token4, null).json(json);
        assertThat(num(byCurrency(afterPreferred.path("totals"), "KHR").path("due"))).as("no recorded money moved (riel)").isEqualByComparingTo(before.khr());
        assertThat(num(byCurrency(afterPreferred.path("totals"), "USD").path("due"))).as("no recorded money moved (dollars)").isEqualByComparingTo(before.usd());
        assertThat(afterPreferred.path("totals").size()).as("still one entry per currency, never a combined one").isEqualTo(2);
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.currencies\":\"KHR\"}").status()).isEqualTo(200);
        long onlyRiel = send("POST", "/api/v1/fees/categories", token4, "{\"nameKm\":\"ប្រភេទរៀលតែមួយ\"}").json(json).path("id").asLong();
        assertThat(categoryCurrency(onlyRiel)).as("a preferred currency that is not allowed is ignored").isEqualTo("KHR");
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.currencies\":\"KHR,USD\",\"fees.defaultCurrency\":\"KHR\"}").status()).isEqualTo(200);

        // back to how the scenario found it
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"fees.enabled\":\"false\",\"fees.currencies\":\"KHR\"}").status()).isEqualTo(200);
    }

    record BigDecimalSnapshot(java.math.BigDecimal khr, java.math.BigDecimal usd) {}

    String categoryCurrency(long id) {
        return jdbc.queryForObject("select currency from fee_categories where id = ?", String.class, id);
    }

    @Test @Order(60)
    void theReminderNagsOnlyAfterTheChosenNumberOfDaysWithoutACopyOnAnotherPlace() throws Exception {
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"backup.reminderDays\":\"7\"}").status()).isEqualTo(200);
        assertThat(backups(token4).path("externalOverdue").asBoolean()).isFalse();
        CLOCK.advance(Duration.ofDays(8));   // sessions expire with the clock: sign in again
        assertThat(send("GET", "/api/v1/backups", token4, null).status()).isEqualTo(401);
        String fresh = login("admin.sokha", PW3).json(json).path("token").asString();

        JsonNode over = backups(fresh);
        assertThat(over.path("externalOverdue").asBoolean()).as("8 days since the last copy, reminder after 7").isTrue();
        assertThat(over.path("autoDue").asBoolean()).as("a day has passed since the newest backup: one is due when the program closes").isTrue();
        assertThat(over.path("localState").asString()).as("eight days since the newest good backup: more than 24 hours").isEqualTo("OLD");
        assertThat(over.path("localAgeHours").asLong()).isGreaterThanOrEqualTo(8 * 24);
        JsonNode localOld = healthCheck(send("GET", "/api/v1/system/health", fresh, null).json(json), "BACKUP_AGE");
        assertThat(localOld.path("status").asString()).isEqualTo("WARN");
        assertThat(localOld.path("code").asString()).as("the dashboard warning about the backups on this laptop").isEqualTo("BACKUP_OLD");
        assertThat(localOld.path("params").path("hours").asLong()).isGreaterThanOrEqualTo(8 * 24);
        JsonNode age = healthCheck(send("GET", "/api/v1/system/health", fresh, null).json(json), "EXTERNAL_COPY");
        assertThat(age.path("status").asString()).isEqualTo("WARN");
        assertThat(age.path("code").asString()).isEqualTo("BACKUP_OVERDUE");
        assertThat(age.path("params").path("days").asLong()).isGreaterThanOrEqualTo(8);
        assertThat(age.path("params").path("reminderDays").asInt()).isEqualTo(7);

        assertThat(send("PUT", "/api/v1/settings/app", fresh, "{\"backup.reminderDays\":\"30\"}").status()).isEqualTo(200);
        assertThat(backups(fresh).path("externalOverdue").asBoolean()).as("the school chose a longer interval").isFalse();
        assertThat(send("PUT", "/api/v1/settings/app", fresh, "{\"backup.reminderDays\":\"7\"}").status()).isEqualTo(200);
        assertThat(backups(fresh).path("externalOverdue").asBoolean()).isTrue();

        String sha = BackupArchive.sha256(DataDirs.backups().resolve(backup2 + ".zip"));
        assertThat(send("POST", "/api/v1/backups/" + backup2 + "/external-copy", fresh, j("sha256", sha)).status()).isEqualTo(200);
        assertThat(backups(fresh).path("externalOverdue").asBoolean()).as("a new copy clears the reminder").isFalse();
        assertThat(healthCheck(send("GET", "/api/v1/system/health", fresh, null).json(json), "EXTERNAL_COPY").path("status").asString()).isEqualTo("OK");
        assertThat(healthCheck(send("GET", "/api/v1/system/health", fresh, null).json(json), "BACKUP_AGE").path("code").asString())
                .as("a copy on a USB stick does not make the local backup newer: it is still old").isEqualTo("BACKUP_OLD");

        // the reminder is OFF at 0: nothing is overdue however long ago the last copy was, and the local backup warning does not depend on it
        assertThat(send("PUT", "/api/v1/settings/app", fresh, "{\"backup.reminderDays\":\"0\"}").status()).isEqualTo(200);
        CLOCK.advance(Duration.ofDays(60));
        String later = login("admin.sokha", PW3).json(json).path("token").asString();
        assertThat(backups(later).path("externalOverdue").asBoolean()).as("reminder off: a USB copy is optional").isFalse();
        assertThat(backups(later).path("reminderDays").asInt()).isZero();
        assertThat(healthCheck(send("GET", "/api/v1/system/health", later, null).json(json), "EXTERNAL_COPY").path("status").asString()).isEqualTo("OK");
        assertThat(backups(later).path("localState").asString()).isEqualTo("OLD");
        assertThat(send("PUT", "/api/v1/settings/app", later, "{\"backup.reminderDays\":\"7\"}").status()).isEqualTo(200);   // as the test found it
    }

    @Test @Order(61)
    void theRollOfHonourDefaultsKeepTheirLineBreaksAndSpacesAndAnyBadValueRejectsTheWholeRequest() throws Exception {
        String fresh = login("admin.sokha", PW3).json(json).path("token").asString();   // the test before this one moved the clock on, which ends the older sessions
        JsonNode start = send("GET", "/api/v1/settings/app", fresh, null).json(json);
        assertThat(start.path("honor.count").asString()).as("the defaults before the school saves anything: five names, classic gold, the standard wording").isEqualTo("5");
        assertThat(start.path("honor.style").asString()).isEqualTo("classic");
        assertThat(start.path("honor.header").asString()).isEqualTo("{school}\n{class}");
        assertThat(start.path("honor.subtitle").asString()).isEqualTo("លទ្ធផល{exam}");
        assertThat(start.path("honor.dateLines").asString()).isEqualTo("{date}");
        assertThat(start.path("honor.titleRight").asString()).isEqualTo("គ្រូប្រចាំថ្នាក់");
        assertThat(start.path("honor.titleLeft").asString()).isEqualTo("បានឃើញ និងឯកភាព\nនាយក/នាយិកា");
        assertThat(start.path("honor.allClasses").asString()).isEqualTo("false");
        assertThat(start.path("honor.formats").asString()).as("no format saved: every box has its standard look").isEmpty();

        // text keeps its line breaks and its inner spaces; Windows line ends become \n; only the two ends are trimmed
        Resp saved = send("PUT", "/api/v1/settings/app", fresh, j("honor.count", "10", "honor.style", "laurel", "honor.header", "  កម្រងសាលាលេខ២\r\n{school}\n{class}  ",
                "honor.subtitle", "លទ្ធផលប្រចាំខែ{month}\r\n   សម្រាប់សិស្សពូកែ", "honor.dateLines", "ថ្ងៃសុក្រ  ២រោច\n\nបាណន់ ត្រូវនឹង{date}", "honor.titleRight", "គ្រូបន្ទុកថ្នាក់",
                "honor.titleLeft", "បានឃើញ និងឯកភាព\nនាយកសាលា", "honor.allClasses", "true"));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        JsonNode back = saved.json(json);
        assertThat(back.path("honor.count").asString()).isEqualTo("10");
        assertThat(back.path("honor.style").asString()).isEqualTo("laurel");
        assertThat(back.path("honor.header").asString()).as("the CRLF is one line break and the ends are trimmed; the words in braces are kept as typed").isEqualTo("កម្រងសាលាលេខ២\n{school}\n{class}");
        assertThat(back.path("honor.subtitle").asString()).as("the three spaces at the start of the second line stay").isEqualTo("លទ្ធផលប្រចាំខែ{month}\n   សម្រាប់សិស្សពូកែ");
        assertThat(back.path("honor.dateLines").asString()).as("an empty line and two spaces in the middle stay").isEqualTo("ថ្ងៃសុក្រ  ២រោច\n\nបាណន់ ត្រូវនឹង{date}");
        assertThat(back.path("honor.titleRight").asString()).isEqualTo("គ្រូបន្ទុកថ្នាក់");
        assertThat(back.path("honor.titleLeft").asString()).isEqualTo("បានឃើញ និងឯកភាព\nនាយកសាលា");
        assertThat(back.path("honor.allClasses").asString()).isEqualTo("true");

        // how each box is set (font, size, bold, ...): a small JSON text, checked field by field
        String formats = "{\"dateLines\":{\"size\":\"S\",\"fit\":true,\"bold\":false},\"subtitle\":{\"font\":\"text\",\"align\":\"left\",\"underline\":true},\"titleLeft\":{\"italic\":true,\"size\":\"XL\"}}";
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("honor.formats", formats)).json(json).path("honor.formats").asString()).as("a valid format text is kept as sent").isEqualTo(formats);
        for (String broken : List.of("not json", "[1]", "{\"nobody\":{\"bold\":true}}", "{\"header\":{\"size\":\"HUGE\"}}", "{\"header\":{\"bold\":\"yes\"}}", "{\"header\":{\"colour\":\"red\"}}", "{\"header\":{\"font\":\"comic\"}}", "{\"header\":{\"align\":\"justify\"}}", "{\"header\":true}", "{\"header\":{\"bold\":true}" + " ".repeat(1300) + "}")) {
            assertThat(send("PUT", "/api/v1/settings/app", fresh, j("honor.formats", broken)).status()).as("refused: " + broken.trim()).isEqualTo(422);
        }
        assertThat(send("GET", "/api/v1/settings/app", fresh, null).json(json).path("honor.formats").asString()).as("a refused format stored nothing").isEqualTo(formats);
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("honor.formats", "")).json(json).path("honor.formats").asString()).as("empty means the standard look again").isEmpty();

        // a box saved empty stays empty (it prints nothing); it does not come back as the standard wording
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("honor.subtitle", "")).json(json).path("honor.subtitle").asString()).isEmpty();

        // every value is checked and a bad one stores nothing, not even the good values sent with it
        Resp bad = send("PUT", "/api/v1/settings/app", fresh, j("honor.count", "7", "honor.style", "gold", "honor.header", "1\n2\n3\n4\n5", "honor.dateLines", "ក".repeat(301),
                "honor.titleLeft", "ok\u0007bell", "honor.allClasses", "yes", "honor.titleRight", "must not be stored"));
        assertThat(bad.status()).isEqualTo(422);
        assertThat(fieldCodes(bad)).containsExactlyInAnyOrder("honor.count:INVALID_SETTING", "honor.style:INVALID_SETTING", "honor.header:INVALID_SETTING", "honor.dateLines:INVALID_SETTING",
                "honor.titleLeft:INVALID_SETTING", "honor.allClasses:INVALID_SETTING");
        assertThat(send("GET", "/api/v1/settings/app", fresh, null).json(json).path("honor.titleRight").asString()).as("the valid title in that request was not stored either").isEqualTo("គ្រូបន្ទុកថ្នាក់");
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("honor.header", "1\n2\n3\n4")).status()).as("four lines are allowed").isEqualTo(200);
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("honor.dateLines", "ក".repeat(300))).status()).as("300 characters are allowed").isEqualTo(200);

        // all twenty artwork styles can be saved as the default and come back as saved (the first ten, then the ten added on 2026-11-06); a made-up one is refused and stores nothing
        for (String style : List.of("classic", "lotus", "angkor", "star", "royal", "laurel", "guilloche", "kids", "mono", "sun", "kbach", "rice", "palm", "rose", "moon", "book", "flag", "vintage", "modern", "wave")) {
            assertThat(send("PUT", "/api/v1/settings/app", fresh, j("honor.style", style)).json(json).path("honor.style").asString()).as("style " + style).isEqualTo(style);
        }
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("honor.style", "wave2")).status()).isEqualTo(422);
        assertThat(send("GET", "/api/v1/settings/app", fresh, null).json(json).path("honor.style").asString()).as("a refused style stored nothing").isEqualTo("wave");

        // back to the standard wording for the rest of the scenario
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("honor.count", "5", "honor.style", "classic", "honor.header", "{school}\n{class}", "honor.subtitle", "លទ្ធផល{exam}", "honor.dateLines", "{date}",
                "honor.titleRight", "គ្រូប្រចាំថ្នាក់", "honor.titleLeft", "បានឃើញ និងឯកភាព\nនាយក/នាយិកា", "honor.allClasses", "false")).status()).isEqualTo(200);
    }

    @Test @Order(62)
    void theMonthlyRankingDefaultsKeepTheirTextsFormatsAndColumnHeadingsAndAnyBadValueRejectsTheWholeRequest() throws Exception {
        String fresh = login("admin.sokha", PW3).json(json).path("token").asString();
        JsonNode start = send("GET", "/api/v1/settings/app", fresh, null).json(json);
        assertThat(start.path("ranking.header").asString()).as("the defaults before the school saves anything: the standard wording of its sample").isEqualTo("{school}\n{class}");
        assertThat(start.path("ranking.title").asString()).isEqualTo("ភាពចំណាត់ថ្នាក់ប្រចាំខែ{month} ({schoolYear})");
        assertThat(start.path("ranking.stats").asString()).contains("{total}", "{female}", "{passed}", "{passedFemale}", "{failed}", "{failedFemale}");
        assertThat(start.path("ranking.stats").asString().split("\n")).as("three lines of figures").hasSize(3);
        assertThat(start.path("ranking.dateLines").asString()).isEqualTo("{date}");
        assertThat(start.path("ranking.titleRight").asString()).isEqualTo("គ្រូប្រចាំថ្នាក់");
        assertThat(start.path("ranking.titleLeft").asString()).isEqualTo("បានឃើញ និងឯកភាព\nនាយក/នាយិកា");
        assertThat(start.path("ranking.allClasses").asString()).isEqualTo("false");
        assertThat(start.path("ranking.colours").asString()).as("the table is coloured until the school switches the colours off").isEqualTo("true");
        assertThat(start.path("ranking.formats").asString()).as("no format saved: every box has its standard look").isEmpty();
        assertThat(start.path("ranking.columns").asString()).as("no heading saved: every column has its standard heading").isEmpty();

        // text keeps its line breaks and its inner spaces; Windows line ends become \n; only the two ends are trimmed
        Resp saved = send("PUT", "/api/v1/settings/app", fresh, j("ranking.header", "  {school}\r\n  {class}  ", "ranking.title", "ចំណាត់ថ្នាក់  ខែ{month}", "ranking.stats", "សរុប {total}\r\n\r\nជាប់ {passed}",
                "ranking.dateLines", "ថ្ងៃសុក្រ  ២រោច\n{date}", "ranking.titleRight", "គ្រូបន្ទុកថ្នាក់", "ranking.titleLeft", "ក\nខ", "ranking.allClasses", "true", "ranking.colours", "false"));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        JsonNode back = saved.json(json);
        assertThat(back.path("ranking.header").asString()).as("the CRLF is one line break, the ends are trimmed and the two spaces that start the second line stay").isEqualTo("{school}\n  {class}");
        assertThat(back.path("ranking.title").asString()).as("two spaces in the middle stay").isEqualTo("ចំណាត់ថ្នាក់  ខែ{month}");
        assertThat(back.path("ranking.stats").asString()).as("an empty line stays").isEqualTo("សរុប {total}\n\nជាប់ {passed}");
        assertThat(back.path("ranking.dateLines").asString()).isEqualTo("ថ្ងៃសុក្រ  ២រោច\n{date}");
        assertThat(back.path("ranking.titleRight").asString()).isEqualTo("គ្រូបន្ទុកថ្នាក់");
        assertThat(back.path("ranking.titleLeft").asString()).isEqualTo("ក\nខ");
        assertThat(back.path("ranking.allClasses").asString()).isEqualTo("true");
        assertThat(back.path("ranking.colours").asString()).as("the colours can be switched off and the choice is kept").isEqualTo("false");

        // how each of the six boxes is set: a small JSON text, checked field by field, and only the ranking list's own boxes are known to it
        String formats = "{\"title\":{\"bold\":true,\"size\":\"L\",\"font\":\"title\"},\"stats\":{\"fit\":false,\"align\":\"right\",\"underline\":true}}";
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("ranking.formats", formats)).json(json).path("ranking.formats").asString()).as("a valid format text is kept as sent").isEqualTo(formats);
        for (String broken : List.of("not json", "[1]", "{\"subtitle\":{\"bold\":true}}", "{\"nobody\":{\"bold\":true}}", "{\"title\":{\"size\":\"HUGE\"}}", "{\"title\":{\"bold\":\"yes\"}}",
                "{\"title\":{\"colour\":\"red\"}}", "{\"title\":{\"font\":\"comic\"}}", "{\"title\":{\"align\":\"justify\"}}", "{\"title\":true}", "{\"title\":{\"bold\":true}" + " ".repeat(1300) + "}")) {
            assertThat(send("PUT", "/api/v1/settings/app", fresh, j("ranking.formats", broken)).status()).as("refused: " + broken.trim()).isEqualTo(422);
        }
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("honor.formats", "{\"stats\":{\"bold\":true}}")).status()).as("a box of the ranking list is not a box of the roll of honour").isEqualTo(422);
        assertThat(send("GET", "/api/v1/settings/app", fresh, null).json(json).path("ranking.formats").asString()).as("a refused format stored nothing").isEqualTo(formats);
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("ranking.formats", "")).json(json).path("ranking.formats").asString()).as("empty means the standard look again").isEmpty();

        // the column headings: only the ten known places, each a short single line of text (a heading may be emptied)
        String columns = "{\"rank\":\"លំដាប់\",\"female\":\"F\",\"remarks\":\"\",\"no\":\"" + "ក".repeat(40) + "\"}";
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("ranking.columns", columns)).json(json).path("ranking.columns").asString()).as("valid headings are kept as sent").isEqualTo(columns);
        for (String broken : List.of("not json", "[1]", "{\"colour\":\"red\"}", "{\"rank\":5}", "{\"rank\":null}", "{\"rank\":\"" + "ក".repeat(41) + "\"}", "{\"rank\":\"a\\u0007b\"}", "{\"rank\":\"a\\nb\"}",
                "{\"rank\":\"x\"" + " ".repeat(800) + "}")) {
            assertThat(send("PUT", "/api/v1/settings/app", fresh, j("ranking.columns", broken)).status()).as("refused: " + broken.trim()).isEqualTo(422);
        }
        assertThat(send("GET", "/api/v1/settings/app", fresh, null).json(json).path("ranking.columns").asString()).as("refused headings stored nothing").isEqualTo(columns);
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("ranking.columns", "")).json(json).path("ranking.columns").asString()).as("empty means the standard headings again").isEmpty();

        // a box saved empty stays empty (it prints nothing); it does not come back as the standard wording
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("ranking.stats", "")).json(json).path("ranking.stats").asString()).isEmpty();

        // every value is checked and a bad one stores nothing, not even the good values sent with it
        Resp bad = send("PUT", "/api/v1/settings/app", fresh, j("ranking.header", "1\n2\n3\n4\n5", "ranking.title", "ក".repeat(301), "ranking.titleLeft", "ok\u0007bell", "ranking.allClasses", "yes", "ranking.colours", "maybe",
                "ranking.columns", "x", "ranking.formats", "x", "ranking.titleRight", "must not be stored"));
        assertThat(bad.status()).isEqualTo(422);
        assertThat(fieldCodes(bad)).containsExactlyInAnyOrder("ranking.header:INVALID_SETTING", "ranking.title:INVALID_SETTING", "ranking.titleLeft:INVALID_SETTING", "ranking.allClasses:INVALID_SETTING",
                "ranking.colours:INVALID_SETTING", "ranking.columns:INVALID_SETTING", "ranking.formats:INVALID_SETTING");
        assertThat(send("GET", "/api/v1/settings/app", fresh, null).json(json).path("ranking.titleRight").asString()).as("the valid title in that request was not stored either").isEqualTo("គ្រូបន្ទុកថ្នាក់");
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("ranking.header", "1\n2\n3\n4")).status()).as("four lines are allowed").isEqualTo(200);
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("ranking.title", "ក".repeat(300))).status()).as("300 characters are allowed").isEqualTo(200);

        // the roll of honour's own keys were not touched by any of this
        assertThat(send("GET", "/api/v1/settings/app", fresh, null).json(json).path("honor.header").asString()).isEqualTo("{school}\n{class}");

        // back to the standard wording for the rest of the scenario
        assertThat(send("PUT", "/api/v1/settings/app", fresh, j("ranking.header", "{school}\n{class}", "ranking.title", "ភាពចំណាត់ថ្នាក់ប្រចាំខែ{month} ({schoolYear})",
                "ranking.stats", "បញ្ចប់បញ្ជីត្រឹមចំនួនសិស្សសរុប {total} នាក់ ស្រី {female} នាក់\nសិស្សមានមធ្យមភាគសរុប {passed} នាក់ ស្រី {passedFemale} នាក់\nសិស្សធ្លាក់មធ្យមភាគសរុប {failed} នាក់ ស្រី {failedFemale} នាក់",
                "ranking.dateLines", "{date}", "ranking.titleRight", "គ្រូប្រចាំថ្នាក់", "ranking.titleLeft", "បានឃើញ និងឯកភាព\nនាយក/នាយិកា", "ranking.allClasses", "false", "ranking.colours", "true")).status()).isEqualTo(200);
    }

    // ---- V8: subjects with sub-subjects ----------------------------------------------------------------------------

    long newSubject(String t, String name, Long parent) throws Exception {
        Resp r = send("POST", "/api/v1/subjects", t, parent == null ? j("nameKm", name) : "{\"nameKm\":\"" + name + "\",\"parentId\":" + parent + "}");
        assertThat(r.status()).as(r.body()).isEqualTo(201);
        return r.json(json).path("id").asLong();
    }

    JsonNode subjectNode(String t, long id) throws Exception {
        for (JsonNode s : send("GET", "/api/v1/subjects", t, null).json(json)) if (s.path("id").asLong() == id) return s;
        throw new AssertionError("no subject " + id);
    }

    long gradeIdFor(String t, int level) throws Exception {
        for (JsonNode g : send("GET", "/api/v1/grades", t, null).json(json)) if (g.path("level").asInt() == level) return g.path("id").asLong();
        throw new AssertionError("no grade " + level);
    }

    List<Long> gradeSubjectIds(String t, long gradeId) throws Exception {
        List<Long> out = new ArrayList<>();
        for (JsonNode g : send("GET", "/api/v1/grades", t, null).json(json)) if (g.path("id").asLong() == gradeId) g.path("subjectIds").forEach(x -> out.add(x.asLong()));
        return out;
    }

    JsonNode examRowOf(JsonNode rows, long gradeId, long subjectId) {
        for (JsonNode r : rows) if (r.path("gradeId").asLong() == gradeId && r.path("subjectId").asLong() == subjectId) return r;
        return null;
    }

    Resp putGradeSubjects(String t, long gradeId, List<Long> ids) throws Exception {
        return send("PUT", "/api/v1/grades/" + gradeId + "/subjects", t, json.writeValueAsString(Map.of("subjectIds", ids)));
    }

    Resp putSubScores(String t, long exam, long classId, long subjectId, String scoresJson) throws Exception {
        return send("PUT", "/api/v1/examinations/" + exam + "/scores", t, "{\"classId\":" + classId + ",\"subjectId\":" + subjectId + ",\"scores\":" + scoresJson + "}");
    }

    @Test @Order(63)
    void subjectsHaveSubSubjectsAnExaminationKeepsItsOwnStructureAndOnlyMainSubjectsAreCounted() throws Exception {
        String t = login("admin.sokha", PW3).json(json).path("token").asString();   // the test before this one moved the clock on, which ends the older sessions
        if ("CLOSED".equals(jdbc.queryForObject("select status from academic_years where id = ?", String.class, p3Year))) {
            assertThat(send("POST", "/api/v1/academic-years/" + p3Year + "/reopen", t, null).status()).isEqualTo(200);
        }
        Map<String, Long> seeded = new HashMap<>();
        send("GET", "/api/v1/subjects", t, null).json(json).forEach(s -> seeded.put(s.path("code").asString(), s.path("id").asLong()));
        long grade1 = gradeIdFor(t, 1), grade2 = gradeIdFor(t, 2), grade3 = gradeIdFor(t, 3);

        // ---- the catalogue: two levels, names unique among siblings, offered to the grades the main subject is offered to
        long main = newSubject(t, "មុខវិជ្ជាក្រុម", null);
        long s1 = newSubject(t, "ផ្នែក ១", main), s2 = newSubject(t, "ផ្នែក ២", main), s3 = newSubject(t, "ផ្នែក ៣", main);
        assertThat(subjectNode(t, s1).path("parentId").asLong()).isEqualTo(main);
        assertThat(subjectNode(t, main).path("parentId").isNull()).as("a main subject has no parent").isTrue();
        assertThat(fieldCodes(send("POST", "/api/v1/subjects", t, "{\"nameKm\":\"ក្រោមផ្នែក\",\"parentId\":" + s1 + "}"))).as("a sub-subject cannot have sub-subjects").containsExactly("parentId:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/subjects", t, "{\"nameKm\":\"គ្មានម្ចាស់\",\"parentId\":999999}"))).containsExactly("parentId:INVALID");
        assertThat(code(send("POST", "/api/v1/subjects", t, "{\"nameKm\":\"ផ្នែក ១\",\"parentId\":" + main + "}"))).as("the same name twice under one main subject").isEqualTo("DUPLICATE");
        assertThat(code(send("POST", "/api/v1/subjects", t, j("nameKm", "មុខវិជ្ជាក្រុម")))).as("the same name twice among the main subjects").isEqualTo("DUPLICATE");
        long other = newSubject(t, "មុខវិជ្ជាមួយទៀត", null);
        newSubject(t, "ផ្នែក ១", other);   // the same name under ANOTHER main subject is fine
        for (int level = 1; level <= 6; level++) assertThat(gradeSubjectIds(t, gradeIdFor(t, level))).as("grade " + level).contains(main, s1, s2, s3);

        List<Long> grade3Now = gradeSubjectIds(t, grade3);
        List<Long> withoutMain = new ArrayList<>(grade3Now);
        withoutMain.remove(main);
        assertThat(fieldCodes(putGradeSubjects(t, grade3, withoutMain))).as("sub-subjects of a main subject the grade does not study").containsExactly("subjectIds:SUB_WITHOUT_MAIN");
        List<Long> grade3Narrow = new ArrayList<>(grade3Now);
        grade3Narrow.removeAll(List.of(main, s1, s2, s3));
        assertThat(putGradeSubjects(t, grade3, grade3Narrow).status()).as("main subject and its sub-subjects taken out together").isEqualTo(200);

        assertThat(fieldCodes(send("POST", "/api/v1/homework", t, json.writeValueAsString(Map.of("classId", p3Class, "subjectId", 999999, "title", "ក", "assignedDate", "2026-11-02", "dueDate", "2026-11-04")))))
                .as("a subject that does not exist (homework may be about a main subject or a sub-subject since V9: Order 65)").containsExactly("subjectId:INVALID");
        // the two-level rule also holds in the database itself, for any statement that bypasses the service
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("INSERT INTO subjects (code, name_km, sort_order, parent_id, created_at, updated_at) VALUES ('X-1', 'x', 99, ?, 'now', 'now')", s1))
                .hasMessageContaining("SUBJECT_PARENT_INVALID");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("UPDATE subjects SET parent_id = ? WHERE id = ?", main, other)).as("a main subject that has sub-subjects cannot become one")
                .hasMessageContaining("SUBJECT_PARENT_INVALID");

        // ---- an examination copies the structure: sub-subjects are rows of their own under the main subject, never rows beside it
        long exam = send("POST", "/api/v1/examinations", t, json.writeValueAsString(Map.of("academicYearId", p3Year, "nameKm", "ប្រឡងមុខវិជ្ជាក្រុម", "kind", "MONTHLY", "termNo", 2))).json(json).path("id").asLong();
        assertThat(send("GET", "/api/v1/examinations/" + exam, t, null).json(json).path("frozen").asBoolean()).isFalse();
        String subjectsUrl = "/api/v1/examinations/" + exam + "/subjects";
        JsonNode rows = send("GET", subjectsUrl, t, null).json(json);
        JsonNode m2 = examRowOf(rows, grade2, main);
        assertThat(m2.path("scoreSource").asString()).isEqualTo("SUB_SUBJECTS");
        assertThat(m2.path("subSubjects").size()).isEqualTo(3);
        assertThat(num(m2.path("maxScore"))).as("the sum of three placeholder maxima").isEqualByComparingTo("300");
        assertThat(examRowOf(rows, grade3, main)).as("grade 3 does not study it").isNull();
        for (JsonNode r : rows) assertThat(r.path("subjectId").asLong()).as("a sub-subject is never a main-subject row").isNotIn(s1, s2, s3);
        assertThat(examRowOf(rows, grade2, seeded.get("ART")).path("scoreSource").asString()).isEqualTo("DIRECT");

        // keep only the new main subject and Art for grade 2 (and take Art to 20)
        for (JsonNode r : rows) {
            if (r.path("gradeId").asLong() != grade2) continue;
            long sid = r.path("subjectId").asLong();
            if (sid == main || sid == seeded.get("ART")) continue;
            assertThat(send("DELETE", subjectsUrl + "/" + r.path("id").asLong(), t, null).status()).isEqualTo(204);
        }
        long rowMain = m2.path("id").asLong();
        long rowArt = examRowOf(send("GET", subjectsUrl, t, null).json(json), grade2, seeded.get("ART")).path("id").asLong();
        assertThat(send("PUT", subjectsUrl + "/" + rowArt, t, "{\"maxScore\":20,\"weight\":1}").status()).isEqualTo(200);
        // the sub-subjects' maxima: 10, 10, 20 (the main subject becomes 40)
        long[] subRow = new long[3];
        int[] subMax = {10, 10, 20};
        for (int i = 0; i < 3; i++) {
            subRow[i] = m2.path("subSubjects").get(i).path("id").asLong();
            assertThat(send("PUT", "/api/v1/examinations/" + exam + "/sub-subjects/" + subRow[i], t, "{\"maxScore\":" + subMax[i] + "}").status()).isEqualTo(200);
        }
        m2 = examRowOf(send("GET", subjectsUrl, t, null).json(json), grade2, main);
        assertThat(num(m2.path("maxScore"))).as("the main subject is the sum of its sub-subjects").isEqualByComparingTo("40");
        assertThat(fieldCodes(send("PUT", subjectsUrl + "/" + rowMain, t, "{\"maxScore\":50,\"weight\":1}"))).as("its maximum is not typed").containsExactly("maxScore:DERIVED_MAXIMUM");
        assertThat(send("PUT", subjectsUrl + "/" + rowMain, t, "{\"maxScore\":40,\"weight\":1}").status()).as("its weight is").isEqualTo(200);

        // a sub-subject added to the examination afterwards, and taken out again, while nothing is entered
        long s4 = newSubject(t, "ផ្នែក ៤", main);
        Resp added = send("POST", "/api/v1/examinations/" + exam + "/sub-subjects", t, "{\"gradeId\":" + grade2 + ",\"subjectId\":" + s4 + ",\"maxScore\":5}");
        assertThat(added.status()).as(added.body()).isEqualTo(201);
        assertThat(num(added.json(json).path("maxScore"))).as("40 + 5").isEqualByComparingTo("45");
        assertThat(code(send("POST", "/api/v1/examinations/" + exam + "/sub-subjects", t, "{\"gradeId\":" + grade2 + ",\"subjectId\":" + s4 + ",\"maxScore\":5}"))).isEqualTo("DUPLICATE");
        assertThat(fieldCodes(send("POST", "/api/v1/examinations/" + exam + "/sub-subjects", t, "{\"gradeId\":" + grade2 + ",\"subjectId\":" + main + ",\"maxScore\":5}"))).as("a main subject is not added here").containsExactly("subjectId:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/examinations/" + exam + "/sub-subjects", t, "{\"gradeId\":" + grade3 + ",\"subjectId\":" + s4 + ",\"maxScore\":5}"))).as("its main subject is not in the examination for that grade").containsExactly("subjectId:MAIN_NOT_IN_EXAMINATION");
        assertThat(fieldCodes(send("POST", subjectsUrl, t, json.writeValueAsString(Map.of("gradeId", grade2, "subjectId", s1, "maxScore", 10, "weight", 1))))).as("a sub-subject joins through its main subject").containsExactly("subjectId:INVALID");
        long rowS4 = 0;
        for (JsonNode sub : added.json(json).path("subSubjects")) if (sub.path("subjectId").asLong() == s4) rowS4 = sub.path("id").asLong();
        assertThat(send("DELETE", "/api/v1/examinations/" + exam + "/sub-subjects/" + rowS4, t, null).status()).isEqualTo(204);
        assertThat(num(examRowOf(send("GET", subjectsUrl, t, null).json(json), grade2, main).path("maxScore"))).as("back to 40").isEqualByComparingTo("40");

        // ---- scores are typed at the lowest level; the main subject is the sum
        long c2 = send("POST", "/api/v1/classes", t, cls(p3Year, grade2, "ស", null, null, null)).json(json).path("schoolClass").path("id").asLong();
        long[] pupil = new long[3];
        String[] pupilName = {"សិស្ស ក្រុម ក", "សិស្ស ក្រុម ខ", "សិស្ស ក្រុម គ"};
        for (int i = 0; i < 3; i++) {
            long sid = send("POST", "/api/v1/students", t, studentBody(pupilName[i], i == 1 ? "FEMALE" : "MALE", "2018-01-0" + (i + 1), null, c2, false)).json(json).path("student").path("id").asLong();
            pupil[i] = jdbc.queryForObject("select id from enrollments where student_id = ? and status = 'ACTIVE'", Long.class, sid);
        }
        String sheet = "/api/v1/examinations/" + exam + "/scores?classId=" + c2 + "&subjectId=";
        assertThat(fieldCodes(send("GET", sheet + main, t, null))).as("a main subject made of sub-subjects is not typed").containsExactly("subjectId:ENTER_AT_SUB_SUBJECTS");
        JsonNode blank = send("GET", sheet + s1, t, null).json(json);
        assertThat(blank.path("subSubject").asBoolean()).isTrue();
        assertThat(num(blank.path("maxScore"))).isEqualByComparingTo("10");
        assertThat(blank.path("rows").size()).isEqualTo(3);
        assertThat(fieldCodes(putSubScores(t, exam, c2, s1, scores(pupil[0], 10.5, false)))).as("above the sub-subject's maximum").containsExactly("scores:OUT_OF_RANGE");

        assertThat(putSubScores(t, exam, c2, s1, scores(pupil[0], 8, false, pupil[1], 6, false, pupil[2], 10, false)).status()).isEqualTo(200);
        JsonNode frozenExam = send("GET", "/api/v1/examinations/" + exam, t, null).json(json);
        assertThat(frozenExam.path("frozen").asBoolean()).as("the first score of any kind freezes the structure").isTrue();
        assertThat(frozenExam.path("scoreCount").asInt()).isEqualTo(3);
        String resultsUrl = "/api/v1/examinations/" + exam + "/results?classId=" + c2;
        JsonNode partial = send("GET", resultsUrl, t, null).json(json);
        for (JsonNode s : partial.path("students")) {
            assertThat(s.path("complete").asBoolean()).as("the other sub-subjects and Art are not entered yet").isFalse();
            assertThat(s.path("rank").isNull()).isTrue();
        }
        assertThat(putSubScores(t, exam, c2, s2, scores(pupil[0], 7.5, false, pupil[1], null, true, pupil[2], 10, false)).status()).isEqualTo(200);
        assertThat(putSubScores(t, exam, c2, s3, scores(pupil[0], 15, false, pupil[1], 12, false, pupil[2], 20, false)).status()).isEqualTo(200);
        assertThat(resultOf(send("GET", resultsUrl, t, null).json(json), pupil[0]).path("complete").asBoolean()).as("Art is still missing").isFalse();
        assertThat(putSubScores(t, exam, c2, seeded.get("ART"), scores(pupil[0], 17, false, pupil[1], 10, false, pupil[2], 20, false)).status()).isEqualTo(200);

        JsonNode res = send("GET", resultsUrl, t, null).json(json);
        assertThat(res.path("subjects").size()).as("two MAIN subjects: the sub-subjects are never counted on top").isEqualTo(2);
        JsonNode r1 = resultOf(res, pupil[0]), r2 = resultOf(res, pupil[1]), r3 = resultOf(res, pupil[2]);
        // pupil 1: (8 + 7.5 + 15) + 17 = 30.5 + 17 = 47.5 of 40 + 20 = 60 -> 79.17 %
        assertThat(num(r1.path("total"))).isEqualByComparingTo("47.5");
        assertThat(num(r1.path("totalMax"))).isEqualByComparingTo("60");
        assertThat(num(r1.path("percent"))).isEqualByComparingTo("79.17");
        assertThat(r1.path("scores").size()).isEqualTo(2);
        assertThat(r1.path("subScores").size()).isEqualTo(3);
        // pupil 2: absent in the second sub-subject counts 0: (6 + 0 + 12) + 10 = 28 of 60 -> 46.67 %
        assertThat(num(r2.path("total"))).isEqualByComparingTo("28");
        assertThat(num(r2.path("percent"))).isEqualByComparingTo("46.67");
        boolean absentSeen = false;
        for (JsonNode ss : r2.path("subScores")) if (ss.path("examSubSubjectId").asLong() == subRow[1]) absentSeen = ss.path("absent").asBoolean();
        assertThat(absentSeen).as("the detail still says the pupil was absent from that part").isTrue();
        assertThat(r3.path("percent").asInt()).isEqualTo(100);
        assertThat(List.of(r1.path("rank").asInt(), r2.path("rank").asInt(), r3.path("rank").asInt())).containsExactly(2, 3, 1);

        // ---- the structure is frozen from the first score; a maximum may still be corrected (not below a score entered)
        long mathId = seeded.get("MATH");
        assertThat(code(send("POST", subjectsUrl, t, json.writeValueAsString(Map.of("gradeId", grade2, "subjectId", mathId, "maxScore", 10, "weight", 1))))).isEqualTo("EXAM_STRUCTURE_FROZEN");
        assertThat(code(send("POST", "/api/v1/examinations/" + exam + "/sub-subjects", t, "{\"gradeId\":" + grade2 + ",\"subjectId\":" + s4 + ",\"maxScore\":5}"))).isEqualTo("EXAM_STRUCTURE_FROZEN");
        long rowGrade3 = examRowOf(rows, grade3, seeded.get("ART")).path("id").asLong();
        assertThat(code(send("DELETE", subjectsUrl + "/" + rowGrade3, t, null))).as("a row of another grade that has no score is frozen too").isEqualTo("EXAM_STRUCTURE_FROZEN");
        assertThat(code(send("DELETE", "/api/v1/examinations/" + exam + "/sub-subjects/" + subRow[0], t, null))).isEqualTo("EXAM_SUBJECT_HAS_SCORES");
        assertThat(code(send("DELETE", subjectsUrl + "/" + rowMain, t, null))).as("the sub-subjects' scores protect the main subject").isEqualTo("EXAM_SUBJECT_HAS_SCORES");
        assertThat(code(send("DELETE", "/api/v1/examinations/" + exam, t, null))).isEqualTo("EXAMINATION_HAS_SCORES");
        assertThat(fieldCodes(send("PUT", "/api/v1/examinations/" + exam + "/sub-subjects/" + subRow[0], t, "{\"maxScore\":9}"))).as("below the highest score entered (10)").containsExactly("maxScore:OUT_OF_RANGE");
        assertThat(send("PUT", "/api/v1/examinations/" + exam + "/sub-subjects/" + subRow[0], t, "{\"maxScore\":12}").status()).as("a correction is still allowed").isEqualTo(200);
        assertThat(num(examRowOf(send("GET", subjectsUrl, t, null).json(json), grade2, main).path("maxScore"))).isEqualByComparingTo("42");
        assertThat(send("PUT", "/api/v1/examinations/" + exam + "/sub-subjects/" + subRow[0], t, "{\"maxScore\":10}").status()).isEqualTo(200);

        // ---- the report card carries the detail under the main subject (the card shows it only when the school switches it on)
        String cardsUrl = "/api/v1/report-cards/data?examinationId=" + exam + "&classId=" + c2;
        JsonNode card1 = null;
        for (JsonNode card : send("GET", cardsUrl, t, null).json(json)) if (card.path("enrollmentId").asLong() == pupil[0]) card1 = card;
        assertThat(card1.path("subjects").size()).isEqualTo(2);
        for (JsonNode subject : card1.path("subjects")) {
            if (subject.path("subjectName").asString().equals("មុខវិជ្ជាក្រុម")) {
                assertThat(subject.path("subSubjects").size()).isEqualTo(3);
                assertThat(subject.path("subSubjects").get(0).path("subjectName").asString()).isEqualTo("ផ្នែក ១");
                assertThat(num(subject.path("subSubjects").get(2).path("score"))).isEqualByComparingTo("15");
            } else {
                assertThat(subject.path("subSubjects").size()).as("Art has no sub-subjects").isZero();
            }
        }
        assertThat(send("GET", "/api/v1/settings/app", t, null).json(json).path("card.showSubSubjects").asString()).isEqualTo("false");
        assertThat(send("PUT", "/api/v1/settings/app", t, j("card.showSubSubjects", "true")).json(json).path("card.showSubSubjects").asString()).isEqualTo("true");
        assertThat(send("PUT", "/api/v1/settings/app", t, j("card.showSubSubjects", "maybe")).status()).isEqualTo(422);
        assertThat(send("PUT", "/api/v1/settings/app", t, j("card.showSubSubjects", "false")).json(json).path("card.showSubSubjects").asString()).isEqualTo("false");

        // ---- history is preserved: whatever the subject list does afterwards, this examination's results, report cards and rows are byte for byte the same
        String resultsBefore = send("GET", resultsUrl, t, null).body();
        String cardsBefore = send("GET", cardsUrl, t, null).body();
        String rowsBefore = send("GET", subjectsUrl, t, null).body();
        assertThat(send("PUT", "/api/v1/subjects/" + main, t, "{\"nameKm\":\"មុខវិជ្ជាក្រុម (ឈ្មោះថ្មី)\",\"version\":" + subjectNode(t, main).path("version").asLong() + "}").status()).as("a rename").isEqualTo(200);
        assertThat(send("PUT", "/api/v1/subjects/" + s1, t, "{\"nameKm\":\"ផ្នែក ១ (ថ្មី)\",\"version\":" + subjectNode(t, s1).path("version").asLong() + "}").status()).isEqualTo(200);
        assertThat(send("PUT", "/api/v1/subjects/" + s2 + "/active", t, "{\"active\":false,\"version\":" + subjectNode(t, s2).path("version").asLong() + "}").status()).as("a sub-subject switched off").isEqualTo(200);
        long s5 = newSubject(t, "ផ្នែក ៥", main);
        List<Long> grade2Now = gradeSubjectIds(t, grade2);
        grade2Now.removeAll(List.of(main, s1, s2, s3, s4, s5));
        assertThat(putGradeSubjects(t, grade2, grade2Now).status()).as("grade 2 stops studying it").isEqualTo(200);
        assertThat(send("GET", resultsUrl, t, null).body()).as("results").isEqualTo(resultsBefore);
        assertThat(send("GET", cardsUrl, t, null).body()).as("report cards").isEqualTo(cardsBefore);
        assertThat(send("GET", subjectsUrl, t, null).body()).as("the examination's own rows, with the names it was set up with").isEqualTo(rowsBefore);

        // ... and only an examination created afterwards sees the new list
        long later = send("POST", "/api/v1/examinations", t, json.writeValueAsString(Map.of("academicYearId", p3Year, "nameKm", "ប្រឡងក្រោយការប្តូរ", "kind", "MONTHLY", "termNo", 3))).json(json).path("id").asLong();
        JsonNode laterRows = send("GET", "/api/v1/examinations/" + later + "/subjects", t, null).json(json);
        assertThat(examRowOf(laterRows, grade2, main)).as("grade 2 no longer studies it").isNull();
        JsonNode g1 = examRowOf(laterRows, grade1, main);
        assertThat(g1.path("subjectName").asString()).isEqualTo("មុខវិជ្ជាក្រុម (ឈ្មោះថ្មី)");
        List<String> laterSubs = new ArrayList<>();
        g1.path("subSubjects").forEach(x -> laterSubs.add(x.path("subjectName").asString()));
        assertThat(laterSubs).as("the renamed one, the one added later, and not the one switched off").containsExactly("ផ្នែក ១ (ថ្មី)", "ផ្នែក ៣", "ផ្នែក ៤", "ផ្នែក ៥");

        List<String> actions = jdbc.queryForList("select distinct action from audit_logs", String.class);
        assertThat(actions).contains("EXAMINATION_SUB_SUBJECT_ADDED", "EXAMINATION_SUB_SUBJECT_UPDATED", "EXAMINATION_SUB_SUBJECT_REMOVED");
    }

    @Test @Order(64)
    void aSubjectNothingUsesCanBeRemovedBeforeOfficialUseAndAUsedOneOnlySwitchedOff() throws Exception {
        String t = login("admin.sokha", PW3).json(json).path("token").asString();
        long main = newSubject(t, "មុខវិជ្ជាសាកល្បងលុប", null);
        long sub = newSubject(t, "ផ្នែកសាកល្បងលុប", main);
        assertThat(subjectNode(t, main).path("inUse").asBoolean()).as("nothing refers to a new subject").isFalse();
        assertThat(code(send("DELETE", "/api/v1/subjects/" + main, t, null))).as("sub-subjects first").isEqualTo("SUBJECT_HAS_SUB_SUBJECTS");
        assertThat(jdbc.queryForObject("select count(*) from grade_subjects where subject_id = ?", Integer.class, sub)).as("offered to the grades").isEqualTo(6);

        assertThat(send("DELETE", "/api/v1/subjects/" + sub, t, null).status()).isEqualTo(204);
        assertThat(jdbc.queryForObject("select count(*) from grade_subjects where subject_id = ?", Integer.class, sub)).as("its grade rows go with it").isZero();
        assertThat(jdbc.queryForObject("select count(*) from subjects where id = ?", Integer.class, sub)).isZero();
        assertThat(send("DELETE", "/api/v1/subjects/" + main, t, null).status()).as("now the main subject has none").isEqualTo(204);
        assertThat(code(send("DELETE", "/api/v1/subjects/" + main, t, null))).isEqualTo("NOT_FOUND");
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where action = 'SUBJECT_REMOVED'", Integer.class)).isEqualTo(2);

        // a subject an examination uses (as a main subject, or as a sub-subject), or that a class's teachers or homework refer to, is only switched off
        Map<String, Long> seeded = new HashMap<>();
        send("GET", "/api/v1/subjects", t, null).json(json).forEach(s -> seeded.put(s.path("code").asString(), s.path("id").asLong()));
        assertThat(subjectNode(t, seeded.get("KHMER")).path("inUse").asBoolean()).isTrue();
        assertThat(code(send("DELETE", "/api/v1/subjects/" + seeded.get("KHMER"), t, null))).isEqualTo("SUBJECT_IN_USE");
        long usedSub = jdbc.queryForObject("select subject_id from examination_sub_subjects limit 1", Long.class);
        assertThat(subjectNode(t, usedSub).path("inUse").asBoolean()).as("used as a sub-subject of an examination").isTrue();
        assertThat(code(send("DELETE", "/api/v1/subjects/" + usedSub, t, null))).isEqualTo("SUBJECT_IN_USE");
        long homeworkOnly = newSubject(t, "មុខវិជ្ជាមានកិច្ចការផ្ទះ", null);
        assertThat(send("POST", "/api/v1/homework", t, json.writeValueAsString(Map.of("classId", p3Class, "subjectId", homeworkOnly, "title", "ក", "assignedDate", "2026-11-02", "dueDate", "2026-11-04"))).status()).isEqualTo(201);
        assertThat(code(send("DELETE", "/api/v1/subjects/" + homeworkOnly, t, null))).as("homework refers to it").isEqualTo("SUBJECT_IN_USE");
        assertThat(code(send("DELETE", "/api/v1/subjects/999999", t, null))).isEqualTo("NOT_FOUND");
        assertThat(send("DELETE", "/api/v1/subjects/" + seeded.get("ART"), null, null).status()).as("not signed in").isEqualTo(401);
    }

    // ---- V9: homework marks, an independent module --------------------------------------------------------------------

    String hwBody(long classId, long subjectId, String title, String maxScore, Long version) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("classId", classId);
        m.put("subjectId", subjectId);
        m.put("title", title);
        m.put("assignedDate", "2026-11-02");
        m.put("dueDate", "2026-11-04");
        m.put("maxScore", maxScore == null ? null : new java.math.BigDecimal(maxScore));
        if (version != null) m.put("version", version);
        return json.writeValueAsString(m);
    }

    /** {@code entries} are {enrollmentId, status, score (a String or null), remark}. */
    String hwRecords(Object[]... entries) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Object[] e : entries) {
            java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("enrollmentId", e[0]);
            m.put("status", e[1]);
            m.put("score", e[2] == null ? null : new java.math.BigDecimal((String) e[2]));
            m.put("remark", e[3]);
            list.add(m);
        }
        return json.writeValueAsString(Map.of("records", list));
    }

    JsonNode hwItem(String t, long id) throws Exception { return send("GET", "/api/v1/homework/" + id, t, null).json(json); }

    JsonNode hwRow(JsonNode sheet, long enrollmentId) {
        for (JsonNode r : sheet.path("rows")) if (r.path("enrollmentId").asLong() == enrollmentId) return r;
        throw new AssertionError("no row for enrollment " + enrollmentId);
    }

    @Test @Order(65)
    void homeworkIsAnIndependentModuleWithMarksStatusesAndRemarksAndNeverTouchesAnExamination() throws Exception {
        String t = login("admin.sokha", PW3).json(json).path("token").asString();
        Map<String, Long> seeded = new HashMap<>();
        send("GET", "/api/v1/subjects", t, null).json(json).forEach(s -> seeded.put(s.path("code").asString(), s.path("id").asLong()));
        long art = seeded.get("ART");
        // the class and the examination of the sub-subject test (Order 63): three pupils with real examination scores
        long exam = jdbc.queryForObject("select id from examinations where name_km = 'ប្រឡងមុខវិជ្ជាក្រុម'", Long.class);
        long c2 = jdbc.queryForObject("select id from classes where academic_year_id = ? and grade_id = ? and name_km = 'ស'", Long.class, p3Year, gradeIdFor(t, 2));
        List<Long> enr = jdbc.queryForList("select id from enrollments where class_id = ? order by id", Long.class, c2);
        List<Long> stu = jdbc.queryForList("select student_id from enrollments where class_id = ? order by id", Long.class, c2);
        assertThat(enr).hasSize(3);
        Map<String, Object> subRow = jdbc.queryForMap("select id, parent_id from subjects where parent_id is not null order by id limit 1");
        long sub = ((Number) subRow.get("id")).longValue(), mainOfSub = ((Number) subRow.get("parent_id")).longValue();

        // ---- what an examination shows before any homework mark exists: kept to prove nothing below can reach it
        String resultsUrl = "/api/v1/examinations/" + exam + "/results?classId=" + c2;
        String cardsUrl = "/api/v1/report-cards/data?examinationId=" + exam + "&classId=" + c2;
        String resultsBefore = send("GET", resultsUrl, t, null).body();
        String cardsBefore = send("GET", cardsUrl, t, null).body();
        String examsBefore = send("GET", "/api/v1/examinations?yearId=" + p3Year, t, null).body();
        int examScoresBefore = jdbc.queryForObject("select (select count(*) from student_scores) + (select count(*) from sub_subject_scores)", Integer.class);

        // ---- an assignment with marks about a SUB-SUBJECT, and one without marks about a main subject
        assertThat(fieldCodes(send("POST", "/api/v1/homework", t, hwBody(c2, 999999, "ក", "10", null)))).as("a subject that does not exist").containsExactly("subjectId:INVALID");
        assertThat(fieldCodes(send("POST", "/api/v1/homework", t, hwBody(c2, sub, "ក", "0", null)))).as("a maximum above zero").containsExactly("maxScore:OUT_OF_RANGE");
        assertThat(fieldCodes(send("POST", "/api/v1/homework", t, hwBody(c2, sub, "ក", "100000.01", null)))).as("a sane upper limit").containsExactly("maxScore:OUT_OF_RANGE");
        assertThat(fieldCodes(send("POST", "/api/v1/homework", t, hwBody(c2, sub, "ក", "10.123", null)))).as("two decimals at most").containsExactly("maxScore:INVALID_NUMBER");
        Resp createdA = send("POST", "/api/v1/homework", t, hwBody(c2, sub, "កិច្ចការមានពិន្ទុ", "10", null));
        assertThat(createdA.status()).as(createdA.body()).isEqualTo(201);
        long hwA = createdA.json(json).path("id").asLong();
        Resp createdB = send("POST", "/api/v1/homework", t, hwBody(c2, art, "កិច្ចការគ្មានពិន្ទុ", null, null));
        assertThat(createdB.status()).isEqualTo(201);
        long hwB = createdB.json(json).path("id").asLong();
        JsonNode a = hwItem(t, hwA), b = hwItem(t, hwB);
        assertThat(num(a.path("maxScore"))).isEqualByComparingTo("10");
        assertThat(a.path("subjectId").asLong()).isEqualTo(sub);
        assertThat(a.path("parentSubjectId").asLong()).as("shown as main subject > sub-subject").isEqualTo(mainOfSub);
        assertThat(a.path("parentSubjectName").asString()).isNotBlank();
        assertThat(b.path("maxScore").isNull()).as("a homework without marks").isTrue();
        assertThat(b.path("parentSubjectId").isNull()).isTrue();
        assertThat(a.path("studentCount").asInt()).isEqualTo(3);
        assertThat(a.path("submittedCount").asInt() + a.path("lateCount").asInt() + a.path("notSubmittedCount").asInt() + a.path("excusedCount").asInt() + a.path("markedCount").asInt()).isZero();
        assertThat(code(send("DELETE", "/api/v1/subjects/" + sub, t, null))).as("homework about a sub-subject keeps it from being removed").isEqualTo("SUBJECT_IN_USE");

        // ---- the sheet starts blank: every student of the class, no status, no mark, no remark
        String recUrl = "/api/v1/homework/" + hwA + "/records";
        JsonNode sheet0 = send("GET", recUrl, t, null).json(json);
        assertThat(sheet0.path("rows").size()).isEqualTo(3);
        for (JsonNode r : sheet0.path("rows")) assertThat(r.path("status").isNull() && r.path("score").isNull() && r.path("remark").isNull()).isTrue();

        // ---- the refusals
        assertThat(fieldCodes(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(0), null, "8", null})))).as("a mark needs a status").containsExactly("records:INVALID");
        assertThat(fieldCodes(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(0), "NOT_SUBMITTED", "8", null})))).as("work that was not handed in has no mark").containsExactly("records:INVALID");
        assertThat(fieldCodes(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(0), "EXCUSED", "8", null})))).containsExactly("records:INVALID");
        assertThat(fieldCodes(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(0), "SUBMITTED", "10.5", null})))).as("above the maximum").containsExactly("records:OUT_OF_RANGE");
        assertThat(fieldCodes(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(0), "SUBMITTED", "7.123", null})))).containsExactly("records:INVALID_NUMBER");
        assertThat(fieldCodes(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(0), "SUBMITTED", "-1", null})))).as("not negative").containsExactly("records:INVALID_NUMBER");
        assertThat(fieldCodes(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(0), "MAYBE", null, null})))).as("an unknown status").containsExactly("records:INVALID");
        assertThat(fieldCodes(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(0), "SUBMITTED", null, null}, new Object[]{enr.get(0), "LATE", null, null})))).as("one student twice").containsExactly("records:INVALID");
        long strangerEnrollment = jdbc.queryForObject("select min(id) from enrollments where class_id <> ?", Long.class, c2);
        assertThat(fieldCodes(send("PUT", recUrl, t, hwRecords(new Object[]{strangerEnrollment, "SUBMITTED", null, null})))).as("a student of another class").containsExactly("records:INVALID");
        assertThat(fieldCodes(send("PUT", "/api/v1/homework/" + hwB + "/records", t, hwRecords(new Object[]{enr.get(0), "SUBMITTED", "5", null})))).as("a homework without marks cannot have one").containsExactly("records:NO_MAXIMUM");
        assertThat(send("PUT", recUrl, null, hwRecords(new Object[]{enr.get(0), "SUBMITTED", null, null})).status()).as("not signed in").isEqualTo(401);
        assertThat(jdbc.queryForObject("select count(*) from homework_records", Integer.class)).as("every refusal saved nothing").isZero();

        // ---- three students: handed in with a mark, late with a mark, not handed in with a remark
        Resp saved = send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(0), "SUBMITTED", "8.5", "ល្អ"}, new Object[]{enr.get(1), "LATE", "6", null},
                new Object[]{enr.get(2), "NOT_SUBMITTED", null, "ភ្លេចយកមក"}));
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        JsonNode sheet1 = saved.json(json);
        assertThat(hwRow(sheet1, enr.get(0)).path("status").asString()).isEqualTo("SUBMITTED");
        assertThat(num(hwRow(sheet1, enr.get(0)).path("score"))).isEqualByComparingTo("8.5");
        assertThat(hwRow(sheet1, enr.get(0)).path("remark").asString()).isEqualTo("ល្អ");
        assertThat(hwRow(sheet1, enr.get(2)).path("score").isNull()).as("not handed in: no mark, and never a 0").isTrue();
        assertThat(hwRow(sheet1, enr.get(2)).path("remark").asString()).isEqualTo("ភ្លេចយកមក");
        a = hwItem(t, hwA);
        assertThat(List.of(a.path("submittedCount").asInt(), a.path("lateCount").asInt(), a.path("notSubmittedCount").asInt(), a.path("excusedCount").asInt(), a.path("markedCount").asInt())).containsExactly(1, 1, 1, 0, 2);
        assertThat(num(a.path("scoreSum"))).as("8.5 + 6: the not-submitted student adds nothing, not even a zero").isEqualByComparingTo("14.5");

        // a status and a remark without any mark on the homework that has none
        assertThat(send("PUT", "/api/v1/homework/" + hwB + "/records", t, hwRecords(new Object[]{enr.get(0), "SUBMITTED", null, null}, new Object[]{enr.get(1), "EXCUSED", null, "ឈឺ"})).status()).isEqualTo(200);
        b = hwItem(t, hwB);
        assertThat(List.of(b.path("submittedCount").asInt(), b.path("excusedCount").asInt(), b.path("markedCount").asInt())).containsExactly(1, 1, 0);
        // a remark alone is a record too
        assertThat(send("PUT", "/api/v1/homework/" + hwB + "/records", t, hwRecords(new Object[]{enr.get(2), null, null, "ត្រូវប្រាប់មាតាបិតា"})).status()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from homework_records where homework_id = ?", Integer.class, hwB)).isEqualTo(3);

        // ---- a correction keeps the old value in the history (the status and hundredths only), a cleared record is deleted and also kept there
        assertThat(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(0), "SUBMITTED", "9", "ល្អ"})).status()).isEqualTo(200);
        String corrected = jdbc.queryForObject("select before_json || ' > ' || after_json from audit_logs where action = 'HOMEWORK_RECORD_CORRECTED' order by id desc limit 1", String.class);
        assertThat(corrected).contains("\"scoreX100\":850").contains("\"scoreX100\":900").doesNotContain("ល្អ");
        assertThat(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(2), null, null, null})).status()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from homework_records where homework_id = ? and enrollment_id = ?", Integer.class, hwA, enr.get(2))).as("an empty entry clears the record").isZero();
        assertThat(jdbc.queryForObject("select before_json from audit_logs where action = 'HOMEWORK_RECORD_CLEARED' order by id desc limit 1", String.class)).contains("NOT_SUBMITTED");
        assertThat(hwRow(send("GET", recUrl, t, null).json(json), enr.get(2)).path("status").isNull()).as("back to not recorded").isTrue();
        // the same save again changes nothing and adds nothing to the history
        int auditBefore = jdbc.queryForObject("select count(*) from audit_logs", Integer.class);
        assertThat(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(0), "SUBMITTED", "9", "ល្អ"})).status()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs", Integer.class)).as("nothing changed, nothing recorded").isEqualTo(auditBefore);

        // ---- what may and may not change once marks exist
        assertThat(fieldCodes(send("PUT", "/api/v1/homework/" + hwA, t, hwBody(c2, sub, "កិច្ចការមានពិន្ទុ", null, hwItem(t, hwA).path("version").asLong())))).as("marks cannot be switched off").containsExactly("maxScore:HOMEWORK_HAS_MARKS");
        assertThat(fieldCodes(send("PUT", "/api/v1/homework/" + hwA, t, hwBody(c2, sub, "កិច្ចការមានពិន្ទុ", "8", hwItem(t, hwA).path("version").asLong())))).as("not below a mark already entered (9)").containsExactly("maxScore:OUT_OF_RANGE");
        assertThat(fieldCodes(send("PUT", "/api/v1/homework/" + hwA, t, hwBody(p3Class, sub, "កិច្ចការមានពិន្ទុ", "10", hwItem(t, hwA).path("version").asLong())))).as("the records belong to the students of the first class").containsExactly("classId:HOMEWORK_HAS_RECORDS");
        Resp corrMax = send("PUT", "/api/v1/homework/" + hwA, t, hwBody(c2, sub, "កិច្ចការមានពិន្ទុ", "12", hwItem(t, hwA).path("version").asLong()));
        assertThat(corrMax.status()).as("a correction of the maximum is allowed").isEqualTo(200);
        assertThat(num(corrMax.json(json).path("maxScore"))).isEqualByComparingTo("12");
        // a homework that had no marks can be given them later
        Resp later = send("PUT", "/api/v1/homework/" + hwB, t, hwBody(c2, art, "កិច្ចការគ្មានពិន្ទុ", "5", hwItem(t, hwB).path("version").asLong()));
        assertThat(later.status()).isEqualTo(200);
        assertThat(num(later.json(json).path("maxScore"))).isEqualByComparingTo("5");
        assertThat(send("PUT", "/api/v1/homework/" + hwB + "/records", t, hwRecords(new Object[]{enr.get(0), "LATE", "4", null})).status()).as("and then it takes a mark").isEqualTo(200);

        // ---- the database refuses what the service would, for any statement that bypasses the service
        String now = "2026-11-05T00:00:00Z";
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (?, ?, 'NOT_SUBMITTED', 100, NULL, ?, ?)", hwA, enr.get(2), now, now))
                .as("a mark on work that was not handed in").hasMessageContaining("CHECK");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (?, ?, NULL, 100, NULL, ?, ?)", hwA, enr.get(2), now, now))
                .as("a mark without a status").hasMessageContaining("CHECK");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (?, ?, NULL, NULL, NULL, ?, ?)", hwA, enr.get(2), now, now))
                .as("a record with nothing in it").hasMessageContaining("CHECK");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (?, ?, 'SUBMITTED', NULL, NULL, ?, ?)", hwA, enr.get(0), now, now))
                .as("one record per student and assignment").hasMessageContaining("UNIQUE");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("UPDATE homework SET max_score_x100 = 0 WHERE id = ?", hwA)).as("a maximum above zero").hasMessageContaining("CHECK");

        // ---- the history of one student: every assignment of their classes, newest due date first, with their own record or none
        assertThat(send("GET", "/api/v1/homework/by-student/" + stu.get(0), null, null).status()).isEqualTo(401);
        assertThat(code(send("GET", "/api/v1/homework/by-student/999999", t, null))).isEqualTo("NOT_FOUND");
        JsonNode history0 = send("GET", "/api/v1/homework/by-student/" + stu.get(0), t, null).json(json);
        assertThat(history0.size()).isEqualTo(2);
        JsonNode hA0 = null, hB0 = null;
        for (JsonNode h : history0) { if (h.path("homeworkId").asLong() == hwA) hA0 = h; else if (h.path("homeworkId").asLong() == hwB) hB0 = h; }
        assertThat(hA0.path("status").asString()).isEqualTo("SUBMITTED");
        assertThat(num(hA0.path("score"))).isEqualByComparingTo("9");
        assertThat(num(hA0.path("maxScore"))).isEqualByComparingTo("12");
        assertThat(hA0.path("parentSubjectName").asString()).as("main subject > sub-subject").isNotBlank();
        assertThat(hB0.path("status").asString()).isEqualTo("LATE");
        JsonNode history2 = send("GET", "/api/v1/homework/by-student/" + stu.get(2), t, null).json(json);
        for (JsonNode h : history2) if (h.path("homeworkId").asLong() == hwA) assertThat(h.path("status").isNull() && h.path("score").isNull()).as("cleared: not recorded").isTrue();

        // ---- the summary of a class over a period, optionally about one subject (a main subject includes its sub-subjects); cancelled homework is left out
        String summaryUrl = "/api/v1/homework/summary?classId=" + c2 + "&from=2026-11-01&to=2026-11-30";
        JsonNode sum = send("GET", summaryUrl, t, null).json(json);
        assertThat(sum.size()).isEqualTo(3);
        JsonNode s0 = null, s1 = null, s2 = null;
        for (JsonNode r : sum) { if (r.path("enrollmentId").asLong() == enr.get(0)) s0 = r; else if (r.path("enrollmentId").asLong() == enr.get(1)) s1 = r; else s2 = r; }
        assertThat(s0.path("assigned").asInt()).isEqualTo(2);
        assertThat(List.of(s0.path("submitted").asInt(), s0.path("late").asInt(), s0.path("notSubmitted").asInt(), s0.path("excused").asInt(), s0.path("marked").asInt())).as("A submitted (9), B late (4)").containsExactly(1, 1, 0, 0, 2);
        assertThat(num(s0.path("earned"))).isEqualByComparingTo("13");
        assertThat(num(s0.path("possible"))).as("12 + 5, only the homework that was marked").isEqualByComparingTo("17");
        assertThat(List.of(s1.path("late").asInt(), s1.path("excused").asInt(), s1.path("marked").asInt())).containsExactly(1, 1, 1);
        assertThat(num(s1.path("earned"))).isEqualByComparingTo("6");
        assertThat(num(s1.path("possible"))).isEqualByComparingTo("12");
        assertThat(s2.path("assigned").asInt()).isEqualTo(2);
        assertThat(s2.path("submitted").asInt() + s2.path("late").asInt() + s2.path("notSubmitted").asInt() + s2.path("excused").asInt()).as("only a remark on B, nothing on A").isZero();
        assertThat(num(s2.path("possible"))).isZero();
        JsonNode bySubject = send("GET", summaryUrl + "&subjectId=" + mainOfSub, t, null).json(json);
        for (JsonNode r : bySubject) assertThat(r.path("assigned").asInt()).as("the main subject includes its sub-subject's homework (A) and not Art's (B)").isEqualTo(1);
        assertThat(send("GET", "/api/v1/homework?classId=" + c2 + "&subjectId=" + mainOfSub, t, null).json(json).size()).isEqualTo(1);
        assertThat(send("GET", "/api/v1/homework?classId=" + c2 + "&subjectId=" + sub, t, null).json(json).size()).isEqualTo(1);
        assertThat(send("GET", "/api/v1/homework/summary?classId=" + c2 + "&from=2026-12-01&to=2026-12-31", t, null).json(json).get(0).path("assigned").asInt()).as("a period with none").isZero();
        assertThat(send("PUT", "/api/v1/homework/" + hwB + "/status", t, "{\"status\":\"CANCELLED\",\"version\":" + hwItem(t, hwB).path("version").asLong() + "}").status()).isEqualTo(200);
        for (JsonNode r : send("GET", summaryUrl, t, null).json(json)) assertThat(r.path("assigned").asInt()).as("a cancelled homework is not counted").isEqualTo(1);
        assertThat(code(send("GET", "/api/v1/homework/summary?classId=999999", t, null))).isEqualTo("NOT_FOUND");

        // ---- a closed academic year freezes the records like it freezes the assignment
        assertThat(send("POST", "/api/v1/academic-years/" + p3Year + "/close", t, null).status()).isEqualTo(200);
        try {
            assertThat(code(send("PUT", recUrl, t, hwRecords(new Object[]{enr.get(1), "SUBMITTED", "7", null})))).isEqualTo("ACADEMIC_YEAR_CLOSED");
            assertThat(send("GET", recUrl, t, null).status()).as("but it can still be read").isEqualTo(200);
        } finally {
            assertThat(send("POST", "/api/v1/academic-years/" + p3Year + "/reopen", t, null).status()).isEqualTo(200);
        }

        // ---- THE RULE: homework marks are never part of an examination. Nothing an examination shows has moved, byte for byte.
        assertThat(send("GET", resultsUrl, t, null).body()).as("results, ranks and totals").isEqualTo(resultsBefore);
        assertThat(send("GET", cardsUrl, t, null).body()).as("report-card data").isEqualTo(cardsBefore);
        assertThat(send("GET", "/api/v1/examinations?yearId=" + p3Year, t, null).body()).as("the examinations").isEqualTo(examsBefore);
        assertThat(jdbc.queryForObject("select (select count(*) from student_scores) + (select count(*) from sub_subject_scores)", Integer.class)).as("no examination score was added or removed").isEqualTo(examScoresBefore);
        assertThat(jdbc.queryForObject("select count(*) from homework_records", Integer.class)).isPositive();

        // ---- a student who leaves the class keeps their record (in the sheet and in their history); one who leaves with no record is no longer listed
        long leaver = send("POST", "/api/v1/students", t, studentBody("សិស្សចាកចេញមានកំណត់ត្រា", "MALE", "2018-02-01", null, c2, false)).json(json).path("student").path("id").asLong();
        long leaverEnrollment = jdbc.queryForObject("select id from enrollments where student_id = ? and status = 'ACTIVE'", Long.class, leaver);
        long quietLeaver = send("POST", "/api/v1/students", t, studentBody("សិស្សចាកចេញគ្មានកំណត់ត្រា", "MALE", "2018-02-02", null, c2, false)).json(json).path("student").path("id").asLong();
        long quietEnrollment = jdbc.queryForObject("select id from enrollments where student_id = ? and status = 'ACTIVE'", Long.class, quietLeaver);
        assertThat(send("GET", recUrl, t, null).json(json).path("rows").size()).as("three pupils and the two who have just joined").isEqualTo(5);
        assertThat(send("PUT", recUrl, t, hwRecords(new Object[]{leaverEnrollment, "SUBMITTED", "3", "មុនចាកចេញ"})).status()).isEqualTo(200);
        assertThat(send("POST", "/api/v1/enrollments/" + leaverEnrollment + "/leave", t, "{\"reason\":\"ផ្លាស់ទីលំនៅ\"}").status()).isEqualTo(200);
        assertThat(send("POST", "/api/v1/enrollments/" + quietEnrollment + "/leave", t, "{\"reason\":\"ផ្លាស់ទីលំនៅ\"}").status()).isEqualTo(200);
        JsonNode afterLeaving = send("GET", recUrl, t, null).json(json);
        assertThat(afterLeaving.path("rows").size()).as("the one with a record stays on the sheet, the one without is gone").isEqualTo(4);
        assertThat(hwRow(afterLeaving, leaverEnrollment).path("remark").asString()).isEqualTo("មុនចាកចេញ");
        assertThat(num(hwRow(afterLeaving, leaverEnrollment).path("score"))).isEqualByComparingTo("3");
        assertThat(afterLeaving.path("homework").path("studentCount").asInt()).as("the class count is the students still in it").isEqualTo(5 - 2);
        JsonNode leaverHistory = send("GET", "/api/v1/homework/by-student/" + leaver, t, null).json(json);
        assertThat(leaverHistory.size()).as("their history keeps what they have a record of").isEqualTo(1);
        assertThat(leaverHistory.get(0).path("homeworkId").asLong()).isEqualTo(hwA);
        assertThat(num(leaverHistory.get(0).path("score"))).isEqualByComparingTo("3");
        assertThat(send("GET", "/api/v1/homework/by-student/" + quietLeaver, t, null).json(json).size()).as("nothing to show for one who left with no record").isZero();
        assertThat(send("PUT", recUrl, t, hwRecords(new Object[]{leaverEnrollment, "LATE", "2", "កែ"})).status()).as("an existing record can still be corrected").isEqualTo(200);
        assertThat(fieldCodes(send("PUT", recUrl, t, hwRecords(new Object[]{quietEnrollment, "SUBMITTED", null, null})))).as("but a new one cannot be made for someone who has left").containsExactly("records:INVALID");

        List<String> actions = jdbc.queryForList("select distinct action from audit_logs", String.class);
        assertThat(actions).contains("HOMEWORK_RECORDS_SAVED", "HOMEWORK_RECORD_CORRECTED", "HOMEWORK_RECORD_CLEARED");
    }

    // ---- the secrets-in-the-log scan stays LAST -------------------------------------------------------------------

    @Test @Order(99)
    void workedFromAKhmerNamedFolderAndNoSecretEverReachedTheLogOrTheAuditTable() throws Exception {
        assertThat(DATA_ROOT.toString()).contains("ទិន្នន័យ").contains(" ");
        assertThat(Files.isRegularFile(DataDirs.database())).isTrue();

        Path log = DataDirs.logs().resolve("backend.log");
        assertThat(Files.isRegularFile(log)).isTrue();
        String logText = Files.readString(log, StandardCharsets.UTF_8);
        String audit = String.join("\n", jdbc.queryForList("select coalesce(actor,'')||' '||action||' '||coalesce(summary,'')||' '||coalesce(before_json,'')||' '||coalesce(after_json,'') from audit_logs", String.class));
        assertThat(SECRETS).as("3 passwords + 4 tokens + 3 keys x (formatted, normalized)").hasSize(13);
        for (String secret : SECRETS) {
            assertThat(logText).as("backend.log must not contain a secret").doesNotContain(secret);
            assertThat(audit).as("audit_logs must not contain a secret").doesNotContain(secret);
        }
        List<String> actions = jdbc.queryForList("select distinct action from audit_logs", String.class);
        assertThat(actions).contains("SETUP_ADMIN_CREATED", "LOGIN_LOCKED", "PASSWORD_CHANGED", "RECOVERY_LOCKED", "RECOVERY_USED",
                "RECOVERY_KEY_REGENERATED", "RECOVERY_KEY_CONFIRMED", "SCHOOL_SETTINGS_UPDATED", "ACADEMIC_YEAR_CREATED", "SETUP_COMPLETED",
                "ACADEMIC_YEAR_UPDATED", "ACADEMIC_YEAR_SET_CURRENT", "ACADEMIC_YEAR_CLOSED", "ACADEMIC_YEAR_REOPENED",
                "SUBJECT_CREATED", "SUBJECT_UPDATED", "GRADE_SUBJECTS_CHANGED",
                "TEACHER_CREATED", "TEACHER_UPDATED", "TEACHER_ACTIVE_CHANGED",
                "CLASS_CREATED", "CLASS_UPDATED", "CLASS_DELETED", "CLASS_TEACHERS_CHANGED",
                "STUDENT_CREATED", "STUDENT_UPDATED", "STUDENT_STATUS_CHANGED", "STUDENT_DELETED", "STUDENT_PHOTO_CHANGED", "STUDENT_PHOTO_REMOVED",
                "STUDENT_ENROLLED", "STUDENT_TRANSFERRED", "STUDENT_LEFT", "PROMOTION_APPLIED", "STUDENTS_EXPORTED",
                "ATTENDANCE_SAVED", "ATTENDANCE_CORRECTED", "GRADING_SCALE_CREATED", "GRADING_SCALE_UPDATED", "GRADING_SCALE_DEFAULT_CHANGED",
                "EXAMINATION_CREATED", "EXAMINATION_UPDATED", "EXAMINATION_DELETED", "EXAMINATION_SUBJECT_ADDED", "EXAMINATION_SUBJECT_UPDATED",
                "EXAMINATION_SUBJECT_REMOVED", "SCORES_SAVED", "SCORE_CORRECTED", "REPORT_COMMENT_SAVED", "HOMEWORK_CREATED", "HOMEWORK_UPDATED",
                "HOMEWORK_STATUS_CHANGED", "SCHOOL_EVENT_CREATED", "SCHOOL_EVENT_UPDATED", "SCHOOL_EVENT_DELETED", "APP_SETTINGS_UPDATED", "REPORT_EXPORTED",
                "FEE_CATEGORY_CREATED", "FEE_CATEGORY_UPDATED", "FEE_CATEGORY_ACTIVE_CHANGED", "FEE_CHARGED", "FEE_CHARGE_UPDATED", "FEE_CHARGE_DELETED",
                "PAYMENT_RECORDED", "PAYMENT_VOIDED",
                "BACKUP_CREATED", "BACKUP_VERIFIED", "BACKUP_DELETED", "BACKUP_COPIED", "RESTORE_STAGED", "RESTORE_REQUESTED", "RESTORE_CANCELLED",
                "ACCEPTANCE_SIGNED_OFF", "ACCEPTANCE_WITHDRAWN");
    }

    // ---- request bodies and lookups for the student, enrollment and promotion steps ------------------------------

    Map<String, Object> guardian(String name, String relationship, String phone, boolean primary) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("nameKm", name);
        m.put("relationship", relationship);
        m.put("phone", phone);
        m.put("primary", primary);
        return m;
    }

    @SafeVarargs
    final String studentBody(String name, String gender, String dob, String enrollDate, Long classId, boolean allowDuplicate, Map<String, Object>... guardians) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("nameKm", name);
        m.put("gender", gender);
        m.put("dateOfBirth", dob);
        m.put("enrollmentDate", enrollDate);
        m.put("classId", classId);
        m.put("allowDuplicate", allowDuplicate);
        m.put("guardians", List.of(guardians));
        return json.writeValueAsString(m);
    }

    @SafeVarargs
    final String studentUpdate(String name, String gender, String dob, String enrollDate, boolean allowDuplicate, long version, Map<String, Object>... guardians) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("nameKm", name);
        m.put("gender", gender);
        m.put("dateOfBirth", dob);
        m.put("enrollmentDate", enrollDate);
        m.put("allowDuplicate", allowDuplicate);
        m.put("version", version);
        m.put("guardians", List.of(guardians));
        return json.writeValueAsString(m);
    }

    String enrollBody(long studentId, long classId) { return json.writeValueAsString(Map.of("studentId", studentId, "classId", classId)); }

    JsonNode studentDetail(long id) throws Exception { return send("GET", "/api/v1/students/" + id, token4, null).json(json); }

    Resp setStudentStatus(long id, String status) throws Exception {
        long v = studentDetail(id).path("student").path("version").asLong();
        return send("PUT", "/api/v1/students/" + id + "/status", token4, json.writeValueAsString(Map.of("status", status, "version", v)));
    }

    long activeEnrollmentId(long studentId) throws Exception {
        for (JsonNode e : studentDetail(studentId).path("enrollments")) if (e.path("status").asString().equals("ACTIVE")) return e.path("enrollmentId").asLong();
        throw new AssertionError("student " + studentId + " has no active enrollment");
    }

    /** One field of every element of a JSON array response. */
    List<Long> longs(Resp r, String field) {
        assertThat(r.status()).as(r.body()).isEqualTo(200);
        List<Long> out = new ArrayList<>();
        r.json(json).forEach(n -> out.add(n.path(field).asLong()));
        return out;
    }

    List<Long> rosterStudents(long classId) throws Exception { return longs(send("GET", "/api/v1/classes/" + classId + "/students", token4, null), "studentId"); }

    Map<String, Object> dec(long enrollmentId, String outcome, Long toClassId) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("enrollmentId", enrollmentId);
        m.put("outcome", outcome);
        m.put("toClassId", toClassId);
        return m;
    }

    @SafeVarargs
    final String promoBody(long fromYear, long toYear, Map<String, Object>... decisions) {
        return json.writeValueAsString(Map.of("fromYearId", fromYear, "toYearId", toYear, "decisions", List.of(decisions)));
    }

    @SafeVarargs
    final Resp promote(boolean dryRun, long fromYear, long toYear, Map<String, Object>... decisions) throws Exception {
        return send("POST", "/api/v1/enrollments/promote?dryRun=" + dryRun, token4, promoBody(fromYear, toYear, decisions));
    }

    static byte[] png(int w, int h) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }

    /** status + code of one check of the deep health report. */
    Map<String, Object> deepCheck(String id) throws Exception {
        for (JsonNode c : send("POST", "/api/v1/system/health/deep", token4, null).json(json).path("checks")) {
            if (c.path("id").asString().equals(id)) return Map.of("status", c.path("status").asString(), "code", c.path("code").asString());
        }
        throw new AssertionError("no check " + id);
    }

    // ---- request bodies and lookups for the class steps ----------------------------------------------------------

    String cls(long year, long grade, String name, Integer capacity, Long teacher, String shift) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("academicYearId", year);
        m.put("gradeId", grade);
        m.put("nameKm", name);
        m.put("capacity", capacity);
        m.put("homeroomTeacherId", teacher);
        m.put("shift", shift);
        return json.writeValueAsString(m);
    }

    String clsUpdate(String name, Integer capacity, Long teacher, String shift, long version) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("nameKm", name);
        m.put("capacity", capacity);
        m.put("homeroomTeacherId", teacher);
        m.put("shift", shift);
        m.put("version", version);
        return json.writeValueAsString(m);
    }

    /** {"assignments":[{subjectId, teacherId}, ...]} from alternating subject / teacher ids. */
    String assignments(long... subjectThenTeacher) {
        List<Map<String, Long>> list = new ArrayList<>();
        for (int i = 0; i < subjectThenTeacher.length; i += 2) list.add(Map.of("subjectId", subjectThenTeacher[i], "teacherId", subjectThenTeacher[i + 1]));
        return json.writeValueAsString(Map.of("assignments", list));
    }

    long gradeIdOfLevel(int level) throws Exception {
        for (JsonNode g : send("GET", "/api/v1/grades", token4, null).json(json)) if (g.path("level").asInt() == level) return g.path("id").asLong();
        throw new AssertionError("no grade " + level);
    }

    Map<String, Long> subjectIdsByCode() throws Exception {
        Map<String, Long> out = new HashMap<>();
        send("GET", "/api/v1/subjects", token4, null).json(json).forEach(s -> out.put(s.path("code").asString(), s.path("id").asLong()));
        return out;
    }

    void setTeacherActive(long id, boolean active) throws Exception {
        long v = send("GET", "/api/v1/teachers/" + id, token4, null).json(json).path("version").asLong();
        assertThat(send("PUT", "/api/v1/teachers/" + id + "/active", token4, "{\"active\":" + active + ",\"version\":" + v + "}").status()).isEqualTo(200);
    }

    // ---- lookups used by the Phase 2 steps -----------------------------------------------------------------------

    static String enc(String s) { return java.net.URLEncoder.encode(s, StandardCharsets.UTF_8); }

    /** The "id" of every element of a JSON array response, in order. */
    List<Long> ids(Resp r) {
        assertThat(r.status()).as(r.body()).isEqualTo(200);
        List<Long> out = new ArrayList<>();
        r.json(json).forEach(n -> out.add(n.path("id").asLong()));
        return out;
    }

    JsonNode yearById(long id) throws Exception {
        for (JsonNode y : send("GET", "/api/v1/academic-years", token4, null).json(json)) if (y.path("id").asLong() == id) return y;
        throw new AssertionError("no academic year " + id);
    }

    long yearId(String nameKm) throws Exception {
        for (JsonNode y : send("GET", "/api/v1/academic-years", token4, null).json(json)) if (y.path("nameKm").asString().equals(nameKm)) return y.path("id").asLong();
        throw new AssertionError("no academic year named " + nameKm);
    }

    List<Long> currentYearIds() throws Exception {
        List<Long> ids = new ArrayList<>();
        for (JsonNode y : send("GET", "/api/v1/academic-years", token4, null).json(json)) if (y.path("current").asBoolean()) ids.add(y.path("id").asLong());
        return ids;
    }

    JsonNode gradeById(long id) throws Exception {
        for (JsonNode g : send("GET", "/api/v1/grades", token4, null).json(json)) if (g.path("id").asLong() == id) return g;
        throw new AssertionError("no grade " + id);
    }

    static List<Long> subjectIdsOf(JsonNode grade) {
        List<Long> ids = new ArrayList<>();
        grade.path("subjectIds").forEach(n -> ids.add(n.asLong()));
        return ids;
    }

    // ---- multipart / filesystem helpers --------------------------------------------------------------------------

    Resp upload(String path, String token, String filename, String mime, byte[] content) throws Exception {
        String boundary = "----sms" + System.nanoTime();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\nContent-Type: " + mime + "\r\n\r\n")
                .getBytes(StandardCharsets.UTF_8));
        out.write(content);
        out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return exec("POST", path, token, true, out.toByteArray(), "multipart/form-data; boundary=" + boundary, Map.of());
    }

    static List<String> list(Path dir) throws Exception {
        try (Stream<Path> s = Files.list(dir)) { return s.map(p -> p.getFileName().toString()).sorted().toList(); }
    }

    /** The highest V<n>__*.sql on the classpath: the version the database must be at, so a new migration never breaks this test. */
    static String latestMigrationVersion() throws Exception {
        return Arrays.stream(new PathMatchingResourcePatternResolver().getResources("classpath:db/migration/V*__*.sql"))
                .map(r -> r.getFilename().substring(1, r.getFilename().indexOf("__")))
                .max(Comparator.comparingInt(Integer::parseInt)).orElseThrow();
    }
}
