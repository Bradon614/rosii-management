package mg.rosii.management.closure.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import mg.rosii.management.closure.ClosureStatus;

/**
 * Closure creation payload: the preparation to close. {@code status} may be
 * omitted (the service defaults it to COMPLETED); {@code finalNotes} is an
 * optional remark of at most 2000 characters. {@code closedAt} deliberately does
 * not exist here: the timestamp is always stamped by the server.
 *
 * <p>The service enforces every workflow gate (existing preparation 404,
 * ACCEPTED proposal 409, reached required deposit 409, existing COMPLETED
 * execution 404/409, one active closure per preparation 409).
 */
public record CreateClosureRequest(
        @NotNull UUID preparationId,
        ClosureStatus status,
        @Size(max = 2000) String finalNotes) {
}