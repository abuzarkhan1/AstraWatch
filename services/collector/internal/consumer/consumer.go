package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
)

type Consumer struct {
	client *kgo.Client
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

	return &Consumer{
		client: client,
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
					c.log.Error("failed to unmarshal metric", zap.Error(err))
					return
				}
				metricsBatch = append(metricsBatch, metric)
			case "raw-logs":
				var logEntry map[string]interface{}
				if err := json.Unmarshal(record.Value, &logEntry); err != nil {
					c.log.Error("failed to unmarshal log entry", zap.Error(err))
					return
				}
				logsBatch = append(logsBatch, logEntry)
			case "raw-traces":
				var traceEntry map[string]interface{}
				if err := json.Unmarshal(record.Value, &traceEntry); err != nil {
					c.log.Error("failed to unmarshal trace entry", zap.Error(err))
					return
				}
				tracesBatch = append(tracesBatch, traceEntry)
			}
		})

		if len(metricsBatch) > 0 {
			if err := c.insertMetrics(ctx, metricsBatch); err != nil {
				c.log.Error("failed to insert metrics to ClickHouse", zap.Error(err))
			}
		}

		if len(logsBatch) > 0 {
			if err := c.insertLogs(ctx, logsBatch); err != nil {
				c.log.Error("failed to insert logs to ClickHouse", zap.Error(err))
			}
		}

		if len(tracesBatch) > 0 {
			if err := c.insertTraces(ctx, tracesBatch); err != nil {
				c.log.Error("failed to insert traces to ClickHouse", zap.Error(err))
			}
		}

		// Optionally commit offsets here if needed, franz-go auto-commits by default.
	}
}

func (c *Consumer) insertMetrics(ctx context.Context, metrics []map[string]interface{}) error {
	batch, err := c.db.PrepareBatch(ctx, "INSERT INTO metrics")
	if err != nil {
		return err
	}

	for _, m := range metrics {
		serviceID := m["serviceId"].(string)
		cluster, _ := m["cluster"].(string)
		namespace, _ := m["namespace"].(string)
		metricName := m["metricName"].(string)

		tsVal := m["ts"].(float64)
		ts := time.UnixMilli(int64(tsVal))

		value := m["value"].(float64)

		var labels map[string]string
		if l, ok := m["labels"].(map[string]interface{}); ok {
			labels = make(map[string]string)
			for k, v := range l {
				if vs, ok := v.(string); ok {
					labels[k] = vs
				}
			}
		}

		if err := batch.Append(serviceID, cluster, namespace, metricName, ts, value, labels); err != nil {
			return err
		}
	}

	return batch.Send()
}

func (c *Consumer) insertLogs(ctx context.Context, logs []map[string]interface{}) error {
	batch, err := c.db.PrepareBatch(ctx, "INSERT INTO logs")
	if err != nil {
		return err
	}

	for _, l := range logs {
		serviceID := l["serviceId"].(string)
		cluster, _ := l["cluster"].(string)
		namespace, _ := l["namespace"].(string)
		
		tsStr := l["timestamp"].(string)
		ts, err := time.Parse(time.RFC3339, tsStr)
		if err != nil {
			ts = time.Now()
		}
		
		level := l["level"].(string)
		message := l["message"].(string)

		var metadata map[string]string
		if m, ok := l["metadata"].(map[string]interface{}); ok {
			metadata = make(map[string]string)
			for k, v := range m {
				if vs, ok := v.(string); ok {
					metadata[k] = vs
				}
			}
		}

		if err := batch.Append(serviceID, cluster, namespace, ts, level, message, metadata); err != nil {
			return err
		}
	}

	return batch.Send()
}

func (c *Consumer) insertTraces(ctx context.Context, traces []map[string]interface{}) error {
	batch, err := c.db.PrepareBatch(ctx, "INSERT INTO traces")
	if err != nil {
		return err
	}

	for _, t := range traces {
		traceID := t["traceId"].(string)
		spanID := t["spanId"].(string)
		parentSpanID, _ := t["parentSpanId"].(string)
		serviceID := t["serviceId"].(string)
		operationName := t["operationName"].(string)

		var startTime time.Time
		var endTime time.Time

		// Depending on how they were serialized, either timestamp or string
		if startStr, ok := t["startTime"].(string); ok {
			startTime, _ = time.Parse(time.RFC3339, startStr)
		} else if startFl, ok := t["startTime"].(float64); ok {
			startTime = time.UnixMilli(int64(startFl))
		}

		if endStr, ok := t["endTime"].(string); ok {
			endTime, _ = time.Parse(time.RFC3339, endStr)
		} else if endFl, ok := t["endTime"].(float64); ok {
			endTime = time.UnixMilli(int64(endFl))
		}

		var tags map[string]string
		if m, ok := t["tags"].(map[string]interface{}); ok {
			tags = make(map[string]string)
			for k, v := range m {
				if vs, ok := v.(string); ok {
					tags[k] = vs
				}
			}
		}

		if err := batch.Append(traceID, spanID, parentSpanID, serviceID, operationName, startTime, endTime, tags); err != nil {
			return err
		}
	}

	return batch.Send()
}
