package com.astrawatch.orchestrator.domain.model;

public enum IncidentLifecycleEvent {
    TRIAGE,
    START_INVESTIGATION,
    HEAL,
    VALIDATE,
    RESOLVE,
    ROLLBACK,
    ESCALATE
}
