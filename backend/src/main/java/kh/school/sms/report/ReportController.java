package kh.school.sms.report;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {
    private static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /** {@code type} is TEXT (the default), INTEGER, DECIMAL or DATE (an ISO date string). */
    public record ColumnRequest(@NotBlank @Size(max = 100) String label, @Size(max = 10) String type, Integer width) {}
    /** Cell values are strings, numbers or null. */
    public record TableRequest(@Size(max = 100) String sheetName, @Size(max = 200) String title, @Size(max = 300) String subtitle,
                               @NotEmpty @Size(max = ReportExportService.MAX_COLUMNS) List<@Valid ColumnRequest> columns,
                               @NotNull @Size(max = ReportExportService.MAX_ROWS) List<List<Object>> rows) {}

    private final ReportExportService exports;

    public ReportController(ReportExportService exports) { this.exports = exports; }

    /** The table of any report as an .xlsx (the UI saves the bytes through the desktop bridge). */
    @PostMapping("/export")
    public ResponseEntity<byte[]> export(@Valid @RequestBody TableRequest r) {
        byte[] file = exports.export(new ReportExportService.Table(r.sheetName(), r.title(), r.subtitle(),
                r.columns().stream().map(c -> new ReportExportService.Column(c.label(), c.type(), c.width())).toList(), r.rows()));
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(XLSX)).cacheControl(CacheControl.noStore()).body(file);
    }
}
