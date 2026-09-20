package mg.rosii.management.demand;

import java.util.UUID;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import mg.rosii.management.demand.dto.CreateDemandRequest;
import mg.rosii.management.demand.dto.DemandEventDetailsRequest;
import mg.rosii.management.demand.dto.UpdateDemandRequest;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure Bean-Validation unit tests for the demand request contracts
 * (no Spring context, no database). Budget cross-field rules and client
 * existence are service-level and covered by the integration tests.
 */
class DemandRequestValidationTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    private static CreateDemandRequest create(UUID clientId, DemandType type, Integer people) {
        return new CreateDemandRequest(clientId, type, null, null, people,
                null, null, null, null, null, null);
    }

    @Test
    void validEventDemandWithDetailsHasNoViolations() {
        var request = new CreateDemandRequest(UUID.randomUUID(), DemandType.EVENT, DemandStatus.NEW,
                java.time.LocalDate.of(2026, 11, 15), 150, BudgetType.RANGE,
                new java.math.BigDecimal("4000000"), new java.math.BigDecimal("6000000"),
                "Salle Ivandry", "Proposition personnalisée",
                new DemandEventDetailsRequest("Mariage", true, "Salle A",
                        true, true, null, true, null, "Blanc et doré", null));

        assertThat(VALIDATOR.validate(request)).isEmpty();
    }

    @Test
    void validNonEventDemandWithoutDetailsIsValid() {
        assertThat(VALIDATOR.validate(create(UUID.randomUUID(), DemandType.TRANSPORT, null))).isEmpty();
    }

    @Test
    void missingClientIsRejected() {
        assertThat(VALIDATOR.validate(create(null, DemandType.EVENT, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("clientId"));
    }

    @Test
    void missingTypeIsRejected() {
        assertThat(VALIDATOR.validate(create(UUID.randomUUID(), null, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("type"));
    }

    @Test
    void zeroEstimatedPeopleIsRejected() {
        assertThat(VALIDATOR.validate(create(UUID.randomUUID(), DemandType.EVENT, 0)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("estimatedPeople"));
    }

    @Test
    void negativeEstimatedPeopleIsRejected() {
        assertThat(VALIDATOR.validate(create(UUID.randomUUID(), DemandType.EVENT, -5)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("estimatedPeople"));
    }

    @Test
    void eventDetailsRequireEventType() {
        var withBlankType = new CreateDemandRequest(UUID.randomUUID(), DemandType.EVENT, null, null, null,
                null, null, null, null, null,
                new DemandEventDetailsRequest("   ", null, null, null, null, null, null, null, null, null));

        assertThat(VALIDATOR.validate(withBlankType))
                .anySatisfy(v -> assertThat(v.getPropertyPath().toString()).startsWith("eventDetails"));
    }

    @Test
    void oversizedTextsAreRejected() {
        var request = new CreateDemandRequest(UUID.randomUUID(), DemandType.OTHER, null, null, null,
                null, null, null, "l".repeat(501), "n".repeat(2001), null);

        assertThat(VALIDATOR.validate(request))
                .extracting(v -> v.getPropertyPath().toString())
                .contains("location", "notes");
    }

    @Test
    void updateRequestRequiresVersionAndStatus() {
        var request = new UpdateDemandRequest(UUID.randomUUID(), DemandType.EVENT, null, null, null,
                null, null, null, null, null, null, null);

        assertThat(VALIDATOR.validate(request))
                .extracting(v -> v.getPropertyPath().toString())
                .contains("version", "status");
    }
}
