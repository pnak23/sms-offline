package kh.school.sms.people;

import kh.school.sms.audit.AuditService;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CreationHelper;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The student list as an Excel file, made locally by Apache POI. The backend never emits user-facing text (docs D16), so
 * the Khmer column titles and value names ("Male", "Active" ...) arrive from the UI in {@code labels}; a missing label
 * falls back to its key. Cells use "Khmer UI", a Khmer-capable font that ships with Windows.
 */
@Service
public class StudentExportService {
    private static final String FONT = "Khmer UI";
    private static final String[] COLUMNS = {"no", "code", "nameKm", "nameEn", "gender", "dateOfBirth", "grade", "class", "status",
            "guardian", "guardianPhone", "village", "commune", "district", "province", "address"};
    private static final int[] WIDTHS = {6, 14, 26, 24, 10, 14, 14, 12, 12, 24, 16, 18, 18, 18, 18, 36};

    private final StudentService students;
    private final StudentRepository repository;
    private final JdbcTemplate jdbc;
    private final AuditService audit;

    public StudentExportService(StudentService students, StudentRepository repository, JdbcTemplate jdbc, AuditService audit) {
        this.students = students;
        this.repository = repository;
        this.jdbc = jdbc;
        this.audit = audit;
    }

    public byte[] export(String q, String gender, String status, Long yearId, Long gradeId, Long classId, boolean unenrolled, Map<String, String> labels) {
        List<StudentQueries.StudentRow> rows = students.search(q, gender, status, yearId, gradeId, classId, unenrolled);
        Map<Long, Student> full = new HashMap<>();
        repository.findAllById(rows.stream().map(StudentQueries.StudentRow::id).toList()).forEach(s -> full.put(s.getId(), s));
        Map<Long, String[]> primary = new HashMap<>();   // student id -> {guardian name, phone}
        jdbc.query("SELECT student_id, name_km, phone FROM guardians WHERE is_primary = 1",
                rs -> { primary.put(rs.getLong(1), new String[]{rs.getString(2), rs.getString(3)}); });

        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Font base = wb.createFont();
            base.setFontName(FONT);
            base.setFontHeightInPoints((short) 11);
            Font bold = wb.createFont();
            bold.setFontName(FONT);
            bold.setFontHeightInPoints((short) 11);
            bold.setBold(true);

            CellStyle header = wb.createCellStyle();
            header.setFont(bold);
            header.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            header.setBorderBottom(BorderStyle.THIN);
            header.setVerticalAlignment(VerticalAlignment.CENTER);
            CellStyle text = wb.createCellStyle();
            text.setFont(base);
            text.setVerticalAlignment(VerticalAlignment.CENTER);
            CellStyle date = wb.createCellStyle();
            date.cloneStyleFrom(text);
            CreationHelper helper = wb.getCreationHelper();
            date.setDataFormat(helper.createDataFormat().getFormat("yyyy-mm-dd"));

            Sheet sheet = wb.createSheet(sheetName(label(labels, "sheet")));
            Row head = sheet.createRow(0);
            head.setHeightInPoints(24);
            for (int c = 0; c < COLUMNS.length; c++) {
                Cell cell = head.createCell(c);
                cell.setCellValue(label(labels, COLUMNS[c]));
                cell.setCellStyle(header);
                sheet.setColumnWidth(c, WIDTHS[c] * 256);
            }
            int r = 1;
            for (StudentQueries.StudentRow row : rows) {
                Student s = full.get(row.id());
                if (s == null) continue;
                String[] g = primary.get(row.id());
                Row line = sheet.createRow(r);
                line.setHeightInPoints(20);
                put(line, 0, text, r);
                put(line, 1, text, s.getStudentCode());
                put(line, 2, text, s.getNameKm());
                put(line, 3, text, s.getNameEn());
                put(line, 4, text, label(labels, s.getGender()));
                Cell dob = line.createCell(5);
                dob.setCellValue(s.getDateOfBirth());
                dob.setCellStyle(date);
                put(line, 6, text, row.gradeName());
                put(line, 7, text, row.className());
                put(line, 8, text, label(labels, s.getStatus()));
                put(line, 9, text, g == null ? null : g[0]);
                put(line, 10, text, g == null ? null : g[1]);   // a string cell: phone numbers keep their leading 0
                put(line, 11, text, s.getVillage());
                put(line, 12, text, s.getCommune());
                put(line, 13, text, s.getDistrict());
                put(line, 14, text, s.getProvince());
                put(line, 15, text, s.getAddress());
                r++;
            }
            sheet.createFreezePane(0, 1);
            sheet.setAutoFilter(new CellRangeAddress(0, Math.max(0, r - 1), 0, COLUMNS.length - 1));
            wb.write(out);
            audit.record("STUDENTS_EXPORTED", "student", null, "student list exported to Excel (" + (r - 1) + " rows)");
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void put(Row row, int col, CellStyle style, String value) {
        Cell cell = row.createCell(col);
        if (value != null) cell.setCellValue(value);
        cell.setCellStyle(style);
    }

    private static void put(Row row, int col, CellStyle style, double value) {
        Cell cell = row.createCell(col);
        cell.setCellValue(value);
        cell.setCellStyle(style);
    }

    private static String label(Map<String, String> labels, String key) {
        String v = labels == null ? null : labels.get(key);
        return v == null || v.isBlank() ? key : v;
    }

    /** Excel allows at most 31 characters and none of \ / ? * [ ] : in a sheet name. */
    static String sheetName(String raw) {
        String n = raw.replaceAll("[\\\\/?*\\[\\]:]", " ").trim();
        if (n.isEmpty()) n = "Students";
        return n.length() > 31 ? n.substring(0, 31) : n;
    }
}
