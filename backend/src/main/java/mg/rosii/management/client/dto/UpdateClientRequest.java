package mg.rosii.management.client.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Client update payload: the editable fields only. id, timestamps, deletedAt
 * and version are never writable through the API.
 */
public record UpdateClientRequest(
        @NotBlank @Size(max = 200) String name,
        @NotBlank @Size(max = 30) String phone1,
        @Size(max = 30)
        @Pattern(regexp = ".*\\S.*", flags = Pattern.Flag.DOTALL, message = "must not be blank")
        String phone2,
        @Email @Size(max = 255) String email,
        @Size(max = 2000) String notes) {
}
