import json
import asyncio
import logging
from typing import Callable, Dict, Any, Optional
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from app.core.config import settings

logger = logging.getLogger(__name__)


class KafkaClient:
    def __init__(self):
        self._producer: Optional[AIOKafkaProducer] = None
        self._consumers: Dict[str, AIOKafkaConsumer] = {}

    async def get_producer(self) -> AIOKafkaProducer:
        if self._producer is None:
            self._producer = AIOKafkaProducer(
                bootstrap_servers=settings.kafka_bootstrap_servers,
                value_serializer=lambda v: json.dumps(v).encode(),
                key_serializer=lambda k: k.encode() if isinstance(k, str) else k,
            )
            await self._producer.start()
        return self._producer

    async def create_consumer(
        self, topic: str, group_id: str = None
    ) -> AIOKafkaConsumer:
        consumer = AIOKafkaConsumer(
            topic,
            bootstrap_servers=settings.kafka_bootstrap_servers,
            group_id=group_id or settings.kafka_consumer_group,
            value_deserializer=lambda v: json.loads(v.decode()),
            auto_offset_reset="earliest",
            enable_auto_commit=False,
        )
        await consumer.start()
        self._consumers[topic] = consumer
        return consumer

    async def publish(
        self, topic: str, key: str, value: dict
    ) -> None:
        producer = await self.get_producer()
        await producer.send(topic, key=key, value=value)
        logger.debug(f"Published to {topic}: key={key}")

    async def consume_loop(
        self, topic: str, handler: Callable, group_id: str = None
    ):
        consumer = await self.create_consumer(topic, group_id)
        logger.info(f"Started consuming from {topic}")
        try:
            async for msg in consumer:
                try:
                    await handler(msg.key, msg.value)
                    await consumer.commit()
                except Exception as e:
                    logger.error(f"Error handling message: {e}", exc_info=True)
        finally:
            await consumer.stop()

    async def close(self):
        if self._producer:
            await self._producer.stop()
        for consumer in self._consumers.values():
            await consumer.stop()


kafka_client = KafkaClient()
