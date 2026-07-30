package com.astrawatch.orchestrator.domain.model;

public enum IncidentLifecycleState {
    DETECTED,
    TRIAGED,
    INVESTIGATING,
    HEALING,
    VALIDATING,
    RESOLVED,
    ROLLED_BACK,
    ESCALATED;

    public static IncidentLifecycleState fromIncidentState(Incident.IncidentState state) {
        return valueOf(state.name());
    }

    public Incident.IncidentState toIncidentState() {
        return Incident.IncidentState.valueOf(name());
    }
}
