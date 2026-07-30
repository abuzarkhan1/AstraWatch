/* SPDX-License-Identifier: GPL-2.0 */
/* AstraWatch eBPF scheduler probe — measures scheduling latency */

#include <linux/bpf.h>
#include <linux/ptrace.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

char LICENSE[] SEC("license") = "GPL";

/* Ring buffer for sending events to userspace */
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24); /* 16MB ring buffer */
} rb SEC(".maps");

/* Per-CPU map tracking previous task switch timestamps */
struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, __u64);
} prev_ts SEC(".maps");

struct sched_event {
    __u64 prev_pid_tgid;
    __u64 next_pid_tgid;
    __u64 prev_state;
    __u64 latency_ns;           /* time since last switch on this CPU */
    __u32 cpu;
    char prev_comm[16];
    char next_comm[16];
};

SEC("tracepoint/sched/sched_switch")
int trace_sched_switch(struct trace_event_raw_sched_switch *ctx)
{
    struct sched_event *evt;
    __u64 now = bpf_ktime_get_ns();
    __u32 zero = 0;
    __u64 *last_ts;
    __u64 delta;

    last_ts = bpf_map_lookup_elem(&prev_ts, &zero);
    if (!last_ts)
        goto store;

    delta = now - *last_ts;

    evt = bpf_ringbuf_reserve(&rb, sizeof(*evt), 0);
    if (!evt)
        goto store;

    evt->prev_pid_tgid = bpf_get_current_pid_tgid();
    evt->next_pid_tgid = ctx->next_pid;
    evt->prev_state = ctx->prev_state;
    evt->latency_ns = delta;
    evt->cpu = bpf_get_smp_processor_id();
    __builtin_memcpy(evt->prev_comm, ctx->prev_comm, sizeof(evt->prev_comm));
    __builtin_memcpy(evt->next_comm, ctx->next_comm, sizeof(evt->next_comm));

    bpf_ringbuf_submit(evt, 0);

store:
    if (last_ts)
        *last_ts = now;
    else
        bpf_map_update_elem(&prev_ts, &zero, &now, BPF_ANY);

    return 0;
}
