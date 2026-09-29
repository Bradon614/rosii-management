package mg.rosii.management.document;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import mg.rosii.management.client.Client;
import mg.rosii.management.invoice.Invoice;
import mg.rosii.management.invoice.InvoiceRepository;
import mg.rosii.management.payment.PaymentMethod;
import mg.rosii.management.paymentreceipt.PaymentReceipt;
import mg.rosii.management.paymentreceipt.PaymentReceiptRepository;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * PDF document generation (Feature 14): renders the PDF of an EXISTING receipt
 * (Feature 12) or invoice (Feature 13), purely as a presentation layer above the
 * persisted data. No business rule lives here and no table is written: the
 * documents are built from the SNAPSHOT fields recorded on the receipt/invoice
 * rows — the current payment row is never read back, so later payment changes
 * can never alter a historical document. Only data actually present in the
 * project is rendered (enterprise name "Groupe Chez Rosii", client name/phones/
 * email via Payment -&gt; Proposal -&gt; Client); nothing is invented.
 *
 * <p>Soft-deleted or unknown documents are answered 404, following the existing
 * per-service convention ({@link ResponseStatusException}) — no global exception
 * system is introduced.
 */
@Service
public class DocumentPdfService {

    private static final String ENTERPRISE_NAME = "Groupe Chez Rosii";
    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private final PaymentReceiptRepository receipts;
    private final InvoiceRepository invoices;

    public DocumentPdfService(PaymentReceiptRepository receipts, InvoiceRepository invoices) {
        this.receipts = receipts;
        this.invoices = invoices;
    }

    /** PDF of an active receipt; 404 when unknown or soft-deleted. */
    @Transactional(readOnly = true)
    public DocumentPdf receiptPdf(UUID id) {
        PaymentReceipt receipt = receipts.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> notFound("payment receipt not found"));
        Client client = receipt.getPayment().getProposal().getClient();
        return new DocumentPdf(receipt.getReceiptNumber() + ".pdf",
                render(ENTERPRISE_NAME, "Reçu de paiement", receipt.getReceiptNumber(),
                        receipt.getCreatedAt(), client, fields -> {
                            fields.add("Montant payé", money(receipt.getAmount()));
                            fields.add("Méthode de paiement", methodLabel(receipt.getPaymentMethod()));
                            fields.add("Date du paiement", ISO_DATE.format(receipt.getPaymentDate()));
                            if (isPresent(receipt.getPaymentReference())) {
                                fields.add("Référence du paiement", receipt.getPaymentReference());
                            }
                            fields.add("Paiement", receipt.getPayment().getId().toString());
                        }));
    }

    /** PDF of an active invoice; 404 when unknown or soft-deleted. */
    @Transactional(readOnly = true)
    public DocumentPdf invoicePdf(UUID id) {
        Invoice invoice = invoices.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> notFound("invoice not found"));
        Client client = invoice.getPayment().getProposal().getClient();
        return new DocumentPdf(invoice.getInvoiceNumber() + ".pdf",
                render(ENTERPRISE_NAME, "Facture", invoice.getInvoiceNumber(),
                        invoice.getIssuedAt(), client, fields -> {
                            fields.add("Montant", money(invoice.getAmount()));
                            fields.add("Méthode de paiement", methodLabel(invoice.getPaymentMethod()));
                            fields.add("Date du paiement", ISO_DATE.format(invoice.getPaymentDate()));
                            if (isPresent(invoice.getPaymentReference())) {
                                fields.add("Référence du paiement", invoice.getPaymentReference());
                            }
                            fields.add("Paiement", invoice.getPayment().getId().toString());
                        }));
    }

    private static boolean isPresent(String value) {
        return value != null && !value.isBlank();
    }

    private static ResponseStatusException notFound(String reason) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, reason);
    }

    /** Collects the document fields, only when actually available. */
    @FunctionalInterface
    private interface FieldCollector {
        void collect(Fields fields);
    }

    private static final class Fields {
        private final List<String[]> lines = new ArrayList<>();

        void add(String label, String value) {
            lines.add(new String[] { label, value });
        }
    }

    /** Shared A4 layout: enterprise header, type and number, client block, fields, signature area. */
    private static byte[] render(String enterprise, String documentType, String documentNumber,
            OffsetDateTime issuedAt, Client client, FieldCollector collector) {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                PDFont regular = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
                PDFont bold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);

                text(cs, bold, 20, 60, 790, enterprise);
                text(cs, regular, 11, 60, 772, documentType);
                text(cs, bold, 14, 60, 740, documentNumber);
                text(cs, regular, 10, 60, 724, "Émis le : " + ISO_DATE.format(
                        issuedAt.atZoneSameInstant(ZoneOffset.UTC).toLocalDate()));

                text(cs, bold, 12, 60, 690, "Client");
                text(cs, regular, 11, 60, 674, client.getName());
                float y = 658;
                if (isPresent(client.getPhone1())) {
                    text(cs, regular, 11, 60, y, "Téléphone : " + client.getPhone1());
                    y -= 16;
                }
                if (isPresent(client.getPhone2())) {
                    text(cs, regular, 11, 60, y, "Téléphone 2 : " + client.getPhone2());
                    y -= 16;
                }
                if (isPresent(client.getEmail())) {
                    text(cs, regular, 11, 60, y, "Email : " + client.getEmail());
                    y -= 16;
                }

                y -= 18;
                text(cs, bold, 12, 60, y, "Paiement");
                y -= 18;
                Fields fields = new Fields();
                collector.collect(fields);
                for (String[] field : fields.lines) {
                    text(cs, regular, 11, 60, y, field[0] + " : " + field[1]);
                    y -= 18;
                }

                // Signature / stamp area, bottom right — an empty framed box to fill by hand.
                float boxWidth = 220;
                float boxHeight = 110;
                float boxX = page.getMediaBox().getWidth() - boxWidth - 60;
                cs.setLineWidth(0.8f);
                cs.addRect(boxX, 90, boxWidth, boxHeight);
                cs.stroke();
                text(cs, regular, 10, boxX + 10, 185, "Cachet et signature");
            }
            document.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            // Never exposed to the client; the API answers 200 or 404 only.
            throw new IllegalStateException("PDF generation failed for " + documentNumber, e);
        }
    }

    private static void text(PDPageContentStream cs, PDFont font, float size, float x, float y, String value)
            throws IOException {
        cs.beginText();
        cs.setFont(font, size);
        cs.newLineAtOffset(x, y);
        cs.showText(value);
        cs.endText();
    }

    private static String money(BigDecimal amount) {
        return amount.toPlainString();
    }

    private static String methodLabel(PaymentMethod method) {
        return switch (method) {
            case CASH -> "Espèces";
            case MOBILE_MONEY -> "Mobile Money";
            case BANK_TRANSFER -> "Virement bancaire";
        };
    }
}
