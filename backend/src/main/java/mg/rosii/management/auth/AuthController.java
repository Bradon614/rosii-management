package mg.rosii.management.auth;

import jakarta.validation.Valid;

import mg.rosii.management.auth.dto.AuthResponse;
import mg.rosii.management.auth.dto.LoginRequest;
import mg.rosii.management.auth.dto.MeResponse;
import mg.rosii.management.auth.dto.SetupRequest;
import mg.rosii.management.user.User;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    /** One-time creation of the patronne account; closes itself once a user exists. */
    @PostMapping("/setup")
    public ResponseEntity<AuthResponse> setup(@Valid @RequestBody SetupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.setup(request));
    }

    /** Verifies the current session; used later by the desktop app to restore it. */
    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal User user) {
        return MeResponse.from(user);
    }
}
