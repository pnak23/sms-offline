package kh.school.sms.dashboard;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class DashboardController {
    private final DashboardService dashboard;
    private final DashboardChartsService charts;

    public DashboardController(DashboardService dashboard, DashboardChartsService charts) {
        this.dashboard = dashboard;
        this.charts = charts;
    }

    @GetMapping("/dashboard")
    public DashboardService.Dashboard dashboard() { return dashboard.dashboard(); }

    /** The data of the charts, read-only and separate from the figures above so that those appear at once. */
    @GetMapping("/dashboard/charts")
    public DashboardChartsService.Charts charts() { return charts.charts(); }
}
