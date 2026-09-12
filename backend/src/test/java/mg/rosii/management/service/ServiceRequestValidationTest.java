package mg.rosii.management.service;

import java.math.BigDecimal;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import mg.rosii.management.service.dto.CreateServiceRequest;
import mg.rosii.management.service.dto.UpdateServiceRequest;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure Bean-Validation unit tests for the catalogue request contracts
 * (no Spring context, no database).
 */
class ServiceRequestValidationTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    private static CreateServiceRequest create(String name, ServiceCategory category,
            String description, String defaultUnit, BigDecimal price, Boolean active) {
        return new CreateServiceRequest(name, category, description, defaultUnit, price, active);
    }

    @Test
    void validRequestHasNoViolations() {
        var request = create("Traiteur premium", ServiceCategory.CATERING, "Menu mariage",
                "personne", new BigDecimal("150000.00"), null);

        assertThat(VALIDATOR.validate(request)).isEmpty();
    }

    @Test
    void missingNameIsRejected() {
        assertThat(VALIDATOR.validate(create(null, ServiceCategory.FLORIST, null, "unité", BigDecimal.ONE, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("name"));
    }

    @Test
    void blankNameIsRejected() {
        assertThat(VALIDATOR.validate(create("   ", ServiceCategory.FLORIST, null, "unité", BigDecimal.ONE, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("name"));
    }

    @Test
    void missingCategoryIsRejected() {
        assertThat(VALIDATOR.validate(create("Service", null, null, "unité", BigDecimal.ONE, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("category"));
    }

    @Test
    void blankDefaultUnitIsRejected() {
        assertThat(VALIDATOR.validate(create("Service", ServiceCategory.DECORATION, null, "  ", BigDecimal.ONE, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("defaultUnit"));
    }

    @Test
    void missingReferencePriceIsRejected() {
        assertThat(VALIDATOR.validate(create("Service", ServiceCategory.DECORATION, null, "unité", null, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("referencePrice"));
    }

    @Test
    void negativeReferencePriceIsRejected() {
        assertThat(VALIDATOR.validate(create("Service", ServiceCategory.TRANSPORT, null, "km",
                new BigDecimal("-0.01"), null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("referencePrice"));
    }

    @Test
    void zeroReferencePriceIsAccepted() {
        assertThat(VALIDATOR.validate(create("Service", ServiceCategory.OTHER, null, "forfait",
                BigDecimal.ZERO, null))).isEmpty();
    }

    @Test
    void oversizedFieldsAreRejected() {
        var request = create("n".repeat(201), ServiceCategory.OTHER, "d".repeat(2001),
                "u".repeat(51), new BigDecimal("1234567890123.45"), null);

        assertThat(VALIDATOR.validate(request))
                .extracting(v -> v.getPropertyPath().toString())
                .contains("name", "description", "defaultUnit", "referencePrice");
    }

    @Test
    void updateRequestRequiresVersion() {
        var request = new UpdateServiceRequest("Name", ServiceCategory.HALL_RENTAL, null,
                "jour", BigDecimal.TEN, null);

        assertThat(VALIDATOR.validate(request))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("version"));
    }
}
