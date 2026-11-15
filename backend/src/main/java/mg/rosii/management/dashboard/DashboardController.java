package mg.rosii.management.dashboard;

import mg.rosii.management.dashboard.dto.DashboardResponse;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Dashboard API (Feature 35). Requires authentication via the existing security
 * config (no permitAll additions); V1 single-role PATRONNE.
 *
 * <p>One endpoint replaces the five complete list downloads the dashboard used
 * to perform: it returns the indicators, the distributions and the bounded
 * recent-activity timeline the screen actually displays. The five domain
 * endpoints are untouched and keep serving their own screens.
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping
    public DashboardResponse summary() {
        return dashboardService.summary();
    }
}
