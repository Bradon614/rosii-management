package mg.rosii.management.auth.dto;

/**
 * Successful authentication result: a bearer JWT plus the user identity,
 * enough for the desktop application to maintain an authenticated session.
 */
public record AuthResponse(String token, String tokenType, long expiresInSeconds, MeResponse user) {

    public static AuthResponse of(String token, long expiresInSeconds, MeResponse user) {
        return new AuthResponse(token, "Bearer", expiresInSeconds, user);
    }
}
