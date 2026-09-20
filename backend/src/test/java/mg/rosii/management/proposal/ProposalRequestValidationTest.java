package mg.rosii.management.proposal;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import mg.rosii.management.proposal.dto.CreateProposalRequest;
import mg.rosii.management.proposal.dto.ProposalLineRequest;
import mg.rosii.management.proposal.dto.SetProposalStatusRequest;
import mg.rosii.management.proposal.dto.UpdateProposalRequest;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure Bean-Validation unit tests for the proposal request contracts (no
 * Spring context, no database). Existence, same-client, transition and
 * validUntil rules are service-level and covered by the integration tests.
 */
class ProposalRequestValidationTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    private static ProposalLineRequest validLine() {
        return new ProposalLineRequest(UUID.randomUUID(), "Traiteur", "forfait",
                new BigDecimal("1"), new BigDecimal("800000"), null);
    }

    private static CreateProposalRequest validCreate() {
        return new CreateProposalRequest(UUID.randomUUID(), UUID.randomUUID(), "Mariage Rakoto",
                LocalDate.now().plusDays(15), "Notes", List.of(validLine()));
    }

    @Test
    void validCreateRequestHasNoViolations() {
        assertThat(VALIDATOR.validate(validCreate())).isEmpty();
    }

    @Test
    void freeFormLineWithoutServiceIsValid() {
        var line = new ProposalLineRequest(null, "Prestation libre", "unité",
                new BigDecimal("2"), new BigDecimal("50000"), null);
        var request = new CreateProposalRequest(UUID.randomUUID(), UUID.randomUUID(), null, null, null, List.of(line));
        assertThat(VALIDATOR.validate(request)).isEmpty();
    }

    @Test
    void missingClientAndDemandAreRejected() {
        var request = new CreateProposalRequest(null, null, null, null, null, List.of(validLine()));
        assertThat(VALIDATOR.validate(request))
                .extracting(v -> v.getPropertyPath().toString())
                .contains("clientId", "demandId");
    }

    @Test
    void emptyLinesAreRejected() {
        var request = new CreateProposalRequest(UUID.randomUUID(), UUID.randomUUID(), null, null, null, List.of());
        assertThat(VALIDATOR.validate(request))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("lines"));
    }

    @Test
    void nullLinesAreRejected() {
        var request = new CreateProposalRequest(UUID.randomUUID(), UUID.randomUUID(), null, null, null, null);
        assertThat(VALIDATOR.validate(request))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("lines"));
    }

    @Test
    void blankDescriptionAndUnitAreRejected() {
        var line = new ProposalLineRequest(null, "   ", " ", new BigDecimal("1"), new BigDecimal("10"), null);
        var request = new CreateProposalRequest(UUID.randomUUID(), UUID.randomUUID(), null, null, null, List.of(line));
        assertThat(VALIDATOR.validate(request))
                .extracting(v -> v.getPropertyPath().toString())
                .anySatisfy(p -> assertThat(p).contains("description"))
                .anySatisfy(p -> assertThat(p).contains("unit"));
    }

    @Test
    void nonPositiveQuantityIsRejected() {
        for (String quantity : new String[] {"0", "-1"}) {
            var line = new ProposalLineRequest(null, "X", "u", new BigDecimal(quantity), new BigDecimal("10"), null);
            var request = new CreateProposalRequest(UUID.randomUUID(), UUID.randomUUID(), null, null, null, List.of(line));
            assertThat(VALIDATOR.validate(request))
                    .anySatisfy(v -> assertThat(v.getPropertyPath().toString()).contains("quantity"));
        }
    }

    @Test
    void negativeUnitPriceIsRejected() {
        var line = new ProposalLineRequest(null, "X", "u", new BigDecimal("1"), new BigDecimal("-0.01"), null);
        var request = new CreateProposalRequest(UUID.randomUUID(), UUID.randomUUID(), null, null, null, List.of(line));
        assertThat(VALIDATOR.validate(request))
                .anySatisfy(v -> assertThat(v.getPropertyPath().toString()).contains("unitPrice"));
    }

    @Test
    void updateRequestRequiresVersion() {
        var request = new UpdateProposalRequest(null, UUID.randomUUID(), UUID.randomUUID(), null, null, null,
                List.of(validLine()));
        assertThat(VALIDATOR.validate(request))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("version"));
    }

    @Test
    void statusRequestRequiresStatusAndVersion() {
        var request = new SetProposalStatusRequest(null, null);
        assertThat(VALIDATOR.validate(request))
                .extracting(v -> v.getPropertyPath().toString())
                .contains("status", "version");
    }
}
