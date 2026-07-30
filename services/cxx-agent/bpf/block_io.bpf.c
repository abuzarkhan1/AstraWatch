/* SPDX-License-Identifier: GPL-2.0 */
/* AstraWatch eBPF block I/O probe — measures disk I/O latency */

#include <linux/bpf.h>
#include <linux/ptrace.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

char LICENSE[] SEC("license") = "GPL";

extern struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);
} rb SEC(".maps");

struct block_event {
    __u64 pid_tgid;
    __u64 sector;
    __u64 nr_sector;
    __u64 latency_ns;           /* time from issue to completion */
    __u32 rwbs;                 /* read/write/barrier/flush flags */
    __u32 dev_major;
    __u32 dev_minor;
    char comm[16];
};

/*
 * We track I/O start times in a hash map keyed by request.
 * On completion, we look up the start time and emit the event.
 */
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 10240);
    __type(key, __u64);         /* request pointer */
    __type(value, __u64);       /* start time (ns) */
} io_start_times SEC(".maps");

SEC("tracepoint/block/block_rq_issue")
int trace_block_rq_issue(struct trace_event_raw_block_rq_issue *ctx)
{
    __u64 now = bpf_ktime_get_ns();
    __u64 req_ptr = (__u64)ctx->dev + ctx->sector;

    bpf_map_update_elem(&io_start_times, &req_ptr, &now, BPF_ANY);
    return 0;
}

SEC("tracepoint/block/block_rq_complete")
int trace_block_rq_complete(struct trace_event_raw_block_rq_complete *ctx)
{
    struct block_event *evt;
    __u64 now = bpf_ktime_get_ns();
    __u64 req_ptr = (__u64)ctx->dev + ctx->sector;
    __u64 *start_time;

    start_time = bpf_map_lookup_elem(&io_start_times, &req_ptr);
    if (!start_time)
        return 0;

    evt = bpf_ringbuf_reserve(&rb, sizeof(*evt), 0);
    if (!evt)
        goto cleanup;

    evt->pid_tgid = bpf_get_current_pid_tgid();
    evt->sector = ctx->sector;
    evt->nr_sector = ctx->nr_sector;
    evt->latency_ns = now - *start_time;
    evt->rwbs = ctx->rwbs;
    evt->dev_major = ctx->dev >> 20;
    evt->dev_minor = ctx->dev & ((1 << 20) - 1);
    __builtin_memcpy(evt->comm, ctx->comm, sizeof(evt->comm));

    bpf_ringbuf_submit(evt, 0);

cleanup:
    bpf_map_delete_elem(&io_start_times, &req_ptr);
    return 0;
}
