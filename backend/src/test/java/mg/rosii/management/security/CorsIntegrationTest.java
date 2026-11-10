package mg.rosii.management.security;

import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * CORS policy of the API consumed by the compiled Tauri window.
 * Skipped automatically on machines without Docker.
 *
 * <p>The production webview calls the API cross-origin from
 * {@code http://tauri.localhost}, so these tests assert the whole browser
 * contract: allowed origins get the CORS headers, denied origins are refused,
 * preflight answers a bearer-token request, and JWT authentication is unchanged.
 */
@SpringBootTest(properties = {
        "jwt.secret=cors-integration-test-signing-secret-32-chars!",
        "app.cors.allowed-origins=http://tauri.localhost,http://localhost:5173"
})
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class CorsIntegrationTest extends IntegrationTestSupport {

    private static final String TAURI_ORIGIN = "http://tauri.localhost";
    private static final String DENIED_ORIGIN = "https://evil.example";
    private static final String EMAIL = "cors-test@example.com";
    private static final String PASSWORD = "correct-horse-battery";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void preflightFromTheTauriOriginIsAllowed() throws Exception {
        mockMvc.perform(options("/api/clients")
                        .header(HttpHeaders.ORIGIN, TAURI_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, TAURI_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, containsString("GET")))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, containsString("PATCH")))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, containsString("DELETE")))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS,
                        containsString("authorization")))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS,
                        containsString("content-type")))
                // Cookies are never used: the desktop client sends a bearer token.
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS));
    }

    @Test
    void preflightFromAnUnknownOriginIsRefusedWithoutCorsHeaders() throws Exception {
        mockMvc.perform(options("/api/clients")
                        .header(HttpHeaders.ORIGIN, DENIED_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @Test
    void actualRequestFromAnAllowedOriginExposesContentDisposition() throws Exception {
        // The desktop client reads Content-Disposition to name downloaded PDFs;
        // without Access-Control-Expose-Headers the browser hides it.
        mockMvc.perform(get("/api/health").header(HttpHeaders.ORIGIN, TAURI_ORIGIN))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, TAURI_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS,
                        containsString(HttpHeaders.CONTENT_DISPOSITION)));
    }

    @Test
    void actualRequestFromAnUnknownOriginIsRefused() throws Exception {
        mockMvc.perform(get("/api/health").header(HttpHeaders.ORIGIN, DENIED_ORIGIN))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @Test
    void protectedEndpointStillRequiresJwtForAnAllowedOrigin() throws Exception {
        mockMvc.perform(get("/api/clients").header(HttpHeaders.ORIGIN, TAURI_ORIGIN))
                .andExpect(status().isUnauthorized())
                // The 401 must carry CORS headers too, otherwise the browser
                // hides it and the client would report a network error.
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, TAURI_ORIGIN));
    }

    @Test
    void jwtAuthenticationStillWorksForAnAllowedOrigin() throws Exception {
        // @BeforeAll clears business data per test class, so the one-time setup
        // is available here; tolerate 409 if the database was not reset.
        int setupStatus = mockMvc.perform(post("/api/auth/setup")
                        .header(HttpHeaders.ORIGIN, TAURI_ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email": "%s", "password": "%s"}
                                """.formatted(EMAIL, PASSWORD)))
                .andReturn().getResponse().getStatus();
        assertThat(setupStatus).isIn(201, 409);

        String body = mockMvc.perform(post("/api/auth/login")
                        .header(HttpHeaders.ORIGIN, TAURI_ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email": "%s", "password": "%s"}
                                """.formatted(EMAIL, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, TAURI_ORIGIN))
                .andReturn().getResponse().getContentAsString();

        String token = objectMapper.readTree(body).get("token").asText();

        mockMvc.perform(get("/api/auth/me")
                        .header(HttpHeaders.ORIGIN, TAURI_ORIGIN)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, TAURI_ORIGIN))
                .andExpect(jsonPath("$.email").value(EMAIL))
                .andExpect(jsonPath("$.role").value("PATRONNE"));
    }
}
