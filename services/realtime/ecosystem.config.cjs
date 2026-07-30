module.exports = {
  apps: [{
    name: 'astrawatch-realtime',
    script: 'src/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    }
  }]
};
