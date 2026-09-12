package mg.rosii.management.client;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import mg.rosii.management.client.dto.CreateClientRequest;
import mg.rosii.management.client.dto.UpdateClientRequest;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure Bean-Validation unit tests for the client request contracts
 * (no Spring context, no database).
 */
class ClientRequestValidationTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void fullValidRequestHasNoViolations() {
        var request = new CreateClientRequest("Alice Rakoto", "+261 34 12 34 56 78",
                "+261 32 98 76 54 32", "alice@example.com", "Prefers early delivery");

        assertThat(VALIDATOR.validate(request)).isEmpty();
    }

    @Test
    void minimalRequestWithOnlyRequiredFieldsIsValid() {
        var request = new CreateClientRequest("Bob Example", "+261 34 00 00 00 00",
                null, null, null);

        assertThat(VALIDATOR.validate(request)).isEmpty();
    }

    @Test
    void blankNameIsRejected() {
        assertThat(VALIDATOR.validate(new CreateClientRequest("   ", "+261 34 12 34 56", null, null, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("name"));
    }

    @Test
    void blankPhone1IsRejected() {
        assertThat(VALIDATOR.validate(new CreateClientRequest("Alice", "", null, null, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("phone1"));
    }

    @Test
    void optionalPhone2MustNotBeBlankWhenPresent() {
        assertThat(VALIDATOR.validate(new CreateClientRequest("Alice", "+261 34 12 34 56", "  ", null, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("phone2"));
    }

    @Test
    void invalidEmailIsRejected() {
        assertThat(VALIDATOR.validate(new CreateClientRequest("Alice", "+261 34 12 34 56", null, "not-an-email", null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("email"));
    }

    @Test
    void oversizedFieldsAreRejected() {
        var request = new CreateClientRequest("n".repeat(201), "+261 34 12 34 56",
                null, null, "x".repeat(2001));

        assertThat(VALIDATOR.validate(request))
                .extracting(v -> v.getPropertyPath().toString())
                .contains("name", "notes");
    }

    @Test
    void updateRequestValidatesTheSameRules() {
        assertThat(VALIDATOR.validate(new UpdateClientRequest("", "", "", "bad", null)))
                .extracting(v -> v.getPropertyPath().toString())
                .contains("name", "phone1", "phone2", "email");
    }
}
