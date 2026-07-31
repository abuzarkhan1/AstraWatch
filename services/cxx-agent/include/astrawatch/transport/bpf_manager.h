#ifndef ASTRAWATCH_AGENT_BPF_MANAGER_H
#define ASTRAWATCH_AGENT_BPF_MANAGER_H

#include <memory>
#include <functional>
#include <vector>

struct ring_buffer;
struct bpf_object;
struct bpf_map;

namespace astrawatch::agent {

struct BPFEvent {
    enum class Type { SchedSwitch, TcpSend, TcpRecv, BlockIO };
    Type type;
    int64_t timestamp_ns;
    std::vector<uint8_t> raw_data;
};

/**
 * Manages the lifecycle of eBPF programs:
 * - Loads .bpf.o ELF objects (sched_switch, tcp_probe, block_io)
 * - Attaches to kernel tracepoints
 * - Sets up ring buffer consumer callback
 * - Handles detach and cleanup
 */
class BPFManager {
public:
    BPFManager();
    ~BPFManager();

    bool load_sched_probe();
    bool load_tcp_probe();
    bool load_block_io_probe();

    bool attach_all();
    void detach_all();

    using EventCallback = std::function<void(const BPFEvent&)>;

    /**
     * Poll the ring buffer for new events.
     * Returns the number of events processed.
     * The callback is invoked for each event.
     */
    int poll(int timeout_ms, EventCallback cb);

    void invoke_callback(const BPFEvent& evt) { if (current_cb_) current_cb_(evt); }

    bool is_loaded() const { return loaded_; }
    bool is_attached() const { return attached_; }

private:
    EventCallback current_cb_;
    struct bpf_object* sched_obj_ = nullptr;
    struct bpf_object* tcp_obj_ = nullptr;
    struct bpf_object* block_obj_ = nullptr;

    struct ring_buffer* ringbuf_ = nullptr;
    int ringbuf_fd_ = -1;

    bool loaded_ = false;
    bool attached_ = false;
    std::vector<struct bpf_link*> links_;

    int load_bpf_object(const std::string& path, struct bpf_object** obj);
    int attach_tracepoint(struct bpf_object* obj, const char* tracepoint);
    int get_ringbuf_fd(struct bpf_object* obj);
};

} // namespace astrawatch::agent

#endif // ASTRAWATCH_AGENT_BPF_MANAGER_H
