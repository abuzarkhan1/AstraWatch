import unittest
import asyncio
from app.schemas import RootCauseRequest, RootCauseResult, AIDiagnosis, SuggestedFix
from app.services.anomaly_service import anomaly_service
from app.ml.causal import generate_ai_diagnosis


class TestAnomalyService(unittest.TestCase):
    def test_generate_ai_diagnosis(self):
        diagnosis = generate_ai_diagnosis(service_id="payment")
        self.assertIn("NullPointerException", diagnosis["summary"])
        self.assertIn("targetFile", diagnosis["suggestedFix"])
        self.assertIn("patch", diagnosis["suggestedFix"])
        self.assertIn("explanation", diagnosis["suggestedFix"])

    def test_root_cause_analysis_endpoint_schema(self):
        req = RootCauseRequest(incidentId="inc-123", serviceId="payment")
        result = asyncio.run(anomaly_service.root_cause_analysis(req))
        self.assertIsInstance(result, RootCauseResult)
        self.assertIsNotNone(result.aiDiagnosis)
        self.assertIsInstance(result.aiDiagnosis, AIDiagnosis)
        self.assertIsInstance(result.aiDiagnosis.suggestedFix, SuggestedFix)


if __name__ == "__main__":
    unittest.main()
