import { Kafka } from 'kafkajs';
import { EventEmitter } from 'events';

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

    await this.consumer.subscribe({ topic: /^(anomaly-detected|incident-|healing-|slo-)/, fromBeginning: false });

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
          });
        } catch (err) {
          console.error(`Error processing Kafka message from ${topic}:`, err.message);
        }
      },
    });

    console.log(`Kafka consumer connected, subscribed to pattern: anomaly-detected|incident-*|healing-*|slo-*`);
  }

  mapTopicToEvent(topic) {
    const mapping = {
      'anomaly-detected': 'anomaly.detected',
      'incident-created': 'incident.created',
      'incident-updated': 'incident.updated',
      'healing-triggered': 'healing.started',
      'healing-completed': 'healing.completed',
      'slo-breaching': 'slo.breaching',
      'incident-merged': 'incident.merged',
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
