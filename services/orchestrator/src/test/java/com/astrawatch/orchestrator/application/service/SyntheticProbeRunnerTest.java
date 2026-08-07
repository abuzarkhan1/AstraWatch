package com.astrawatch.orchestrator.application.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SyntheticProbeRunnerTest {

    @Test
    void uptimePercentIsPercentageScale() {
        // 95 passes out of 100 must read 95.0 (the frontend renders this as %)
        assertEquals(95.0, SyntheticProbeRunner.uptimePercent(95, 100), 0.001);
        assertEquals(100.0, SyntheticProbeRunner.uptimePercent(100, 100), 0.001);
        assertEquals(0.0, SyntheticProbeRunner.uptimePercent(0, 100), 0.001);
    }

    @Test
    void uptimePercentRoundsToTwoDecimals() {
        // 1 pass of 3 = 33.3333... -> 33.33
        assertEquals(33.33, SyntheticProbeRunner.uptimePercent(1, 3), 0.001);
        // 2 passes of 3 = 66.6666... -> 66.67
        assertEquals(66.67, SyntheticProbeRunner.uptimePercent(2, 3), 0.001);
    }

    @Test
    void uptimePercentGuardsEmpty() {
        assertEquals(0.0, SyntheticProbeRunner.uptimePercent(0, 0), 0.001);
        assertEquals(0.0, SyntheticProbeRunner.uptimePercent(5, 0), 0.001);
    }
}
