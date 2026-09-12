package mg.rosii.management.auth.dto;

import java.util.UUID;

import mg.rosii.management.user.Role;
import mg.rosii.management.user.User;

/** Public identity of an authenticated user. Never contains credentials. */
public record MeResponse(UUID id, String email, Role role) {

    public static MeResponse from(User user) {
        return new MeResponse(user.getId(), user.getEmail(), user.getRole());
    }
}
