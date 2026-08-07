import * as KafkaJS from 'kafkajs';
import { Kafka } from 'kafkajs';
import { EventEmitter } from 'events';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// The collector produces raw-metrics/raw-logs with zstd compression. KafkaJS
// does not ship a zstd codec, so without this registration every fetch would
// crash with KafkaJSNotImplemented: ZSTD compression not implemented — killing
// the entire WebSocket event bridge (incidents, healing, live logs).
try {
  const ZstdCodec = require('@kafkajs/zstd');
  const { CompressionCodecs, CompressionTypes } = KafkaJS.default;
  // kafkajs's CompressionCodecs maps compression-type -> factory function
  // returning { compress, decompress }; ZstdCodec() is exactly that factory.
  CompressionCodecs[CompressionTypes.ZSTD] = ZstdCodec();
} catch (err) {
  console.error('zstd codec unavailable (live logs / raw topics will fail):', err.message);
}

class KafkaConsumer extends EventEmitter {
  constructor() {
    super();
    this.kafka = new Kafka({
      clientId: 'astrawatch-realtime',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    });
    this.consumer = this.kafka.consumer({
      groupId: 'realtime-gateway',
    });
  }

  async connect() {
    await this.consumer.connect();

    // Audit: slo-* was in this pattern but no service ever produced SLO events.
    // The pattern now matches only topics that actually have producers
    // (anomaly-detected, incident-created/updated, healing-triggered/completed)
    // plus raw-logs, which powers the live log tail in the Logs Explorer (the
    // collector produces raw-logs on every ingest).
    await this.consumer.subscribe({ topic: /^(anomaly-detected|incident-|healing-|raw-logs)/, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const key = message.key?.toString();
          const value = JSON.parse(message.value.toString());
          const eventType = this.mapTopicToEvent(topic);

          this.emit(eventType, {
            key,
            value,
            topic,
            partition,
            offset: message.offset,
            timestamp: message.timestamp,
          });

          this.emit('*', {
            eventType,
            key,
            value,
            topic,
            offset: message.offset,
            timestamp: message.timestamp,
          });
        } catch (err) {
          console.error(`Error processing Kafka message from ${topic}:`, err.message);
        }
      },
    });

    console.log(`Kafka consumer connected, subscribed to pattern: anomaly-detected|incident-*|healing-*|raw-logs`);
  }

  mapTopicToEvent(topic) {
    const mapping = {
      'anomaly-detected': 'anomaly.detected',
      'incident-created': 'incident.created',
      'incident-updated': 'incident.updated',
      'healing-triggered': 'healing.started',
      'healing-completed': 'healing.completed',
      'raw-logs': 'log.stream',
    };
    if (mapping[topic]) return mapping[topic];

    if (topic.startsWith('incident-')) {
      return 'incident.' + topic.slice('incident-'.length);
    }
    if (topic.startsWith('healing-')) {
      return 'healing.' + topic.slice('healing-'.length);
    }

    return topic;
  }

  async disconnect() {
    await this.consumer.disconnect();
    console.log('Kafka consumer disconnected');
  }
}

export default KafkaConsumer;
