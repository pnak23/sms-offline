package spike;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;

/** Plain unit test (no Spring): Apache POI writes and re-reads Khmer text, and records the font name. */
class ExcelSpikeTest {

    @Test
    void khmerTextSurvivesAnXlsxRoundTrip() throws Exception {
        String km = "សុខ ចាន់ណា — ថ្នាក់ទី១ក";
        byte[] bytes;
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Font font = wb.createFont();
            font.setFontName("Khmer UI");
            CellStyle style = wb.createCellStyle();
            style.setFont(font);
            Sheet sheet = wb.createSheet("បញ្ជីសិស្ស");
            Row row = sheet.createRow(0);
            Cell c = row.createCell(0);
            c.setCellValue(km);
            c.setCellStyle(style);
            wb.write(out);
            bytes = out.toByteArray();
        }
        String read;
        String fontName;
        String sheetName;
        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Cell c = wb.getSheetAt(0).getRow(0).getCell(0);
            read = c.getStringCellValue();
            fontName = wb.getFontAt(c.getCellStyle().getFontIndex()).getFontName();
            sheetName = wb.getSheetName(0);
        }
        String sharedStrings = "";
        try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            for (ZipEntry e = z.getNextEntry(); e != null; e = z.getNextEntry()) {
                if (e.getName().equals("xl/sharedStrings.xml")) sharedStrings = new String(z.readAllBytes(), StandardCharsets.UTF_8);
            }
        }
        System.out.println("SPIKE: excel: " + bytes.length + " bytes, font=" + fontName + ", sheet name round-trips=" + "បញ្ជីសិស្ស".equals(sheetName)
                + ", UTF-8 in sharedStrings.xml=" + sharedStrings.contains(km));
        assertThat(read).isEqualTo(km);
        assertThat(fontName).isEqualTo("Khmer UI");
        assertThat(sheetName).isEqualTo("បញ្ជីសិស្ស");
        assertThat(sharedStrings).contains(km);
    }
}
