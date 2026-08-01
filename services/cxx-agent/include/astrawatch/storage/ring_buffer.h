#ifndef ASTRAWATCH_AGENT_RING_BUFFER_H
#define ASTRAWATCH_AGENT_RING_BUFFER_H

#include <cstdint>
#include <string>
#include <map>
#include <vector>
#include <chrono>
#include <mutex>
#include <memory>

namespace astrawatch::agent::storage {

struct MetricSample {
    std::string name;
    double value;
    int64_t timestamp_ms;
    std::map<std::string, std::string> labels;
};

struct MetricBatch {
    std::string agent_id;
    std::string hostname;
    std::string cluster;
    std::vector<MetricSample> metrics;
    int64_t batch_seq;
    int64_t original_timestamp_ms;
    bool is_backlog;
};

/**
 * Memory-mapped ring buffer for local durability.
 * When the Collector is unreachable, the agent writes to this file-backed
 * ring buffer. On reconnection, it drains the backlog before resuming live
 * streaming, tagging replayed points with their original timestamps.
 */
class MMapRingBuffer {
public:
    explicit MMapRingBuffer(const std::string& path, size_t capacity);
    ~MMapRingBuffer();

    bool push(const MetricBatch& batch);
    bool pop(MetricBatch& batch);
    size_t size() const;
    size_t capacity() const;
    bool empty() const;
    void clear();
    int64_t oldest_timestamp_ms() const;

private:
    struct RingHeader {
        uint64_t write_offset;
        uint64_t read_offset;
        uint64_t count;
        int64_t oldest_ts;
        uint8_t reserved[4088]; // pad to 4KB header
    };

    std::string path_;
    int fd_;
    size_t capacity_;
    void* mapped_;
    RingHeader* header_;
    uint8_t* data_;

    mutable std::mutex mutex_;

    bool ensure_mapped();
    size_t write_available() const;
    size_t read_available() const;
    void serialize_batch(const MetricBatch& batch, std::vector<uint8_t>& out);
    bool deserialize_batch(const uint8_t* data, size_t len, MetricBatch& batch);
};

} // namespace astrawatch::agent::storage

#endif // ASTRAWATCH_AGENT_RING_BUFFER_H
