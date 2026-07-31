#include "astrawatch/transport/config.h"
#include "astrawatch/transport/bpf_manager.h"
#include "astrawatch/transport/grpc_client.h"
#include "astrawatch/storage/ring_buffer.h"
#include "astrawatch/transport/procfs_reader.h"

#include "agent.pb.h"

#include <iostream>
#include <chrono>
#include <thread>
#include <atomic>
#include <csignal>
#include <vector>
#include <random>
#include <cstring>
#include <ctime>
#include <memory>
#include <mutex>
#include <map>

using namespace astrawatch::agent;
using namespace astrawatch::agent::transport;
using namespace astrawatch::agent::storage;
using namespace astrawatch::agent::v1;
using namespace std::chrono_literals;

static std::atomic<bool> g_running{true};
static std::atomic<int64_t> g_batch_seq{0};
static std::chrono::steady_clock::time_point g_start_time;

// ── Event accumulator: collects raw BPF events across polling intervals ──
static std::mutex g_evt_mutex;
static std::vector<BPFEvent> g_events;
static std::atomic<int64_t> g_event_count{0};

void signal_handler(int) {
    g_running = false;
}

int64_t now_ms() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
}

int64_t compute_retry_delay(int attempt, const AgentConfig& cfg) {
    auto delay = cfg.initial_retry_delay.count() * (1 << attempt);
    delay = std::min(delay, cfg.max_retry_delay.count());

    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<double> jitter(
        1.0 - cfg.retry_jitter_factor, 1.0 + cfg.retry_jitter_factor);
    delay = static_cast<int64_t>(delay * jitter(gen));

    return delay;
}

// ── Metrics derived from accumulated BPF events ────────────────────────
// Build a proto batch from real event counts/durations rather than hardcoded values.
void build_proto_batch(const AgentConfig& config, int64_t ts, int64_t queue_depth,
                       bool is_backlog, MetricBatch* proto_batch, int64_t seq,
                       const std::vector<BPFEvent>& events, int64_t elapsed_ms,
                       const ProcfsMetrics& procfs_metrics) {
    proto_batch->set_agent_id(config.agent_id);
    proto_batch->set_hostname(config.hostname);
    proto_batch->set_cluster(config.cluster);
    proto_batch->set_batch_seq(seq);
    proto_batch->set_original_timestamp_ms(ts);
    proto_batch->set_is_backlog(is_backlog);
    proto_batch->set_queue_depth(queue_depth);

    auto add_point = [&](const std::string& name, double value,
                         int64_t point_ts,
                         const std::map<std::string, std::string>& labels) {
        auto* pt = proto_batch->add_metrics();
        pt->set_name(name);
        pt->set_value(value);
        pt->mutable_timestamp()->set_seconds(point_ts / 1000);
        pt->mutable_timestamp()->set_nanos((point_ts % 1000) * 1000000);
        for (const auto& [k, v] : labels) {
            (*pt->mutable_labels())[k] = v;
        }
    };

    auto base_labels = std::map<std::string, std::string>{
        {"source", "cxx-agent"}, {"host", config.hostname}};

    // Count events by type
    int sched_count = 0, tcp_send = 0, tcp_recv = 0, block_count = 0;
    for (const auto& e : events) {
        switch (e.type) {
            case BPFEvent::Type::SchedSwitch: ++sched_count; break;
            case BPFEvent::Type::TcpSend:     ++tcp_send;   break;
            case BPFEvent::Type::TcpRecv:     ++tcp_recv;   break;
            case BPFEvent::Type::BlockIO:     ++block_count; break;
        }
    }

    double elapsed_sec = (elapsed_ms > 0) ? (elapsed_ms / 1000.0) : 1.0;

    // 1) CPU utilization: From Procfs
    double cpu_pct = procfs_metrics.cpu_usage_percent;
    // 2) Network throughput: From Procfs (delta bytes over time)
    double net_rx = procfs_metrics.net_rx_bytes;
    double net_tx = procfs_metrics.net_tx_bytes;
    // 3) Disk I/O rate
    double disk_io_rate = block_count / std::max(elapsed_sec, 0.001);
    // 4) Memory is from Procfs
    double memory_pct = procfs_metrics.memory_usage_percent;

    add_point("system.cpu.utilization",    std::round(cpu_pct * 100.0) / 100.0,      ts, base_labels);
    add_point("system.network.rx_bytes",   net_rx,                                    ts, base_labels);
    add_point("system.network.tx_bytes",   net_tx,                                    ts, base_labels);
    add_point("system.disk.io_rate",       std::round(disk_io_rate * 100.0) / 100.0,  ts, base_labels);
    add_point("system.memory.usage_percent", memory_pct,                              ts, base_labels);
    add_point("system.load.1m",            (cpu_pct / 100.0) * 2.0,                   ts, base_labels);
}

void convert_backlog_to_proto(const MetricBatch& backlog_batch, MetricBatch* proto_batch) {
    proto_batch->set_agent_id(backlog_batch.agent_id);
    proto_batch->set_hostname(backlog_batch.hostname);
    proto_batch->set_cluster(backlog_batch.cluster);
    proto_batch->set_batch_seq(backlog_batch.batch_seq);
    proto_batch->set_original_timestamp_ms(backlog_batch.original_timestamp_ms);
    proto_batch->set_is_backlog(true);

    for (const auto& ms : backlog_batch.metrics) {
        auto* pt = proto_batch->add_metrics();
        pt->set_name(ms.name);
        pt->set_value(ms.value);
        pt->mutable_timestamp()->set_seconds(ms.timestamp_ms / 1000);
        pt->mutable_timestamp()->set_nanos((ms.timestamp_ms % 1000) * 1000000);
        for (const auto& [k, v] : ms.labels) {
            (*pt->mutable_labels())[k] = v;
        }
    }
}

int main(int argc, char* argv[]) {
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
    g_start_time = std::chrono::steady_clock::now();

    GOOGLE_PROTOBUF_VERIFY_VERSION;

    auto config = AgentConfig::from_env();
    ProcfsReader procfs_reader;

    std::cout << "AstraWatch C++ Agent v1.0.0" << std::endl;
    std::cout << "  Agent ID:      " << config.agent_id << std::endl;
    std::cout << "  Hostname:      " << config.hostname << std::endl;
    std::cout << "  Cluster:       " << config.cluster << std::endl;
    std::cout << "  Collector:     " << config.collector_address << std::endl;
    std::cout << "  Transport:     gRPC";
    if (config.use_mtls) std::cout << " + mTLS";
    std::cout << std::endl;
    std::cout << "  Compression:   zstd (level " << config.zstd_compression_level << ")" << std::endl;
    std::cout << "  Batch interval: " << config.batch_interval.count() << "ms" << std::endl;

    MMapRingBuffer local_buffer(config.buffer_path, config.buffer_size_bytes);
    std::cout << "  Local buffer:  " << config.buffer_path
              << " (" << config.buffer_size_bytes / 1024 / 1024 << "MB)" << std::endl;

    // Initialize gRPC client with mTLS support
    GrpcClient grpc_client(
        config.collector_address, config.use_mtls,
        config.tls_cert_path, config.tls_key_path, config.tls_ca_path,
        config.zstd_compression_level);

    BPFManager bpf;
    if (config.enable_sched_probe) {
        if (bpf.load_sched_probe()) {
            std::cout << "  Sched probe:   loaded" << std::endl;
        } else {
            std::cout << "  Sched probe:   unavailable (no eBPF)" << std::endl;
        }
    }
    if (config.enable_tcp_probe) {
        if (bpf.load_tcp_probe()) {
            std::cout << "  TCP probe:     loaded" << std::endl;
        } else {
            std::cout << "  TCP probe:     unavailable (no eBPF)" << std::endl;
        }
    }
    if (config.enable_block_io_probe) {
        if (bpf.load_block_io_probe()) {
            std::cout << "  Block I/O probe: loaded" << std::endl;
        } else {
            std::cout << "  Block I/O probe: unavailable (no eBPF)" << std::endl;
        }
    }

    if (bpf.is_loaded()) {
        bpf.attach_all();
    }

    // Connection retry loop
    std::cout << std::endl;
    std::cout << "Connecting to collector..." << std::endl;
    bool connected = false;
    for (int i = 0; i < 30 && g_running; i++) {
        if (grpc_client.connect()) {
            auto health = grpc_client.health_check(config.agent_id);
            if (health.status == "HEALTHY" || health.status == "DEGRADED") {
                std::cout << "  Collector: " << health.status
                          << " (backlog=" << health.backlog_size
                          << ", queue=" << health.queue_depth << ")" << std::endl;
                connected = true;
                break;
            }
        }
        std::cout << "  Retry in 2s (" << (i + 1) << "/30)..." << std::endl;
        std::this_thread::sleep_for(2s);
    }

    if (!connected) {
        std::cerr << "WARNING: starting in offline mode — data will buffer" << std::endl;
    }

    std::cout << std::endl;
    std::cout << "Agent started — collecting metrics every "
              << config.batch_interval.count() << "ms" << std::endl;

    int retry_attempt = 0;
    bool collector_connected = connected;

    while (g_running) {
        auto batch_start = now_ms();

        // ── EBPF POLLING ──────────────────────────────────────────────
        // Accumulate events into the global vector; they will be consumed by build_proto_batch.
        if (bpf.is_attached()) {
            bpf.poll(static_cast<int>(config.batch_interval.count() * 0.8),
                     [](const BPFEvent& evt) {
                         std::lock_guard<std::mutex> lock(g_evt_mutex);
                         g_events.push_back(evt);
                         g_event_count.fetch_add(1);
                     });
        }

        // ── BUILD PROTO BATCH FROM ACCUMULATED EVENTS ─────────────────
        auto seq = ++g_batch_seq;
        MetricBatch proto_batch;

        int64_t elapsed_in_batch = static_cast<int64_t>(config.batch_interval.count());
        {
            std::lock_guard<std::mutex> lock(g_evt_mutex);
            build_proto_batch(config, batch_start,
                              static_cast<int64_t>(local_buffer.size()),
                              false, &proto_batch, seq,
                              g_events, elapsed_in_batch,
                              procfs_reader.read_metrics());
            g_events.clear();
        }

        // ── DRAIN BACKLOG (using a single streaming RPC) ──────────────
        if (collector_connected && !local_buffer.empty()) {
            std::cout << "Backlog drain: " << local_buffer.size() << " batches" << std::endl;
            grpc_client.stream_backlog(local_buffer, g_running);
        }

        // ── SEND TO COLLECTOR VIA gRPC ───────────────────────────────
        GrpcBatchResult result = grpc_client.send_batch(proto_batch);

        if (result.error.empty()) {
            collector_connected = true;
            retry_attempt = 0;
        } else {
            collector_connected = false;

            // Save to local mmap buffer for replay
            MetricBatch local_entry;
            local_entry.agent_id = config.agent_id;
            local_entry.hostname = config.hostname;
            local_entry.cluster = config.cluster;
            local_entry.batch_seq = seq;
            local_entry.original_timestamp_ms = batch_start;
            local_entry.is_backlog = true;

            for (const auto& m : proto_batch.metrics()) {
                MetricSample ms;
                ms.name = m.name();
                ms.value = m.value();
                ms.timestamp_ms = m.timestamp().seconds() * 1000 +
                                  m.timestamp().nanos() / 1000000;
                for (const auto& [k, v] : m.labels()) {
                    ms.labels[k] = v;
                }
                local_entry.metrics.push_back(std::move(ms));
            }

            if (!local_buffer.push(local_entry)) {
                MetricBatch dropped;
                local_buffer.pop(dropped);
                local_buffer.push(local_entry);
                std::cerr << "Local buffer full — dropped oldest batch" << std::endl;
            }

            int delay_ms = compute_retry_delay(retry_attempt, config);
            retry_attempt++;
            std::cerr << "Collector unreachable — buffered (retry in "
                      << delay_ms << "ms, queue=" << local_buffer.size() << ")" << std::endl;
            std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));
        }

        // ── SLEEP UNTIL NEXT BATCH ────────────────────────────────────
        auto elapsed = now_ms() - batch_start;
        auto sleep_ms = config.batch_interval.count() - elapsed;
        if (sleep_ms > 0 && g_running) {
            std::this_thread::sleep_for(std::chrono::milliseconds(sleep_ms));
        }
    }

    bpf.detach_all();
    google::protobuf::ShutdownProtobufLibrary();
    std::cout << "Agent shutdown complete." << std::endl;
    return 0;
}
