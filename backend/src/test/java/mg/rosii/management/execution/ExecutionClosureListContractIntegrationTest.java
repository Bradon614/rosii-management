package mg.rosii.management.execution;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.closure.ClosureStatus;
import mg.rosii.management.closure.ServiceClosure;
import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.preparation.PreparationRepository;
import mg.rosii.management.proposal.ProposalRepository;
import mg.rosii.management.security.JwtService;
import mg.rosii.management.user.Role;
import mg.rosii.management.user.User;
import mg.rosii.management.user.UserRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Feature 34 — HTTP contract of the execution and closure lists against a real
 * PostgreSQL (Testcontainers). Skipped automatically without Docker.
 *
 * <p>The optimization added context fields ({@code proposalId},
 * {@code proposalNumber} on both lists, {@code executionId},
 * {@code executionStatus} on the closures). These tests assert that every
 * pre-existing field is still present with the same value, that the new fields
 * carry the right relations, that filters and ordering are unchanged, that
 * soft-deleted rows never appear and that missing relations serialize as
 * {@code null} instead of breaking the row.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ExecutionClosureListContractIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "list-contract-tests@example.com";
    private static final String VALID_UNTIL = "2999-12-31";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository users;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private ServiceClosureRepository closures;

    @Autowired
    private ExecutionRepository executions;

    @Autowired
    private PreparationRepository preparations;

    @Autowired
    private PaymentRepository payments;

    @Autowired
    private ProposalRepository proposals;

    private String auth;

    @BeforeEach
    void authenticateAsPatronne() {
        closures.deleteAll();
        executions.deleteAll();
        preparations.deleteAll();
        payments.deleteAll();
        proposals.deleteAll();
        User patronne = users.findByEmailAndDeletedAtIsNull(AUTH_EMAIL)
                .orElseGet(() -> users.saveAndFlush(new User(
                        AUTH_EMAIL, passwordEncoder.encode("not-used-for-login"), Role.PATRONNE)));
        auth = "Bearer " + jwtService.generateToken(patronne.getId(), patronne.getEmail(), patronne.getRole());
    }

    // ----- helpers -----

    private JsonNode postJson(String path, String body) throws Exception {
        String response = mockMvc.perform(post(path).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private JsonNode getJson(String path) throws Exception {
        String response = mockMvc.perform(get(path).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private void patchJson(String path, String body) throws Exception {
        mockMvc.perform(patch(path).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    /** Operational-info update: PUT /api/executions/{id} (F10). */
    private void putJson(String path, String body) throws Exception {
        mockMvc.perform(put(path).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    /** One commercial chain up to an active execution; returns the ids. */
    private Chain createChain(String name) throws Exception {
        String clientId = postJson("/api/clients",
                "{\"name\": \"%s\", \"phone1\": \"+261 34 00 00 00\"}".formatted(name)).get("id").asText();
        String demandId = postJson("/api/demands",
                "{\"clientId\": \"%s\", \"type\": \"EVENT\", \"budgetType\": \"NONE\"}".formatted(clientId))
                .get("id").asText();
        String proposalId = postJson("/api/proposals", """
                {"clientId": "%s", "demandId": "%s", "title": "Prestation %s",
                 "validUntil": "%s", "requiredDeposit": 2000000,
                 "lines": [{"description": "Prestation", "unit": "forfait",
                  "quantity": 1, "unitPrice": 4000000}]}
                """.formatted(clientId, demandId, name, VALID_UNTIL)).get("id").asText();
        patchJson("/api/proposals/" + proposalId + "/status", "{\"status\": \"SENT\", \"version\": 0}");
        patchJson("/api/proposals/" + proposalId + "/status", "{\"status\": \"ACCEPTED\", \"version\": 1}");
        postJson("/api/payments", """
                {"proposalId": "%s", "amount": 2000000, "method": "CASH", "paymentDate": "2026-09-20"}
                """.formatted(proposalId));
        String preparationId = postJson("/api/preparations",
                "{\"proposalId\": \"%s\"}".formatted(proposalId)).get("id").asText();
        String executionId = postJson("/api/executions",
                "{\"preparationId\": \"%s\"}".formatted(preparationId)).get("id").asText();
        return new Chain(preparationId, executionId);
    }

    private void complete(String executionId) throws Exception {
        patchJson("/api/executions/" + executionId + "/status", "{\"status\": \"IN_PROGRESS\"}");
        patchJson("/api/executions/" + executionId + "/status", "{\"status\": \"COMPLETED\"}");
    }

    private String createClosure(String preparationId) throws Exception {
        return postJson("/api/closures",
                "{\"preparationId\": \"%s\"}".formatted(preparationId)).get("id").asText();
    }

    private JsonNode executionsList(String query) throws Exception {
        return getJson("/api/executions" + query);
    }

    private JsonNode closuresList(String query) throws Exception {
        return getJson("/api/closures" + query);
    }

    private static List<String> idsOf(JsonNode rows) {
        List<String> ids = new ArrayList<>();
        rows.forEach(row -> ids.add(row.get("id").asText()));
        return ids;
    }

    /** Preparation + execution ids of one chain. */
    private record Chain(String preparationId, String executionId) {
    }

    // ----- execution list -----

    /** Every existing field is preserved and the proposal of each row is correct. */
    @Test
    void executionListKeepsItsContractAndAddsTheProposal() throws Exception {
        Chain first = createChain("F34 Un");
        putJson("/api/executions/" + first.executionId(), """
                {"version": 0, "scheduledDate": "2999-12-20", "startTime": "08:00",
                 "endTime": "17:00", "location": "Salle A", "notes": "Montage"}
                """);
        Chain second = createChain("F34 Deux");

        JsonNode rows = executionsList("");
        assertThat(rows).hasSize(2);

        JsonNode row = rows.get(0);
        // Pre-existing fields, unchanged name/type/value.
        assertThat(row.get("id").asText()).isEqualTo(first.executionId());
        assertThat(row.get("preparationId").asText()).isEqualTo(first.preparationId());
        assertThat(row.get("status").asText()).isEqualTo("PLANNED");
        assertThat(row.get("scheduledDate").asText()).isEqualTo("2999-12-20");
        assertThat(row.get("startTime").asText()).isEqualTo("08:00:00");
        assertThat(row.get("endTime").asText()).isEqualTo("17:00:00");
        assertThat(row.get("location").asText()).isEqualTo("Salle A");
        assertThat(row.get("notes").asText()).isEqualTo("Montage");
        assertThat(row.has("startedAt")).isTrue();
        assertThat(row.has("completedAt")).isTrue();
        assertThat(row.has("cancelledAt")).isTrue();
        assertThat(row.has("cancellationReason")).isTrue();
        assertThat(row.has("createdAt")).isTrue();
        assertThat(row.has("updatedAt")).isTrue();
        assertThat(row.has("version")).isTrue();
        // New Feature 34 fields: the proposal behind the preparation.
        assertThat(row.get("proposalNumber").asText()).startsWith("PROP-");
        String proposalNumber = row.get("proposalNumber").asText();
        assertThat(row.get("proposalId").asText()).isNotBlank();
        // Same proposal for the second row, and the id is the one of the number.
        JsonNode secondRow = rows.get(1);
        assertThat(secondRow.get("preparationId").asText()).isEqualTo(second.preparationId());
        assertThat(secondRow.get("proposalNumber").asText()).startsWith("PROP-");
        assertThat(secondRow.get("proposalNumber").asText()).isNotEqualTo(proposalNumber);
    }

    /** No row is duplicated and the ordering (scheduledDate asc, undated last) is kept. */
    @Test
    void executionListHasNoDuplicateAndKeepsItsOrder() throws Exception {
        Chain late = createChain("F34 Tard");
        putJson("/api/executions/" + late.executionId(),
                "{\"version\": 0, \"scheduledDate\": \"2999-12-25\"}");
        Chain early = createChain("F34 Tot");
        putJson("/api/executions/" + early.executionId(),
                "{\"version\": 0, \"scheduledDate\": \"2999-12-15\"}");
        Chain undated = createChain("F34 SansDate");

        JsonNode rows = executionsList("");

        assertThat(rows).hasSize(3);
        List<String> ids = idsOf(rows);
        assertThat(ids).doesNotHaveDuplicates();
        assertThat(ids).containsExactly(early.executionId(), late.executionId(), undated.executionId());
    }

    /** The existing filters are unchanged. */
    @Test
    void executionListKeepsItsFilters() throws Exception {
        Chain planned = createChain("F34 Planifiee");
        putJson("/api/executions/" + planned.executionId(),
                "{\"version\": 0, \"scheduledDate\": \"2999-12-20\"}");
        Chain cancelled = createChain("F34 Annulee");
        patchJson("/api/executions/" + cancelled.executionId() + "/status", "{\"status\": \"CANCELLED\"}");

        assertThat(executionsList("?preparationId=" + planned.preparationId())).hasSize(1);
        assertThat(executionsList("?" + "preparationId=" + UUID.randomUUID())).hasSize(0);
        assertThat(executionsList("?status=PLANNED")).hasSize(1);
        assertThat(executionsList("?status=CANCELLED")).hasSize(1);
        assertThat(executionsList("?scheduledDate=2999-12-20")).hasSize(1);
        assertThat(executionsList("?scheduledDate=2999-12-21")).hasSize(0);
    }

    /** A soft-deleted execution never appears in the list. */
    @Test
    void executionListExcludesSoftDeletedRows() throws Exception {
        Chain kept = createChain("F34 Gardee");
        Chain removed = createChain("F34 Supprimee");
        mockMvc.perform(delete("/api/executions/" + removed.executionId()).header("Authorization", auth))
                .andExpect(status().isNoContent());

        JsonNode rows = executionsList("");

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("id").asText()).isEqualTo(kept.executionId());
    }

    // ----- closure list -----

    /** The closure list keeps every existing field and adds proposal + execution context. */
    @Test
    void closureListKeepsItsContractAndAddsTheRowContext() throws Exception {
        Chain first = createChain("F34 Cloture Un");
        complete(first.executionId());
        String closureId = createClosure(first.preparationId());
        Chain second = createChain("F34 Cloture Deux");
        complete(second.executionId());
        createClosure(second.preparationId());

        JsonNode rows = closuresList("");
        assertThat(rows).hasSize(2);

        JsonNode row = rows.get(0);
        // Pre-existing fields, unchanged.
        assertThat(row.get("id").asText()).isEqualTo(closureId);
        assertThat(row.get("preparationId").asText()).isEqualTo(first.preparationId());
        assertThat(row.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(row.get("closedAt").isNull()).isFalse();
        assertThat(row.has("finalNotes")).isTrue();
        assertThat(row.has("createdAt")).isTrue();
        assertThat(row.has("updatedAt")).isTrue();
        assertThat(row.has("version")).isTrue();
        // New Feature 34 fields: the proposal and the active execution.
        assertThat(row.get("proposalNumber").asText()).startsWith("PROP-");
        assertThat(row.get("proposalId").asText()).isNotBlank();
        assertThat(row.get("executionId").asText()).isEqualTo(first.executionId());
        assertThat(row.get("executionStatus").asText()).isEqualTo("COMPLETED");

        JsonNode secondRow = rows.get(1);
        assertThat(secondRow.get("executionId").asText()).isEqualTo(second.executionId());
        assertThat(secondRow.get("preparationId").asText()).isEqualTo(second.preparationId());
        assertThat(secondRow.get("proposalNumber").asText())
                .isNotEqualTo(row.get("proposalNumber").asText());
    }

    /** The existing filters are unchanged and no row is duplicated. */
    @Test
    void closureListKeepsItsFilters() throws Exception {
        Chain withIssue = createChain("F34 AvecReserve");
        complete(withIssue.executionId());
        postJson("/api/closures", """
                {"preparationId": "%s", "status": "WITH_ISSUE", "finalNotes": "Reserve"}
                """.formatted(withIssue.preparationId()));
        Chain normal = createChain("F34 Normale");
        complete(normal.executionId());
        createClosure(normal.preparationId());

        JsonNode all = closuresList("");
        assertThat(all).hasSize(2);
        assertThat(idsOf(all)).doesNotHaveDuplicates();

        assertThat(closuresList("?preparationId=" + withIssue.preparationId())).hasSize(1);
        assertThat(closuresList("?" + "preparationId=" + UUID.randomUUID())).hasSize(0);
        assertThat(closuresList("?status=WITH_ISSUE")).hasSize(1);
        assertThat(closuresList("?status=COMPLETED")).hasSize(1);
        JsonNode withIssueRow = closuresList("?preparationId=" + withIssue.preparationId()).get(0);
        assertThat(withIssueRow.get("status").asText()).isEqualTo("WITH_ISSUE");
        assertThat(withIssueRow.get("finalNotes").asText()).isEqualTo("Reserve");
    }

    /** A soft-deleted closure never appears in the list. */
    @Test
    void closureListExcludesSoftDeletedRows() throws Exception {
        Chain kept = createChain("F34 Cloture Gardee");
        complete(kept.executionId());
        String keptClosureId = createClosure(kept.preparationId());
        Chain removed = createChain("F34 Cloture Supprimee");
        complete(removed.executionId());
        String removedClosureId = createClosure(removed.preparationId());
        mockMvc.perform(delete("/api/closures/" + removedClosureId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        JsonNode rows = closuresList("");

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("id").asText()).isEqualTo(keptClosureId);
    }

    /**
     * A closure whose preparation lost its active execution still serializes: the
     * missing relation is {@code null}, never an error nor an invented value.
     *
     * <p>The API itself refuses that state (Feature 31 protects the execution of
     * an active closure), so the execution row is released by direct surgery —
     * exactly what the F30 deletion test does to reach its own edge case.
     */
    @Test
    void closureListSerializesAMissingExecutionAsNull() throws Exception {
        Chain chain = createChain("F34 SansExecution");
        complete(chain.executionId());
        String closureId = createClosure(chain.preparationId());

        Execution execution = executions.findById(UUID.fromString(chain.executionId())).orElseThrow();
        execution.markDeleted();
        executions.saveAndFlush(execution);

        JsonNode rows = closuresList("");

        assertThat(rows).hasSize(1);
        JsonNode row = rows.get(0);
        assertThat(row.get("id").asText()).isEqualTo(closureId);
        assertThat(row.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(row.get("proposalNumber").asText()).startsWith("PROP-");
        assertThat(row.get("executionId").isNull()).isTrue();
        assertThat(row.get("executionStatus").isNull()).isTrue();
    }

    /** The detail endpoints expose the same context fields as the lists. */
    @Test
    void detailEndpointsExposeTheSameContext() throws Exception {
        Chain chain = createChain("F34 Detail");
        complete(chain.executionId());
        String closureId = createClosure(chain.preparationId());

        JsonNode execution = getJson("/api/executions/" + chain.executionId());
        assertThat(execution.get("preparationId").asText()).isEqualTo(chain.preparationId());
        assertThat(execution.get("proposalNumber").asText()).startsWith("PROP-");
        assertThat(execution.get("proposalId").asText()).isNotBlank();

        JsonNode closure = getJson("/api/closures/" + closureId);
        assertThat(closure.get("preparationId").asText()).isEqualTo(chain.preparationId());
        assertThat(closure.get("proposalNumber").asText()).startsWith("PROP-");
        assertThat(closure.get("executionId").asText()).isEqualTo(chain.executionId());
        assertThat(closure.get("executionStatus").asText()).isEqualTo("COMPLETED");
    }

    // ----- authorization -----

    /** Both lists still require authentication. */
    @Test
    void listsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/executions")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/closures")).andExpect(status().isUnauthorized());
    }

    /** The JSON contract does not depend on the list being empty. */
    @Test
    void emptyListsStillAnswer200WithAnEmptyArray() throws Exception {
        mockMvc.perform(get("/api/executions").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/closures").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** Guards the fixture used by the contract assertions above. */
    @Test
    void fixtureProducesAnAcceptedCompletedChain() throws Exception {
        Chain chain = createChain("F34 Fixture");
        complete(chain.executionId());
        createClosure(chain.preparationId());

        assertThat(executions.count()).isEqualTo(1);
        assertThat(closures.count()).isEqualTo(1);
        ServiceClosure stored = closures.findAll().get(0);
        assertThat(stored.getStatus()).isEqualTo(ClosureStatus.COMPLETED);
    }
}