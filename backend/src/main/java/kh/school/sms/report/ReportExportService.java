package kh.school.sms.report;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.settings.SchoolSettings;
import kh.school.sms.settings.SchoolSettingsRepository;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CreationHelper;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Set;

/**
 * Any report as an Excel file. The UI builds the table it shows on screen and on the printed page (titles, column names, the rows) and
 * this turns the SAME table into a worksheet, so paper and Excel can never disagree. The backend never emits user-facing text, so all
 * wording arrives in the request; the school's name comes from the school profile. Cells use "Khmer UI", a Khmer-capable font that ships
 * with Windows. TEXT cells stay text (a phone number keeps its leading 0); INTEGER / DECIMAL cells are real numbers; DATE cells are real dates.
 */
@Service
public class ReportExportService {
    public static final int MAX_COLUMNS = 60;
    public static final int MAX_ROWS = 5000;
    private static final String FONT = "Khmer UI";
    private static final Set<String> TYPES = Set.of("TEXT", "INTEGER", "DECIMAL", "DATE");

    public record Column(String label, String type, Integer width) {}
    public record Table(String sheetName, String title, String subtitle, List<Column> columns, List<List<Object>> rows) {}

    private final SchoolSettingsRepository school;
    private final AuditService audit;

    public ReportExportService(SchoolSettingsRepository school, AuditService audit) {
        this.school = school;
        this.audit = audit;
    }

    public byte[] export(Table t) {
        if (t.columns() == null || t.columns().isEmpty() || t.columns().size() > MAX_COLUMNS) throw ApiException.validation("columns", "INVALID");
        if (t.rows() == null || t.rows().size() > MAX_ROWS) throw ApiException.validation("rows", "INVALID");
        for (Column c : t.columns()) if (c.label() == null || c.label().isBlank() || !TYPES.contains(c.type() == null ? "TEXT" : c.type())) throw ApiException.validation("columns", "INVALID");
        for (List<Object> row : t.rows()) if (row == null || row.size() != t.columns().size()) throw ApiException.validation("rows", "INVALID");

        String schoolName = school.findById(1L).map(SchoolSettings::getNameKm).orElse(null);
        int cols = t.columns().size();
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Font base = font(wb, false, 11);
            Font bold = font(wb, true, 11);
            Font big = font(wb, true, 14);

            CellStyle schoolStyle = wb.createCellStyle();
            schoolStyle.setFont(big);
            CellStyle titleStyle = wb.createCellStyle();
            titleStyle.setFont(bold);
            CellStyle plain = wb.createCellStyle();
            plain.setFont(base);
            CellStyle header = wb.createCellStyle();
            header.setFont(bold);
            header.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            header.setBorderBottom(BorderStyle.THIN);
            header.setVerticalAlignment(VerticalAlignment.CENTER);
            header.setWrapText(true);
            CellStyle text = wb.createCellStyle();
            text.setFont(base);
            text.setVerticalAlignment(VerticalAlignment.CENTER);
            CellStyle integer = wb.createCellStyle();
            integer.cloneStyleFrom(text);
            integer.setAlignment(HorizontalAlignment.RIGHT);
            CellStyle decimal = wb.createCellStyle();
            decimal.cloneStyleFrom(integer);
            CreationHelper helper = wb.getCreationHelper();
            decimal.setDataFormat(helper.createDataFormat().getFormat("0.00"));
            CellStyle date = wb.createCellStyle();
            date.cloneStyleFrom(text);
            date.setDataFormat(helper.createDataFormat().getFormat("yyyy-mm-dd"));

            Sheet sheet = wb.createSheet(sheetName(t.sheetName()));
            int r = 0;
            if (schoolName != null && !schoolName.isBlank()) r = line(sheet, r, schoolName, schoolStyle, cols);
            if (t.title() != null && !t.title().isBlank()) r = line(sheet, r, t.title(), titleStyle, cols);
            if (t.subtitle() != null && !t.subtitle().isBlank()) r = line(sheet, r, t.subtitle(), plain, cols);
            if (r > 0) r++;   // one empty row between the title block and the table

            int headerRow = r;
            Row head = sheet.createRow(r++);
            head.setHeightInPoints(26);
            for (int c = 0; c < cols; c++) {
                Column col = t.columns().get(c);
                Cell cell = head.createCell(c);
                cell.setCellValue(col.label());
                cell.setCellStyle(header);
                sheet.setColumnWidth(c, Math.max(6, Math.min(col.width() == null ? 16 : col.width(), 60)) * 256);
            }
            for (List<Object> values : t.rows()) {
                Row line = sheet.createRow(r++);
                line.setHeightInPoints(20);
                for (int c = 0; c < cols; c++) put(line, c, t.columns().get(c).type(), values.get(c), text, integer, decimal, date);
            }
            sheet.createFreezePane(0, headerRow + 1);
            sheet.setAutoFilter(new CellRangeAddress(headerRow, Math.max(headerRow, r - 1), 0, cols - 1));
            wb.write(out);
            audit.record("REPORT_EXPORTED", "report", null, "report exported to Excel (" + t.rows().size() + " rows)");
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Font font(XSSFWorkbook wb, boolean bold, int size) {
        Font f = wb.createFont();
        f.setFontName(FONT);
        f.setFontHeightInPoints((short) size);
        f.setBold(bold);
        return f;
    }

    private static int line(Sheet sheet, int rowIndex, String value, CellStyle style, int cols) {
        Row row = sheet.createRow(rowIndex);
        Cell cell = row.createCell(0);
        cell.setCellValue(value);
        cell.setCellStyle(style);
        if (cols > 1) sheet.addMergedRegion(new CellRangeAddress(rowIndex, rowIndex, 0, cols - 1));
        return rowIndex + 1;
    }

    private static void put(Row row, int col, String type, Object value, CellStyle text, CellStyle integer, CellStyle decimal, CellStyle date) {
        Cell cell = row.createCell(col);
        String kind = type == null ? "TEXT" : type;
        if (value == null || (value instanceof String s && s.isEmpty())) {
            cell.setCellStyle(text);
            return;
        }
        switch (kind) {
            case "INTEGER", "DECIMAL" -> {
                if (!(value instanceof Number n)) throw ApiException.validation("rows", "INVALID");
                cell.setCellValue(n.doubleValue());
                cell.setCellStyle("INTEGER".equals(kind) ? integer : decimal);
            }
            case "DATE" -> {
                try {
                    cell.setCellValue(LocalDate.parse(String.valueOf(value)));
                } catch (DateTimeParseException e) {
                    throw ApiException.validation("rows", "INVALID");
                }
                cell.setCellStyle(date);
            }
            default -> {
                cell.setCellValue(String.valueOf(value));
                cell.setCellStyle(text);
            }
        }
    }

    /** Excel allows at most 31 characters and none of \ / ? * [ ] : in a sheet name. */
    static String sheetName(String raw) {
        String n = raw == null ? "" : raw.replaceAll("[\\\\/?*\\[\\]:]", " ").trim();
        if (n.isEmpty()) n = "Report";
        return n.length() > 31 ? n.substring(0, 31) : n;
    }
}
