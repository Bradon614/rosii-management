package mg.rosii.management.payment;

/**
 * How a payment was received (Feature 08).
 *
 * <p>Deliberately minimal: only the methods actually used by ROSII. Cheques,
 * card payments, etc. would be added when the business needs them.
 */
public enum PaymentMethod {
    /** Espèces */
    CASH,
    /** Mobile Money */
    MOBILE_MONEY,
    /** Virement bancaire */
    BANK_TRANSFER
}
