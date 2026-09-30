-- Feature 15: service modification and cancellation. The execution already
-- carries everything the cancellation needs since V9 — the CANCELLED status of
-- the strict state machine and the server-stamped cancelled_at timestamp.
-- The only missing piece is the optional free-text reason recorded once at
-- cancellation time (max 2000 characters, validated by the API). No refund,
-- no accounting: the 25% retention is derived at read time from the proposal
-- total and the active payments, never stored.
--
-- History is untouched by design: payments, receipts and invoices are never
-- modified nor deleted by a cancellation, so no column is added there.

ALTER TABLE executions ADD COLUMN cancellation_reason varchar(2000);
