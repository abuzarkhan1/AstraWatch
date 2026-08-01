package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
)

const DLQTopic = "astrawatch-dlq"

type Consumer struct {
	client *kgo.Client
	dlq    *kgo.Client
	db     driver.Conn
	log    *zap.Logger
}

func NewConsumer(brokers []string, db driver.Conn, log *zap.Logger) (*Consumer, error) {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.ConsumerGroup("astrawatch-clickhouse-writer"),
		kgo.ConsumeTopics("raw-metrics", "raw-logs", "raw-traces"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create kafka consumer client: %w", err)
	}

	// Dedicated producer for the dead-letter topic (audit Phase 7 — failed
	// records are parked on astrawatch-dlq instead of being silently dropped, so
	// a reconciler/operator can reprocess or alert on them).
	dlq, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.DefaultProduceTopic(DLQTopic),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create dlq producer client: %w", err)
	}

	return &Consumer{
		client: client,
		dlq:    dlq,
		db:     db,
		log:    log,
	}, nil
}

func (c *Consumer) Start(ctx context.Context) {
	c.log.Info("Starting Kafka consumer for ClickHouse writer")

	for {
		fetches := c.client.PollFetches(ctx)
		if errs := fetches.Errors(); len(errs) > 0 {
			for _, err := range errs {
				c.log.Error("Kafka fetch error", zap.Error(err.Err), zap.String("topic", err.Topic))
			}
			continue
		}

		var metricsBatch []map[string]interface{}
		var logsBatch []map[string]interface{}
		var tracesBatch []map[string]interface{}

		fetches.EachRecord(func(record *kgo.Record) {
			switch record.Topic {
			case "raw-metrics":
				var metric map[string]interface{}
				if err := json.Unmarshal(record.Value, &metric); err != nil {
					c.log.Error("failed to unmarshal metric, sending to DLQ", zap.Error(err))
					c.sendToDLQ(ctx, record, "unmarshal", err.Error())
					return
				}
				metricsBatch = append(metricsBatch, metric)
			case "raw-logs":
				var logEntry map[string]interface{}
				if err := json.Unmarshal(record.Value, &logEntry); err != nil {
					c.log.Error("failed to unmarshal log entry, sending to DLQ", zap.Error(err))
					c.sendToDLQ(ctx, record, "unmarshal", err.Error())
					return
				}
				logsBatch = append(logsBatch, logEntry)
			case "raw-traces":
				var traceEntry map[string]interface{}
				if err := json.Unmarshal(record.Value, &traceEntry); err != nil {
					c.log.Error("failed to unmarshal trace entry, sending to DLQ", zap.Error(err))
					c.sendToDLQ(ctx, record, "unmarshal", err.Error())
					return
				}
				tracesBatch = append(tracesBatch, traceEntry)
			}
		})

		if len(metricsBatch) > 0 {
			if err := c.insertMetrics(ctx, metricsBatch); err != nil {
				c.log.Error("failed to insert metrics to ClickHouse", zap.Error(err))
				c.sendBatchToDLQ(ctx, "raw-metrics", metricsBatch, err.Error())
			}
		}

		if len(logsBatch) > 0 {
			if err := c.insertLogs(ctx, logsBatch); err != nil {
				c.log.Error("failed to insert logs to ClickHouse", zap.Error(err))
				c.sendBatchToDLQ(ctx, "raw-logs", logsBatch, err.Error())
			}
		}

		if len(tracesBatch) > 0 {
			if err := c.insertTraces(ctx, tracesBatch); err != nil {
				c.log.Error("failed to insert traces to ClickHouse", zap.Error(err))
				c.sendBatchToDLQ(ctx, "raw-traces", tracesBatch, err.Error())
			}
		}
	}
}

// sendToDLQ parks a single record that failed to parse on the dead-letter topic
// with a reason header so a reconciler can reprocess or alert.
func (c *Consumer) sendToDLQ(ctx context.Context, record *kgo.Record, reason, detail string) {
	if c.dlq == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	payload, _ := json.Marshal(map[string]interface{}{
		"originalTopic": record.Topic,
		"partition":     record.Partition,
		"offset":        record.Offset,
		"key":           string(record.Key),
		"reason":        reason,
		"detail":        detail,
		"originalValue": string(record.Value),
	})

	if err := c.dlq.ProduceSync(ctx, &kgo.Record{
		Key:   record.Key,
		Value: payload,
		Headers: []kgo.RecordHeader{
			{Key: "original-topic", Value: []byte(record.Topic)},
			{Key: "dlq-reason", Value: []byte(reason)},
		},
	}).FirstErr(); err != nil {
		c.log.Error("failed to publish record to DLQ", zap.Error(err), zap.String("topic", record.Topic))
	}
}

// sendBatchToDLQ parks a batch that failed ClickHouse insertion.
func (c *Consumer) sendBatchToDLQ(ctx context.Context, topic string, batch []map[string]interface{}, detail string) {
	for _, m := range batch {
		raw, err := json.Marshal(m)
		if err != nil {
			continue
		}
		c.sendToDLQ(ctx, &kgo.Record{
			Topic:   topic,
			Key:     []byte(topic),
			Value:   raw,
			Offset:  -1,
			Partition: -1,
		}, "insert-failed", detail)
	}
}

// ── Defensive extraction helpers (audit F8) ────────────────────────────────
// A malformed Kafka message must never panic the consumer goroutine (which would
// crash the whole process). Every access goes through a safe cast that logs a
// warning and falls back to a zero value / skip for the offending record.

func (c *Consumer) logBad(msg string, key string) {
	c.log.Warn("dropping record with malformed field",
		zap.String("field", msg), zap.String("recordKey", key))
}

func strVal(m map[string]interface{}, key string) (string, bool) {
	v, ok := m[key]
	if !ok || v == nil {
		return "", false
	}
	switch t := v.(type) {
	case string:
		return t, true
	case json.Number:
		return t.String(), true
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64), true
	case bool:
		return strconv.FormatBool(t), true
	default:
		return fmt.Sprintf("%v", t), true
	}
}

func floatVal(m map[string]interface{}, key string) (float64, bool) {
	v, ok := m[key]
	if !ok || v == nil {
		return 0, false
	}
	switch t := v.(type) {
	case float64:
		return t, true
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(t, 64)
		return f, err == nil
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	default:
		return 0, false
	}
}

// parseTimestamp handles seconds-epoch, milliseconds-epoch, and RFC3339 strings
// (audit F8: previously metrics assumed ms-epoch floats and misread seconds).
func parseTimestamp(m map[string]interface{}, keys ...string) (time.Time, bool) {
	for _, key := range keys {
		v, ok := m[key]
		if !ok || v == nil {
			continue
		}
		switch t := v.(type) {
		case string:
			if parsed, err := time.Parse(time.RFC3339Nano, t); err == nil {
				return parsed, true
			}
			if secs, err := strconv.ParseFloat(t, 64); err == nil {
				return tsFromEpoch(secs), true
			}
		case float64:
			return tsFromEpoch(t), true
		case json.Number:
			if f, err := t.Float64(); err == nil {
				return tsFromEpoch(f), true
			}
		case int64:
			return tsFromEpoch(float64(t)), true
		}
	}
	return time.Time{}, false
}

func tsFromEpoch(v float64) time.Time {
	abs := v
	if abs < 0 {
		abs = -abs
	}
	switch {
	case abs > 1e15: // microseconds
		return time.UnixMicro(int64(v)).UTC()
	case abs > 1e12: // milliseconds
		return time.UnixMilli(int64(v)).UTC()
	default: // seconds
		return time.Unix(int64(v), int64((v-float64(int64(v)))*1e9)).UTC()
	}
}

func strMap(m map[string]interface{}, key string) map[string]string {
	result := make(map[string]string)
	l, ok := m[key]
	if !ok {
		return result
	}
	switch t := l.(type) {
	case map[string]interface{}:
		for k, v := range t {
			switch vs := v.(type) {
			case string:
				result[k] = vs
			case float64:
				result[k] = strconv.FormatFloat(vs, 'f', -1, 64)
			case bool:
				result[k] = strconv.FormatBool(vs)
			default:
				result[k] = fmt.Sprintf("%v", v)
			}
		}
	case map[string]string:
		return t
	}
	return result
}

func (c *Consumer) insertMetrics(ctx context.Context, metrics []map[string]interface{}) error {
	batch, err := c.db.PrepareBatch(ctx, "INSERT INTO metrics (tenant_id, service_id, cluster, namespace, metric_name, ts, value, labels)")
	if err != nil {
		return err
	}

	for _, m := range metrics {
		serviceID, ok := strVal(m, "serviceId")
		if !ok {
			c.logBad("serviceId", "")
			continue
		}
		tenantID, _ := strVal(m, "tenantId")
		if tenantID == "" {
			tenantID = "default"
		}
		cluster, _ := strVal(m, "cluster")
		namespace, _ := strVal(m, "namespace")
		metricName, ok := strVal(m, "metricName")
		if !ok {
			c.logBad("metricName", serviceID)
			continue
		}

		ts, ok := parseTimestamp(m, "ts", "timestamp")
		if !ok {
			c.logBad("ts", serviceID)
			continue
		}

		value, ok := floatVal(m, "value")
		if !ok {
			c.logBad("value", serviceID)
			continue
		}

		labels := strMap(m, "labels")

		if err := batch.Append(tenantID, serviceID, cluster, namespace, metricName, ts, value, labels); err != nil {
			return err
		}
	}

	return batch.Send()
}

func (c *Consumer) insertLogs(ctx context.Context, logs []map[string]interface{}) error {
	batch, err := c.db.PrepareBatch(ctx, "INSERT INTO logs (tenant_id, service_id, cluster, namespace, ts, level, message, trace_id, span_id, attributes)")
	if err != nil {
		return err
	}

	for _, l := range logs {
		serviceID, ok := strVal(l, "serviceId")
		if !ok {
			c.logBad("serviceId (log)", "")
			continue
		}
		tenantID, _ := strVal(l, "tenantId")
		if tenantID == "" {
			tenantID = "default"
		}
		cluster, _ := strVal(l, "cluster")
		namespace, _ := strVal(l, "namespace")

		ts, ok := parseTimestamp(l, "ts", "timestamp")
		if !ok {
			ts = time.Now().UTC()
		}

		level, _ := strVal(l, "level")
		message, _ := strVal(l, "message")
		traceID, _ := strVal(l, "traceId")
		spanID, _ := strVal(l, "spanId")
		attributes := strMap(l, "attributes")
		if len(attributes) == 0 {
			attributes = strMap(l, "metadata")
		}

		if err := batch.Append(tenantID, serviceID, cluster, namespace, ts, level, message, traceID, spanID, attributes); err != nil {
			return err
		}
	}

	return batch.Send()
}

func (c *Consumer) insertTraces(ctx context.Context, traces []map[string]interface{}) error {
	batch, err := c.db.PrepareBatch(ctx, "INSERT INTO traces (tenant_id, trace_id, span_id, parent_span_id, service_id, operation_name, start_time, end_time, tags)")
	if err != nil {
		return err
	}

	for _, t := range traces {
		traceID, ok := strVal(t, "traceId")
		if !ok {
			c.logBad("traceId", "")
			continue
		}
		spanID, ok := strVal(t, "spanId")
		if !ok {
			c.logBad("spanId", traceID)
			continue
		}
		tenantID, _ := strVal(t, "tenantId")
		if tenantID == "" {
			tenantID = "default"
		}
		parentSpanID, _ := strVal(t, "parentSpanId")
		serviceID, ok := strVal(t, "serviceId")
		if !ok {
			c.logBad("serviceId (trace)", traceID)
			continue
		}
		operationName, _ := strVal(t, "operation")
		if operationName == "" {
			operationName, _ = strVal(t, "operationName")
		}

		startTime, _ := parseTimestamp(t, "startTime")
		endTime, _ := parseTimestamp(t, "endTime")
		if startTime.IsZero() {
			startTime = time.Now().UTC()
		}

		tags := strMap(t, "tags")

		if err := batch.Append(tenantID, traceID, spanID, parentSpanID, serviceID, operationName, startTime, endTime, tags); err != nil {
			return err
		}
	}

	return batch.Send()
}
