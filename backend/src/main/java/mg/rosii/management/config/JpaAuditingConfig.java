package mg.rosii.management.config;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.auditing.DateTimeProvider;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * Enables Spring Data JPA auditing for future business entities.
 *
 * <p>Entities opt in by declaring {@code @EntityListeners(AuditingEntityListener.class)}
 * and annotating their timestamp fields with {@code @CreatedDate} / {@code @LastModifiedDate}.
 * See docs/database-conventions.md for the full convention.
 */
@Configuration
@EnableJpaAuditing(dateTimeProviderRef = "utcDateTimeProvider")
public class JpaAuditingConfig {

    /** Supplies audit timestamps in UTC so every device and server shares one clock. */
    @Bean
    public DateTimeProvider utcDateTimeProvider() {
        return () -> Optional.of(OffsetDateTime.now(ZoneOffset.UTC));
    }
}
