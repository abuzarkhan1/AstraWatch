/* SPDX-License-Identifier: GPL-2.0 */
/* AstraWatch eBPF network probe — measures TCP send/recv latency and throughput */

#include <linux/bpf.h>
#include <linux/ptrace.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

char LICENSE[] SEC("license") = "GPL";

/* Ring buffer shares the same map structure across BPF programs */
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);
} rb SEC(".maps");

/* Map to track TCP send timestamps keyed by socket pointer */
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 10240);
    __type(key, __u64);         /* sock pointer */
    __type(value, __u64);       /* send timestamp (ns) */
} tcp_send_times SEC(".maps");

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
    __u64 sk = (__u64)ctx->sk;
    __u64 now = bpf_ktime_get_ns();

    if (sk) {
        bpf_map_update_elem(&tcp_send_times, &sk, &now, BPF_ANY);
    }

    evt = bpf_ringbuf_reserve(&rb, sizeof(*evt), 0);
    if (!evt)
        return 0;

    evt->pid_tgid = bpf_get_current_pid_tgid();
    evt->sock_inum = ctx->sk ? ctx->sk->__sk_common.skc_ino : 0;
    evt->size = ctx->size;
    evt->type = 0; /* send */
    evt->family = ctx->sk ? ctx->sk->__sk_common.skc_family : 0;
    evt->port = ctx->sk ? ctx->sk->__sk_common.skc_dport : 0;
    if (ctx->sk) {
        bpf_probe_read_kernel(&evt->daddr_ipv4, sizeof(evt->daddr_ipv4),
                              &ctx->sk->__sk_common.skc_daddr);
        __builtin_memcpy(evt->comm, ctx->sk->__sk_common.skc_comm, sizeof(evt->comm));
    } else {
        evt->daddr_ipv4 = 0;
        evt->comm[0] = '\0';
    }
    evt->latency_ns = 0;

    bpf_ringbuf_submit(evt, 0);
    return 0;
}

SEC("tracepoint/sock/tcp_recvmsg")
int trace_tcp_recvmsg(struct trace_event_raw_tcp_recvmsg *ctx)
{
    struct tcp_event *evt;
    __u64 sk = (__u64)ctx->sk;
    __u64 now = bpf_ktime_get_ns();
    __u64 *start_time;

    evt = bpf_ringbuf_reserve(&rb, sizeof(*evt), 0);
    if (!evt)
        return 0;

    evt->pid_tgid = bpf_get_current_pid_tgid();
    evt->sock_inum = ctx->sk ? ctx->sk->__sk_common.skc_ino : 0;
    evt->size = ctx->size;
    evt->type = 1; /* recv */
    evt->family = ctx->sk ? ctx->sk->__sk_common.skc_family : 0;
    evt->port = ctx->sk ? ctx->sk->__sk_common.skc_dport : 0;
    if (ctx->sk) {
        bpf_probe_read_kernel(&evt->daddr_ipv4, sizeof(evt->daddr_ipv4),
                              &ctx->sk->__sk_common.skc_daddr);
        __builtin_memcpy(evt->comm, ctx->sk->__sk_common.skc_comm, sizeof(evt->comm));
    } else {
        evt->daddr_ipv4 = 0;
        evt->comm[0] = '\0';
    }

    if (sk) {
        start_time = bpf_map_lookup_elem(&tcp_send_times, &sk);
        if (start_time && now >= *start_time) {
            evt->latency_ns = now - *start_time;
            bpf_map_delete_elem(&tcp_send_times, &sk);
        } else {
            evt->latency_ns = 0;
        }
    } else {
        evt->latency_ns = 0;
    }

    bpf_ringbuf_submit(evt, 0);
    return 0;
}
