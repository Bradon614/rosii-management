package mg.rosii.management.document;

/**
 * A generated PDF document: its download file name (based on the document
 * number, e.g. REC-2026-0001.pdf) and its bytes. Pure value object — the
 * service layer returns it, controllers only turn it into a response.
 */
public record DocumentPdf(String fileName, byte[] content) {
}
