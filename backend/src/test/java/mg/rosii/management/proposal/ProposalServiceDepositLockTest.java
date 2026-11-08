package mg.rosii.management.proposal;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import mg.rosii.management.client.Client;
import mg.rosii.management.client.ClientRepository;
import mg.rosii.management.demand.Demand;
import mg.rosii.management.demand.DemandRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.preparation.Preparation;
import mg.rosii.management.preparation.PreparationRepository;
import mg.rosii.management.proposal.dto.ProposalResponse;
import mg.rosii.management.service.ServiceRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit-level guard of the Feature 22 deposit lock (no Spring context, no
 * database): the service must take the proposal row lock, refuse with 409 as
 * soon as an active preparation exists, and never write in that case. The real
 * HTTP/PostgreSQL behavior is covered by {@link DepositLockIntegrationTest}.
 */
class ProposalServiceDepositLockTest {

    private final UUID proposalId = UUID.randomUUID();

    private ProposalRepository proposals;
    private PreparationRepository preparations;
    private PaymentRepository payments;
    private ProposalService service;
    private Proposal proposal;

    @BeforeEach
    void setUp() {
        proposals = mock(ProposalRepository.class);
        preparations = mock(PreparationRepository.class);
        payments = mock(PaymentRepository.class);

        proposal = new Proposal();
        Client client = mock(Client.class);
        when(client.getId()).thenReturn(UUID.randomUUID());
        Demand demand = mock(Demand.class);
        when(demand.getId()).thenReturn(UUID.randomUUID());
        proposal.setClient(client);
        proposal.setDemand(demand);
        proposal.setNumber("PROP-2026-0001");
        proposal.setStatus(ProposalStatus.ACCEPTED);
        ProposalLine line = new ProposalLine();
        line.setDescription("Prestation");
        line.setUnit("forfait");
        line.setQuantity(BigDecimal.ONE);
        line.setUnitPrice(new BigDecimal("4000000"));
        proposal.replaceLines(List.of(line));
        proposal.changeRequiredDeposit(new BigDecimal("2000000"));

        service = new ProposalService(proposals, mock(ClientRepository.class),
                mock(DemandRepository.class), mock(ServiceRepository.class), payments, preparations);
    }

    @Test
    void locksTheProposalAndRefusesWhenAnActivePreparationExists() {
        when(proposals.findActiveForUpdate(proposalId)).thenReturn(Optional.of(proposal));
        when(preparations.findByProposalIdAndDeletedAtIsNull(proposalId))
                .thenReturn(Optional.of(new Preparation()));

        assertThatThrownBy(() -> service.updateDeposit(proposalId, new BigDecimal("2500000"), 0L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        exception -> assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        verify(proposals).findActiveForUpdate(proposalId);
        verify(proposals, never()).saveAndFlush(any());
        assertThat(proposal.getRequiredDeposit()).isEqualByComparingTo("2000000");
    }

    @Test
    void locksTheProposalAndAppliesTheChangeWithoutPreparation() {
        when(proposals.findActiveForUpdate(proposalId)).thenReturn(Optional.of(proposal));
        when(preparations.findByProposalIdAndDeletedAtIsNull(proposalId)).thenReturn(Optional.empty());
        when(payments.sumActiveByProposalId(proposalId)).thenReturn(BigDecimal.ZERO);
        when(proposals.saveAndFlush(proposal)).thenReturn(proposal);

        ProposalResponse response = service.updateDeposit(proposalId, new BigDecimal("2500000"), 0L);

        verify(proposals).findActiveForUpdate(proposalId);
        assertThat(response.requiredDeposit()).isEqualByComparingTo("2500000");
        assertThat(response.version()).isZero();
        assertThat(proposal.getRequiredDepositUpdatedAt()).isNotNull();
    }

    @Test
    void unknownProposalStillAnswers404AfterTakingTheLockLookup() {
        when(proposals.findActiveForUpdate(proposalId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateDeposit(proposalId, new BigDecimal("2500000"), 0L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        exception -> assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));

        verify(preparations, never()).findByProposalIdAndDeletedAtIsNull(any());
    }
}
