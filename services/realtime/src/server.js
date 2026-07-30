import http from 'http';
import RealtimeGateway from './index.js';
import config from './config.js';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'realtime',
      uptime: process.uptime(),
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const gateway = new RealtimeGateway(server);

server.listen(config.PORT, () => {
  console.log(`AstraWatch Realtime Gateway listening on port ${config.PORT}`);
  console.log(`Socket.io path: ${config.SOCKET_PATH}`);
  console.log(`Kafka brokers: ${config.KAFKA_BROKERS}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await gateway.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await gateway.shutdown();
  process.exit(0);
});
