import { useState } from "react";
import { FileDown, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError, downloadPdf } from "@/lib/api";

interface PdfDownloadButtonProps {
  /** API path of the document, e.g. `/api/invoices/{id}/pdf`. */
  path: string;
  /** Filename used when the server does not provide one. */
  fallbackFilename: string;
  label: string;
  /** Extra description for screen readers, e.g. "du reçu REC-2026-0001". */
  srLabel: string;
}

/**
 * Downloads a backend-generated PDF with the current JWT. The file is fetched
 * with `fetch` (so the Authorization header is sent) and then saved by the
 * webview; no document is built on the frontend.
 */
export function PdfDownloadButton({
  path,
  fallbackFilename,
  label,
  srLabel,
}: PdfDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      await downloadPdf(path, fallbackFilename);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Téléchargement impossible. Réessayez.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={loading}
        aria-label={`${label} ${srLabel}`}
      >
        {loading ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : (
          <FileDown aria-hidden />
        )}
        {label}
      </Button>
      {error ? (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      ) : null}
    </div>
  );
}
