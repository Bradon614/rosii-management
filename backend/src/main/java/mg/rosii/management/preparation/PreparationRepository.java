package mg.rosii.management.preparation;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * All queries exclude soft-deleted preparations explicitly (no global Hibernate
 * filter, per docs/database-conventions.md).
 */
public interface PreparationRepository extends JpaRepository<Preparation, UUID> {

    Optional<Preparation> findByIdAndDeletedAtIsNull(UUID id);

    /** The preparation linked to a proposal (the workflow defines only one). */
    Optional<Preparation> findByProposalIdAndDeletedAtIsNull(UUID proposalId);
}
