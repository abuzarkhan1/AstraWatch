package validate

import (
	"time"

	"github.com/astrawatch/collector/pkg"
)

type Validator struct {
	maxTimestampSkew time.Duration
}

func NewValidator() *Validator {
	return &Validator{
		maxTimestampSkew: 24 * time.Hour,
	}
}

func (v *Validator) ValidateBatch(batch pkg.MetricBatch) (valid pkg.MetricBatch, rejected []pkg.ValidationError) {
	valid = batch
	valid.Metrics = make([]pkg.MetricPoint, 0, len(batch.Metrics))
	now := time.Now()

	for i, m := range batch.Metrics {
		errs := v.validateMetricPoint(m, now)
		if len(errs) > 0 {
			rejected = append(rejected, pkg.ValidationError{
				Index: i,
				Field: errs[0].Field,
				Error: errs[0].Error,
			})
			continue
		}
		valid.Metrics = append(valid.Metrics, m)
	}

	if batch.ServiceID == "" {
		for i := range valid.Metrics {
			rejected = append(rejected, pkg.ValidationError{
				Index: i,
				Field: "serviceId",
				Error: "missing service ID",
			})
		}
		valid.Metrics = nil
		return valid, rejected
	}

	return valid, rejected
}

func (v *Validator) validateMetricPoint(m pkg.MetricPoint, now time.Time) []pkg.ValidationError {
	var errs []pkg.ValidationError

	if m.Name == "" {
		errs = append(errs, pkg.ValidationError{Field: "name", Error: "metric name is required"})
	}
	if m.Timestamp.IsZero() {
		errs = append(errs, pkg.ValidationError{Field: "ts", Error: "timestamp is required"})
	} else if diff := now.Sub(m.Timestamp); diff < 0 || diff > v.maxTimestampSkew {
		errs = append(errs, pkg.ValidationError{Field: "ts", Error: "timestamp out of acceptable range"})
	}

	return errs
}

func (v *Validator) ValidateLog(entry *pkg.LogEntry) []string {
	var errs []string
	if entry.ServiceID == "" {
		errs = append(errs, "missing service ID")
	}
	if entry.Message == "" {
		errs = append(errs, "missing log message")
	}
	if entry.Timestamp.IsZero() {
		errs = append(errs, "missing timestamp")
	}
	return errs
}
