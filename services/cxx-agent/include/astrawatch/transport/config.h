#ifndef ASTRAWATCH_AGENT_CONFIG_H
#define ASTRAWATCH_AGENT_CONFIG_H

#include <string>
#include <chrono>
#include <vector>

namespace astrawatch::agent {

struct AgentConfig {
    // Agent identity
    std::string agent_id;
    std::string hostname;
    std::string cluster = "default";
    std::string tenant_id = "default";

    // Collector connection
    std::string collector_address = "localhost:8080";
    bool use_mtls = false;
    std::string tls_cert_path;
    std::string tls_key_path;
    std::string tls_ca_path;

    // Batching
    std::chrono::milliseconds batch_interval{500};
    size_t max_batch_size = 1000;

    // Local buffer (memory-mapped ring file)
    std::string buffer_path = "/var/lib/astrawatch/agent_buffer";
    size_t buffer_size_bytes = 100 * 1024 * 1024; // 100MB

    // Retry
    std::chrono::milliseconds initial_retry_delay{1000};
    std::chrono::milliseconds max_retry_delay{60000};
    double retry_jitter_factor = 0.1;

    // Probes
    bool enable_sched_probe = true;
    bool enable_tcp_probe = true;
    bool enable_block_io_probe = true;

    // Compression
    bool enable_zstd = true;
    int zstd_compression_level = 3;

    static AgentConfig from_env();
    static AgentConfig defaults();
};

} // namespace astrawatch::agent

#endif // ASTRAWATCH_AGENT_CONFIG_H
