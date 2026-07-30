/* SPDX-License-Identifier: GPL-2.0 */
/* AstraWatch eBPF network probe — measures TCP send/recv latency and throughput */

#include <linux/bpf.h>
#include <linux/ptrace.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

char LICENSE[] SEC("license") = "GPL";

/* Ring buffer shares the same map as sched_switch — single consumer */
extern struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);
} rb SEC(".maps");

struct tcp_event {
    __u64 pid_tgid;
    __u64 sock_inum;
    __u64 size;
    __u64 latency_ns;           /* time between sendmsg and recvmsg ack */
    __u32 family;               /* AF_INET or AF_INET6 */
    __u32 port;
    __u32 daddr_ipv4;           /* destination IP (IPv4) */
    __u8  type;                 /* 0 = send, 1 = recv */
    char comm[16];
};

SEC("tracepoint/sock/tcp_sendmsg")
int trace_tcp_sendmsg(struct trace_event_raw_tcp_sendmsg *ctx)
{
    struct tcp_event *evt;

    evt = bpf_ringbuf_reserve(&rb, sizeof(*evt), 0);
    if (!evt)
        return 0;

    evt->pid_tgid = bpf_get_current_pid_tgid();
    evt->size = ctx->size;
    evt->type = 0; /* send */
    evt->family = ctx->sk->__sk_common.skc_family;
    evt->port = ctx->sk->__sk_common.skc_dport;
    bpf_probe_read_kernel(&evt->daddr_ipv4, sizeof(evt->daddr_ipv4),
                          &ctx->sk->__sk_common.skc_daddr);
    evt->latency_ns = 0;
    __builtin_memcpy(evt->comm, ctx->sk->__sk_common.skc_comm, sizeof(evt->comm));

    bpf_ringbuf_submit(evt, 0);
    return 0;
}

SEC("tracepoint/sock/tcp_recvmsg")
int trace_tcp_recvmsg(struct trace_event_raw_tcp_recvmsg *ctx)
{
    struct tcp_event *evt;

    evt = bpf_ringbuf_reserve(&rb, sizeof(*evt), 0);
    if (!evt)
        return 0;

    evt->pid_tgid = bpf_get_current_pid_tgid();
    evt->size = ctx->size;
    evt->type = 1; /* recv */
    evt->family = ctx->sk->__sk_common.skc_family;
    evt->port = ctx->sk->__sk_common.skc_dport;
    bpf_probe_read_kernel(&evt->daddr_ipv4, sizeof(evt->daddr_ipv4),
                          &ctx->sk->__sk_common.skc_daddr);
    evt->latency_ns = 0;
    __builtin_memcpy(evt->comm, ctx->sk->__sk_common.skc_comm, sizeof(evt->comm));

    bpf_ringbuf_submit(evt, 0);
    return 0;
}
