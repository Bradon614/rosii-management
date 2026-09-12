package mg.rosii.management.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * One-time initial setup of the patronne account.
 * Accepted only while no active user exists (see AuthService).
 */
public record SetupRequest(
        @NotBlank @Email String email,
        // BCrypt consumes at most 72 bytes; a minimum length keeps weak passwords out.
        @NotBlank @Size(min = 8, max = 72) String password) {
}
