package mg.rosii.management.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end authentication flow against a real PostgreSQL.
 * Skipped automatically on machines without Docker.
 *
 * <p>Methods are ordered: the first creates the patronne account via setup.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AuthFlowIntegrationTest extends IntegrationTestSupport {

    private static final String EMAIL = "patronne@example.com";
    private static final String PASSWORD = "correct-horse-battery";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private static String token;

    @Test
    @Order(1)
    void setupCreatesPatronneAndReturnsSession() throws Exception {
        String body = mockMvc.perform(post("/api/auth/setup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email": "%s", "password": "%s"}
                                """.formatted(EMAIL, PASSWORD)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.user.email").value(EMAIL))
                .andExpect(jsonPath("$.user.role").value("PATRONNE"))
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("password");
        token = objectMapper.readTree(body).get("token").asText();
    }

    @Test
    @Order(2)
    void setupIsClosedOnceAnAccountExists() throws Exception {
        mockMvc.perform(post("/api/auth/setup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email": "someone-else@example.com", "password": "%s"}
                                """.formatted(PASSWORD)))
                .andExpect(status().isConflict());
    }

    @Test
    @Order(3)
    void loginWithValidCredentialsReturnsToken() throws Exception {
        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email": "%s", "password": "%s"}
                                """.formatted(EMAIL, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.role").value("PATRONNE"))
                .andReturn().getResponse().getContentAsString();

        // No password material in the response.
        assertThat(body).doesNotContain("passwordHash");
        assertThat(body).doesNotContain(PASSWORD);
    }

    @Test
    @Order(4)
    void loginWithWrongPasswordIsUnauthorized() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email": "%s", "password": "wrong-password"}
                                """.formatted(EMAIL)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @Order(5)
    void loginWithUnknownEmailIsUnauthorizedTheSameWay() throws Exception {
        // Identical response to a wrong password: no account enumeration.
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email": "ghost@example.com", "password": "%s"}
                                """.formatted(PASSWORD)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @Order(6)
    void loginRejectsBlankFields() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\": \"\", \"password\": \"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @Order(7)
    void healthRemainsPublic() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    @Order(8)
    void meRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @Order(9)
    void meReturnsIdentityWithValidToken() throws Exception {
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(EMAIL))
                .andExpect(jsonPath("$.role").value("PATRONNE"))
                .andExpect(jsonPath("$.id").isNotEmpty());
    }

    @Test
    @Order(10)
    void meRejectsTamperedToken() throws Exception {
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token + "tampered"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @Order(11)
    void protectedEndpointsRequireAuthentication() throws Exception {
        // Any API route beyond health/auth-login is authenticated by default.
        mockMvc.perform(get("/api/users"))
                .andExpect(status().isUnauthorized());
    }
}
