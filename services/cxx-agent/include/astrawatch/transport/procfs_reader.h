#ifndef ASTRAWATCH_AGENT_PROCFS_READER_H
#define ASTRAWATCH_AGENT_PROCFS_READER_H

#include <cstdint>
#include <string>

namespace astrawatch::agent {

struct ProcfsMetrics {
    double memory_usage_percent = 0.0;
    double cpu_usage_percent = 0.0;
    uint64_t net_rx_bytes = 0;
    uint64_t net_tx_bytes = 0;
    uint64_t disk_reads = 0;
    uint64_t disk_writes = 0;
};

class ProcfsReader {
public:
    ProcfsReader() = default;
    
    ProcfsMetrics read_metrics();

private:
    uint64_t last_idle_time_ = 0;
    uint64_t last_total_time_ = 0;
};

} // namespace astrawatch::agent

#endif // ASTRAWATCH_AGENT_PROCFS_READER_H
