#include "astrawatch/transport/bpf_manager.h"
#include <cstring>
#include <cerrno>
#include <stdexcept>
#include <cstdio>

extern "C" {
#include <bpf/libbpf.h>
#include <bpf/bpf.h>
}

namespace astrawatch::agent {

BPFManager::BPFManager() = default;

BPFManager::~BPFManager() {
    detach_all();
}

bool BPFManager::load_sched_probe() {
    if (load_bpf_object("/etc/astrawatch/ebpf/sched_switch.bpf.o", &sched_obj_) < 0) {
        return false;
    }
    loaded_ = true;
    return true;
}

bool BPFManager::load_tcp_probe() {
    if (load_bpf_object("/etc/astrawatch/ebpf/tcp_probe.bpf.o", &tcp_obj_) < 0) {
        return false;
    }
    loaded_ = true;
    return true;
}

bool BPFManager::load_block_io_probe() {
    if (load_bpf_object("/etc/astrawatch/ebpf/block_io.bpf.o", &block_obj_) < 0) {
        return false;
    }
    loaded_ = true;
    return true;
}

struct attach_ctx {
    const char* tracepoint;
    bool success;
    std::vector<struct bpf_link*>* links;
};

static int attach_prog_cb(struct bpf_program* prog, void* ctx_ptr) {
    auto* ctx = static_cast<attach_ctx*>(ctx_ptr);
    struct bpf_link* link = bpf_program__attach_tracepoint(prog, ctx->tracepoint);
    if (!link) {
        fprintf(stderr, "Failed to attach tracepoint %s: %s\n",
                ctx->tracepoint, strerror(-errno));
        return 0;
    }
    ctx->links->push_back(link);
    ctx->success = true;
    return 0;
}

bool BPFManager::attach_all() {
    if (!loaded_) return false;

    auto attach_obj = [this](struct bpf_object* obj, const char* tp) -> bool {
        if (!obj) return false;
        attach_ctx ctx{tp, false, &links_};
        bpf_program__foreach_defined_program(obj, attach_prog_cb, &ctx);
        return ctx.success;
    };

    attach_obj(sched_obj_, "sched/sched_switch");
    attach_obj(tcp_obj_, "sock/tcp_sendmsg");
    attach_obj(tcp_obj_, "sock/tcp_recvmsg");
    attach_obj(block_obj_, "block/block_rq_issue");

    attached_ = true;
    return true;
}

void BPFManager::detach_all() {
    auto detach_obj = [](struct bpf_object** obj) {
        if (!*obj) return;
        bpf_object__close(*obj);
        *obj = nullptr;
    };

    for (auto* link : links_) {
        bpf_link__destroy(link);
    }
    links_.clear();

    detach_obj(&sched_obj_);
    detach_obj(&tcp_obj_);
    detach_obj(&block_obj_);

    if (ringbuf_) {
        ring_buffer__free(ringbuf_);
        ringbuf_ = nullptr;
    }

    attached_ = false;
    loaded_ = false;
}

static int ringbuf_sample_cb(void* ctx, void* data, size_t size) {
    auto* mgr = static_cast<BPFManager*>(ctx);
    if (!mgr) return 0;

    BPFEvent evt;
    evt.timestamp_ns = 0;
    evt.type = BPFEvent::Type::SchedSwitch;
    evt.raw_data.assign(static_cast<uint8_t*>(data),
                       static_cast<uint8_t*>(data) + size);
    mgr->invoke_callback(evt);
    return 0;
}

int BPFManager::poll(int timeout_ms, EventCallback cb) {
    current_cb_ = std::move(cb);
    if (!loaded_ && !attached_) return 0;

    // Discover ring buffer maps across all loaded objects
    auto setup_ringbuf = [&](struct bpf_object* obj) -> int {
        if (!obj) return 0;
        struct bpf_map* map = bpf_object__next_map(obj, nullptr);
        while (map) {
            if (bpf_map__type(map) == BPF_MAP_TYPE_RINGBUF) {
                int fd = bpf_map__fd(map);
                if (fd < 0) return fd;
                ringbuf_ = ring_buffer__new(fd, ringbuf_sample_cb, this, nullptr);
                if (!ringbuf_) return -1;
                return fd;
            }
            map = bpf_object__next_map(obj, map);
        }
        return 0;
    };

    if (!ringbuf_) {
        setup_ringbuf(sched_obj_);
        if (!ringbuf_) setup_ringbuf(tcp_obj_);
        if (!ringbuf_) setup_ringbuf(block_obj_);
    }

    if (!ringbuf_) return 0;

    return ring_buffer__poll(ringbuf_, timeout_ms);
}

int BPFManager::load_bpf_object(const std::string& path, struct bpf_object** obj) {
    struct bpf_object* o = bpf_object__open(path.c_str());
    if (!o) {
        fprintf(stderr, "Failed to open BPF object: %s\n", path.c_str());
        return -1;
    }

    int err = bpf_object__load(o);
    if (err) {
        fprintf(stderr, "Failed to load BPF object: %s\n", strerror(-err));
        bpf_object__close(o);
        return -1;
    }

    *obj = o;
    return 0;
}

int BPFManager::attach_tracepoint(struct bpf_object* obj, const char* tracepoint) {
    struct bpf_program* prog;
    bpf_object__for_each_program(prog, obj) {
        const char* name = bpf_program__name(prog);
        if (std::strstr(name, tracepoint)) {
            struct bpf_link* link = bpf_program__attach_tracepoint(prog, tracepoint);
            if (!link) return -1;
            return 0;
        }
    }
    return -1;
}

int BPFManager::get_ringbuf_fd(struct bpf_object* obj) {
    struct bpf_map* map = bpf_object__find_map_by_name(obj, "rb");
    if (!map) return -1;
    return bpf_map__fd(map);
}

} // namespace astrawatch::agent
