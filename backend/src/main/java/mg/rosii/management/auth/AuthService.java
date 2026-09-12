package mg.rosii.management.auth;

import java.util.Locale;

import mg.rosii.management.auth.dto.AuthResponse;
import mg.rosii.management.auth.dto.LoginRequest;
import mg.rosii.management.auth.dto.MeResponse;
import mg.rosii.management.auth.dto.SetupRequest;
import mg.rosii.management.security.JwtService;
import mg.rosii.management.user.Role;
import mg.rosii.management.user.User;
import mg.rosii.management.user.UserRepository;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Online authentication for the patronne account (Feature 03).
 *
 * <p>Offline authentication on the desktop is a later feature; this service only
 * issues and validates server-side JWT sessions.
 */
@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmailAndDeletedAtIsNull(normalize(request.email()))
                // Same failure for unknown email and wrong password: no account enumeration.
                .filter(u -> passwordEncoder.matches(request.password(), u.getPasswordHash()))
                .orElseThrow(() -> new BadCredentialsException("invalid credentials"));
        return toResponse(user);
    }

    /**
     * Creates the initial patronne account. Strictly controlled: it only succeeds
     * while no active user exists, then locks itself permanently (409).
     */
    @Transactional
    public AuthResponse setup(SetupRequest request) {
        if (userRepository.existsByDeletedAtIsNull()) {
            throw conflict();
        }
        String email = normalize(request.email());
        User user = new User(email, passwordEncoder.encode(request.password()), Role.PATRONNE);
        try {
            userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            // Concurrent setup race: the partial unique index on active email decides.
            throw conflict();
        }
        return toResponse(user);
    }

    private AuthResponse toResponse(User user) {
        String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole());
        return AuthResponse.of(token, jwtService.expirationSeconds(), MeResponse.from(user));
    }

    private ResponseStatusException conflict() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "setup is closed: an account already exists");
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
