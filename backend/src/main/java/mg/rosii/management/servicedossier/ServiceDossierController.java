package mg.rosii.management.servicedossier;

import java.util.UUID;

import mg.rosii.management.servicedossier.dto.ServiceDossierResponse;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only service dossier endpoint (Feature 17). Requires authentication via
 * the existing security configuration; unknown or soft-deleted proposals follow
 * the project's 404 convention.
 */
@RestController
@RequestMapping("/api/service-dossiers")
public class ServiceDossierController {

    private final ServiceDossierService serviceDossierService;

    public ServiceDossierController(ServiceDossierService serviceDossierService) {
        this.serviceDossierService = serviceDossierService;
    }

    @GetMapping("/{proposalId}")
    public ServiceDossierResponse get(@PathVariable UUID proposalId) {
        return serviceDossierService.get(proposalId);
    }
}