package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.HealingAction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface HealingActionRepository extends JpaRepository<HealingAction, UUID> {
    List<HealingAction> findByIncidentIdOrderByCreatedAtDesc(UUID incidentId);
    List<HealingAction> findByStatusOrderByCreatedAtDesc(HealingAction.HealingStatus status);
    List<HealingAction> findByActionType(String actionType);
    List<HealingAction> findByActionTypeOrderByCreatedAtDesc(String actionType);
}
