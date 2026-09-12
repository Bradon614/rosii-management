package mg.rosii.management.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Login request. Passwords are validated against the stored BCrypt hash. */
public record LoginRequest(
        @NotBlank @Email String email,
        @NotBlank String password) {
}
