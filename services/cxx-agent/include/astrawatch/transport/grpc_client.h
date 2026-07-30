#ifndef ASTRAWATCH_AGENT_GRPC_CLIENT_H
#define ASTRAWATCH_AGENT_GRPC_CLIENT_H

#include <memory>
#include <string>
#include <chrono>
#include <mutex>
#include <vector>
#include <atomic>

#include <grpcpp/channel.h>
#include <grpcpp/client_context.h>
#include <grpcpp/create_channel.h>

#include "agent.grpc.pb.h"

namespace astrawatch::agent::storage {
class MMapRingBuffer;
struct MetricBatch;
}

namespace astrawatch::agent::transport {

struct GrpcBatchResult {
    int32_t accepted = 0;
    int32_t rejected = 0;
    std::string error;
};

struct GrpcHealthResult {
    std::string status;
    int64_t uptime_seconds = 0;
    int64_t backlog_size = 0;
    int64_t queue_depth = 0;
    std::vector<std::string> active_probes;
};

class GrpcClient {
public:
    GrpcClient(const std::string& target, bool use_tls,
               const std::string& cert_path = "",
               const std::string& key_path = "",
               const std::string& ca_path = "",
               int zstd_level = 3);
    ~GrpcClient();

    bool connect();
    void disconnect();
    bool is_connected() const;

    GrpcBatchResult send_batch(const astrawatch::agent::v1::MetricBatch& batch);
    GrpcBatchResult stream_batch(const astrawatch::agent::v1::MetricBatch& batch);
    void stream_backlog(astrawatch::agent::storage::MMapRingBuffer& buffer,
                        std::atomic<bool>& running);
    GrpcHealthResult health_check(const std::string& agent_id);

    std::shared_ptr<grpc::Channel> channel() const { return channel_; }

private:
    std::string target_;
    bool use_tls_;
    std::string cert_path_;
    std::string key_path_;
    std::string ca_path_;
    int zstd_level_;
    std::shared_ptr<grpc::Channel> channel_;
    std::unique_ptr<astrawatch::agent::v1::AgentIngest::Stub> stub_;
    mutable std::mutex mutex_;

    void apply_compression(grpc::ClientContext* ctx);
    std::shared_ptr<grpc::ChannelCredentials> create_tls_credentials();
    std::shared_ptr<grpc::ChannelCredentials> create_insecure_credentials();
};

} // namespace astrawatch::agent::transport

#endif // ASTRAWATCH_AGENT_GRPC_CLIENT_H
