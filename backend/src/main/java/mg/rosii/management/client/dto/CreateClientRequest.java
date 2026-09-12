package mg.rosii.management.client.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Client creation payload. Only the business fields the patronne needs:
 * name and phone1 are required; everything else is optional.
 *
 * <p>Limits (documented API contract): name 200, phones 30, email 255,
 * notes 2000 characters.
 */
public record CreateClientRequest(
        @NotBlank @Size(max = 200) String name,
        @NotBlank @Size(max = 30) String phone1,
        // Optional, but if present must not be blank (whitespace counts as blank).
        @Size(max = 30)
        @Pattern(regexp = ".*\\S.*", flags = Pattern.Flag.DOTALL, message = "must not be blank")
        String phone2,
        @Email @Size(max = 255) String email,
        @Size(max = 2000) String notes) {
}
