package mg.rosii.management.invoice;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;

import mg.rosii.management.document.DocumentPdf;
import mg.rosii.management.document.DocumentPdfService;
import mg.rosii.management.invoice.dto.CreateInvoiceRequest;
import mg.rosii.management.invoice.dto.InvoiceResponse;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Invoice API. Requires authentication via the existing security config (no
 * permitAll additions); V1 single-role PATRONNE. Only the endpoints of the real
 * invoice scope exist: create, read (by id or filtered list) and soft delete.
 * There is deliberately NO PUT: an invoice is an immutable financial document
 * (any PUT on /{id} is answered 405 by the framework since only GET and DELETE
 * are mapped). PDF rendering of the persisted snapshot is provided by the
 * document layer (Feature 14) via GET /{id}/pdf.
 */
@RestController
@RequestMapping("/api/invoices")
public class InvoiceController {

    private final InvoiceService invoiceService;
    private final DocumentPdfService documentPdfService;

    public InvoiceController(InvoiceService invoiceService, DocumentPdfService documentPdfService) {
        this.invoiceService = invoiceService;
        this.documentPdfService = documentPdfService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public InvoiceResponse create(@Valid @RequestBody CreateInvoiceRequest request) {
        return invoiceService.create(request);
    }

    /** Optional combined filters: /api/invoices?paymentId=&invoiceNumber= */
    @GetMapping
    public List<InvoiceResponse> list(
            @RequestParam(required = false) UUID paymentId,
            @RequestParam(required = false) String invoiceNumber) {
        return invoiceService.list(paymentId, invoiceNumber);
    }

    @GetMapping("/{id}")
    public InvoiceResponse get(@PathVariable UUID id) {
        return invoiceService.get(id);
    }

    /**
     * PDF of the invoice (Feature 14), rendered from the persisted invoice
     * snapshot only (never from the current payment row); 404 for an unknown or
     * soft-deleted invoice. Read-only: no modification of the document is
     * possible through this endpoint.
     */
    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable UUID id) {
        DocumentPdf pdf = documentPdfService.invoicePdf(id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(pdf.fileName()).build().toString())
                .body(pdf.content());
    }

    /** Soft delete: the invoice disappears from the API but the row and number are kept. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        invoiceService.delete(id);
    }

    /** True concurrent modification caught by @Version at flush — clean 409. */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleConcurrentModification(
            OptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "invoice was modified concurrently; reload and retry"));
    }
}