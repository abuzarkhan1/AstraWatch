package com.astrawatch.orchestrator.infrastructure.config;

import com.astrawatch.orchestrator.domain.model.IncidentLifecycleEvent;
import com.astrawatch.orchestrator.domain.model.IncidentLifecycleState;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.statemachine.config.EnableStateMachineFactory;
import org.springframework.statemachine.config.StateMachineConfigurerAdapter;
import org.springframework.statemachine.config.builders.StateMachineStateConfigurer;
import org.springframework.statemachine.config.builders.StateMachineTransitionConfigurer;

@Configuration
@EnableStateMachineFactory
public class StateMachineConfig extends StateMachineConfigurerAdapter<IncidentLifecycleState, IncidentLifecycleEvent> {

    @Override
    public void configure(StateMachineStateConfigurer<IncidentLifecycleState, IncidentLifecycleEvent> states) throws Exception {
        states.withStates()
                .initial(IncidentLifecycleState.DETECTED)
                .state(IncidentLifecycleState.TRIAGED)
                .state(IncidentLifecycleState.INVESTIGATING)
                .state(IncidentLifecycleState.HEALING)
                .state(IncidentLifecycleState.VALIDATING)
                .state(IncidentLifecycleState.RESOLVED)
                .state(IncidentLifecycleState.ROLLED_BACK)
                .state(IncidentLifecycleState.ESCALATED)
                .end(IncidentLifecycleState.RESOLVED)
                .end(IncidentLifecycleState.ROLLED_BACK);
    }

    @Override
    public void configure(StateMachineTransitionConfigurer<IncidentLifecycleState, IncidentLifecycleEvent> transitions) throws Exception {
        transitions
                .withExternal()
                    .source(IncidentLifecycleState.DETECTED)
                    .target(IncidentLifecycleState.TRIAGED)
                    .event(IncidentLifecycleEvent.TRIAGE)
                .and()
                .withExternal()
                    .source(IncidentLifecycleState.TRIAGED)
                    .target(IncidentLifecycleState.INVESTIGATING)
                    .event(IncidentLifecycleEvent.START_INVESTIGATION)
                .and()
                .withExternal()
                    .source(IncidentLifecycleState.INVESTIGATING)
                    .target(IncidentLifecycleState.HEALING)
                    .event(IncidentLifecycleEvent.HEAL)
                .and()
                .withExternal()
                    .source(IncidentLifecycleState.INVESTIGATING)
                    .target(IncidentLifecycleState.ESCALATED)
                    .event(IncidentLifecycleEvent.ESCALATE)
                .and()
                .withExternal()
                    .source(IncidentLifecycleState.HEALING)
                    .target(IncidentLifecycleState.VALIDATING)
                    .event(IncidentLifecycleEvent.VALIDATE)
                .and()
                .withExternal()
                    .source(IncidentLifecycleState.HEALING)
                    .target(IncidentLifecycleState.ROLLED_BACK)
                    .event(IncidentLifecycleEvent.ROLLBACK)
                .and()
                .withExternal()
                    .source(IncidentLifecycleState.VALIDATING)
                    .target(IncidentLifecycleState.RESOLVED)
                    .event(IncidentLifecycleEvent.RESOLVE)
                .and()
                .withExternal()
                    .source(IncidentLifecycleState.VALIDATING)
                    .target(IncidentLifecycleState.ROLLED_BACK)
                    .event(IncidentLifecycleEvent.ROLLBACK)
                .and()
                .withExternal()
                    .source(IncidentLifecycleState.ESCALATED)
                    .target(IncidentLifecycleState.INVESTIGATING)
                    .event(IncidentLifecycleEvent.START_INVESTIGATION);
    }

    @Bean
    public String stateMachineInitialized() {
        return "incident-state-machine-ready";
    }
}
