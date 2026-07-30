#include "astrawatch/transport/config.h"
#include <cstdlib>
#include <algorithm>

namespace astrawatch::agent {

AgentConfig AgentConfig::from_env() {
    AgentConfig cfg;

    auto get_env = [](const char* key, const std::string& fallback) -> std::string {
        const char* val = std::getenv(key);
        return val ? std::string(val) : fallback;
    };

    auto get_env_int = [](const char* key, int fallback) -> int {
        const char* val = std::getenv(key);
        return val ? std::atoi(val) : fallback;
    };

    cfg.agent_id = get_env("ASTRAWATCH_AGENT_ID", "");
    cfg.hostname = get_env("HOSTNAME", "unknown");
    cfg.cluster = get_env("ASTRAWATCH_CLUSTER", "default");
    cfg.collector_address = get_env("ASTRAWATCH_COLLECTOR_ADDR", "localhost:8080");
    cfg.use_mtls = get_env("ASTRAWATCH_MTLS_ENABLED", "false") == "true";
    cfg.tls_cert_path = get_env("ASTRAWATCH_TLS_CERT", "");
    cfg.tls_key_path = get_env("ASTRAWATCH_TLS_KEY", "");
    cfg.tls_ca_path = get_env("ASTRAWATCH_TLS_CA", "");
    cfg.batch_interval = std::chrono::milliseconds(
        get_env_int("ASTRAWATCH_BATCH_INTERVAL_MS", 500));
    cfg.buffer_path = get_env("ASTRAWATCH_BUFFER_PATH", "/var/lib/astrawatch/agent_buffer");
    cfg.buffer_size_bytes = static_cast<size_t>(
        get_env_int("ASTRAWATCH_BUFFER_SIZE_MB", 100)) * 1024 * 1024;
    cfg.enable_sched_probe = get_env("ASTRAWATCH_ENABLE_SCHED", "true") == "true";
    cfg.enable_tcp_probe = get_env("ASTRAWATCH_ENABLE_TCP", "true") == "true";
    cfg.enable_block_io_probe = get_env("ASTRAWATCH_ENABLE_BLOCK_IO", "true") == "true";

    return cfg;
}

AgentConfig AgentConfig::defaults() {
    return AgentConfig{};
}

} // namespace astrawatch::agent
