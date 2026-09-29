package mg.rosii.management.document;

import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.execution.ExecutionRepository;
import mg.rosii.management.invoice.InvoiceRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.paymentreceipt.PaymentReceiptRepository;
import mg.rosii.management.preparation.PreparationRepository;
import mg.rosii.management.proposal.ProposalRepository;
import mg.rosii.management.security.JwtService;
import mg.rosii.management.user.Role;
import mg.rosii.management.user.User;
import mg.rosii.management.user.UserRepository;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * PDF document generation end-to-end (Feature 14) against a real PostgreSQL.
 * Skipped automatically without Docker.
 *
 * <p>Covers receipt and invoice PDF endpoints: 200 with application/pdf and a
 * clean Content-Disposition file name, a real parsable PDF (PDFBox) carrying
 * the document number, the SNAPSHOT values recorded on the receipt/invoice row
 * (amount, method label, payment date, reference, payment id), the available
 * client information and the signature area; 404 for unknown and soft-deleted
 * documents. The generation is read-only: no row is ever modified.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class DocumentPdfIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "document-pdf-tests@example.com";
    private static final String VALID_UNTIL = "2999-12-31";
    private static final String PAYMENT_DATE = "2026-09-20";

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
    private InvoiceRepository invoices;

    @Autowired
    private PaymentReceiptRepository receipts;

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
        // Full FK-safe reset, children first: this class may run after any other
        // workflow feature, so clear every workflow table whose rows would block
        // the deletion of payments (invoices and receipts both reference them).
        closures.deleteAll();
        executions.deleteAll();
        preparations.deleteAll();
        invoices.deleteAll();
        receipts.deleteAll();
        payments.deleteAll();
        proposals.deleteAll();
        User patronne = users.findByEmailAndDeletedAtIsNull(AUTH_EMAIL)
                .orElseGet(() -> users.saveAndFlush(new User(
                        AUTH_EMAIL, passwordEncoder.encode("not-used-for-login"), Role.PATRONNE)));
        auth = "Bearer " + jwtService.generateToken(patronne.getId(), patronne.getEmail(), patronne.getRole());
    }

    // ----- helpers -----

    private String createClient(String name, String phone) throws Exception {
        String body = mockMvc.perform(post("/api/clients").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"%s\", \"phone1\": \"%s\"}".formatted(name, phone)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private String createDemand(String clientId) throws Exception {
        String body = mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\": \"%s\", \"type\": \"EVENT\", \"budgetType\": \"NONE\"}"
                                .formatted(clientId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private String createAcceptedProposal() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String body = mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"clientId": "%s", "demandId": "%s", "title": "Mariage Rakoto",
                                 "validUntil": "%s", "requiredDeposit": 2000000,
                                 "lines": [{"description": "Prestation", "unit": "forfait",
                                  "quantity": 1, "unitPrice": 4000000}]}
                                """.formatted(clientId, demandId, VALID_UNTIL)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = objectMapper.readTree(body).get("id").asText();
        mockMvc.perform(patch("/api/proposals/" + id + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"SENT\", \"version\": 0}"))
                .andExpect(status().isOk());
        mockMvc.perform(patch("/api/proposals/" + id + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"ACCEPTED\", \"version\": 1}"))
                .andExpect(status().isOk());
        return id;
    }

    /** A payment of 500000 CASH with a reference, on its own ACCEPTED proposal. */
    private String createPayment() throws Exception {
        String proposalId = createAcceptedProposal();
        String body = mockMvc.perform(post("/api/payments").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"proposalId": "%s", "amount": 500000, "method": "CASH",
                                 "paymentDate": "%s", "reference": "VIRE-PDF-1", "notes": "Acompte"}
                                """.formatted(proposalId, PAYMENT_DATE)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private String createReceipt(String paymentId) throws Exception {
        String body = mockMvc.perform(post("/api/payment-receipts").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paymentId\": \"%s\"}".formatted(paymentId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private String createInvoice(String paymentId) throws Exception {
        String body = mockMvc.perform(post("/api/invoices").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paymentId\": \"%s\"}".formatted(paymentId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    /** GETs a PDF endpoint and returns the raw body bytes. */
    private byte[] getPdf(String url, String expectedFileName) throws Exception {
        MvcResult result = mockMvc.perform(get(url).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", MediaType.APPLICATION_PDF_VALUE))
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.containsString(expectedFileName)))
                .andReturn();
        return result.getResponse().getContentAsByteArray();
    }

    /** Extracts the text of a generated PDF with PDFBox (no extra test dependency). */
    private String pdfText(byte[] pdf) throws Exception {
        assertThat(pdf.length).isPositive();
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return new PDFTextStripper().getText(document);
        }
    }

    // ----- receipt PDF -----

    /** The receipt PDF renders the persisted snapshot data, not the current payment row. */
    @Test
    void generatesReceiptPdfWithSnapshotData() throws Exception {
        String paymentId = createPayment();
        String receiptId = createReceipt(paymentId);
        String receiptNumber = receipts.findById(UUID.fromString(receiptId)).orElseThrow()
                .getReceiptNumber();

        byte[] pdf = getPdf("/api/payment-receipts/" + receiptId + "/pdf",
                receiptNumber + ".pdf");

        String text = pdfText(pdf);
        assertThat(text).contains("Groupe Chez Rosii");
        assertThat(text).contains("Reçu de paiement");
        assertThat(text).contains(receiptNumber);
        assertThat(text).contains("Alice Rakoto");
        assertThat(text).contains("+261 34 12 34 56 78");
        assertThat(text).contains("500000.00");
        assertThat(text).contains("Espèces");
        assertThat(text).contains(PAYMENT_DATE);
        assertThat(text).contains("VIRE-PDF-1");
        assertThat(text).contains(paymentId);
        assertThat(text).contains("Cachet et signature");
        // Read-only feature: nothing was created or modified in the workflow tables.
        assertThat(payments.count()).isEqualTo(1);
        assertThat(receipts.count()).isEqualTo(1);
    }

    /** Unknown receipt: 404, no PDF. */
    @Test
    void receiptPdfOfUnknownReceiptIs404() throws Exception {
        mockMvc.perform(get("/api/payment-receipts/" + UUID.randomUUID() + "/pdf")
                        .header("Authorization", auth))
                .andExpect(status().isNotFound());
    }

    /** A soft-deleted receipt must never generate a document. */
    @Test
    void receiptPdfOfDeletedReceiptIs404() throws Exception {
        String receiptId = createReceipt(createPayment());
        mockMvc.perform(delete("/api/payment-receipts/" + receiptId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/payment-receipts/" + receiptId + "/pdf")
                        .header("Authorization", auth))
                .andExpect(status().isNotFound());
    }

    // ----- invoice PDF -----

    /** The invoice PDF uses the invoice snapshot, never a re-read of the payment. */
    @Test
    void generatesInvoicePdfWithSnapshotData() throws Exception {
        String paymentId = createPayment();
        String invoiceId = createInvoice(paymentId);
        String invoiceNumber = invoices.findById(UUID.fromString(invoiceId)).orElseThrow()
                .getInvoiceNumber();

        byte[] pdf = getPdf("/api/invoices/" + invoiceId + "/pdf", invoiceNumber + ".pdf");

        String text = pdfText(pdf);
        assertThat(text).contains("Groupe Chez Rosii");
        assertThat(text).contains("Facture");
        assertThat(text).contains(invoiceNumber);
        assertThat(text).contains("Alice Rakoto");
        assertThat(text).contains("+261 34 12 34 56 78");
        assertThat(text).contains("500000.00");
        assertThat(text).contains("Espèces");
        assertThat(text).contains(PAYMENT_DATE);
        assertThat(text).contains("VIRE-PDF-1");
        assertThat(text).contains(paymentId);
        assertThat(text).contains("Cachet et signature");
        assertThat(payments.count()).isEqualTo(1);
        assertThat(invoices.count()).isEqualTo(1);
    }

    /** Unknown invoice: 404, no PDF. */
    @Test
    void invoicePdfOfUnknownInvoiceIs404() throws Exception {
        mockMvc.perform(get("/api/invoices/" + UUID.randomUUID() + "/pdf")
                        .header("Authorization", auth))
                .andExpect(status().isNotFound());
    }

    /** A soft-deleted invoice must never generate a document. */
    @Test
    void invoicePdfOfDeletedInvoiceIs404() throws Exception {
        String invoiceId = createInvoice(createPayment());
        mockMvc.perform(delete("/api/invoices/" + invoiceId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/invoices/" + invoiceId + "/pdf")
                        .header("Authorization", auth))
                .andExpect(status().isNotFound());
    }
}
