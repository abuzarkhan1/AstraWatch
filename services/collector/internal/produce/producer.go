package produce

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/astrawatch/collector/pkg"
	"github.com/redis/go-redis/v9"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"
)

type Producer struct {
	client *kgo.Client
	rdb    *redis.Client
	log    *zap.Logger
}

func NewProducer(brokers []string, rdb *redis.Client, log *zap.Logger) (*Producer, error) {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.ProducerBatchCompression(kgo.ZstdCompression()),
		kgo.RequiredAcks(kgo.AllISRAcks()),
		kgo.DefaultProduceTopic("raw-metrics"),
		kgo.ProducerLinger(500*time.Millisecond),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create kafka client: %w", err)
	}

	return &Producer{
		client: client,
		rdb:    rdb,
		log:    log,
	}, nil
}

func (p *Producer) ProduceMetrics(batch pkg.MetricBatch) error {
	key := batch.ServiceID

	for _, metric := range batch.Metrics {
		msg := map[string]interface{}{
			"serviceId":  batch.ServiceID,
			"cluster":    batch.Cluster,
			"namespace":  batch.Namespace,
			"metricName": metric.Name,
			"ts":         metric.Timestamp.UnixMilli(),
			"value":      metric.Value,
			"labels":     metric.Labels,
		}

		data, err := json.Marshal(msg)
		if err != nil {
			return fmt.Errorf("failed to marshal metric: %w", err)
		}

		record := &kgo.Record{
			Key:   []byte(key),
			Value: data,
			Headers: []kgo.RecordHeader{
				{Key: "event-type", Value: []byte("metric")},
				{Key: "content-type", Value: []byte("application/json")},
			},
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err = p.client.ProduceSync(ctx, record).FirstErr()
		cancel()
		if err != nil {
			return fmt.Errorf("failed to produce metric: %w", err)
		}
	}

	return nil
}

func (p *Producer) ProduceLog(entry *pkg.LogEntry) error {
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}

	record := &kgo.Record{
		Topic: "raw-logs",
		Key:   []byte(entry.ServiceID),
		Value: data,
		Headers: []kgo.RecordHeader{
			{Key: "event-type", Value: []byte("log")},
			{Key: "content-type", Value: []byte("application/json")},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	p.client.ProduceSync(ctx, record)
	return nil
}

func (p *Producer) ProduceTrace(trace pkg.TraceSpan) error {
	data, err := json.Marshal(trace)
	if err != nil {
		return err
	}

	record := &kgo.Record{
		Topic: "raw-traces",
		Key:   []byte(trace.TraceID),
		Value: data,
		Headers: []kgo.RecordHeader{
			{Key: "event-type", Value: []byte("trace")},
			{Key: "content-type", Value: []byte("application/json")},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	p.client.ProduceSync(ctx, record)
	return nil
}

func (p *Producer) IsDuplicate(batchID string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ok, err := p.rdb.SetNX(ctx, "batch:"+batchID, "1", 5*time.Minute).Result()
	if err != nil {
		p.log.Error("redis dedup check failed", zap.Error(err))
		return false
	}
	return !ok
}

func (p *Producer) GetKafkaLag() (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	topic := "raw-metrics"
	metadataReq := &kmsg.MetadataRequest{
		Topics: []kmsg.MetadataRequestTopic{
			{Topic: &topic},
		},
	}

	metadataResp, err := p.client.Request(ctx, metadataReq)
	if err != nil {
		return 0, fmt.Errorf("metadata request failed: %w", err)
	}

	meta := metadataResp.(*kmsg.MetadataResponse)
	if len(meta.Topics) == 0 || len(meta.Topics[0].Partitions) == 0 {
		return 0, nil
	}

	partitions := meta.Topics[0].Partitions
	listOffsetsReq := &kmsg.ListOffsetsRequest{
		Topics: make([]kmsg.ListOffsetsRequestTopic, 0, len(partitions)),
	}
	for _, p := range partitions {
		listOffsetsReq.Topics = append(listOffsetsReq.Topics, kmsg.ListOffsetsRequestTopic{
			Topic: topic,
			Partitions: []kmsg.ListOffsetsRequestTopicPartition{
				{Partition: p.Partition, Timestamp: -1},
			},
		})
	}

	listOffsetsResp, err := p.client.Request(ctx, listOffsetsReq)
	if err != nil {
		return 0, fmt.Errorf("list offsets request failed: %w", err)
	}

	listOffsets := listOffsetsResp.(*kmsg.ListOffsetsResponse)

	var totalMessages int64
	for _, t := range listOffsets.Topics {
		for _, p := range t.Partitions {
			totalMessages += p.Offset
		}
	}

	return totalMessages, nil
}

func (p *Producer) Close() {
	p.client.Close()
}
