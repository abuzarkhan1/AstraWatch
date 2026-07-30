#include "astrawatch/transport/grpc_client.h"
#include "astrawatch/storage/ring_buffer.h"

#include <grpcpp/security/credentials.h>
#include <grpcpp/support/channel_arguments.h>
#include <fstream>
#include <sstream>
#include <chrono>

namespace astrawatch::agent::transport {

using namespace astrawatch::agent::v1;
using namespace astrawatch::agent::storage;
using namespace std::chrono_literals;

static std::string read_file(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) return "";
    std::stringstream buffer;
    buffer << file.rdbuf();
    return buffer.str();
}

GrpcClient::GrpcClient(const std::string& target, bool use_tls,
                       const std::string& cert_path,
                       const std::string& key_path,
                       const std::string& ca_path,
                       int zstd_level)
    : target_(target)
    , use_tls_(use_tls)
    , cert_path_(cert_path)
    , key_path_(key_path)
    , ca_path_(ca_path)
    , zstd_level_(zstd_level)
{
}

GrpcClient::~GrpcClient() {
    disconnect();
}

bool GrpcClient::connect() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (channel_) return true;

    std::shared_ptr<grpc::ChannelCredentials> creds;
    if (use_tls_) {
        creds = create_tls_credentials();
    } else {
        creds = create_insecure_credentials();
    }

    grpc::ChannelArguments args;
    args.SetMaxSendMessageSize(10 * 1024 * 1024);
    args.SetMaxReceiveMessageSize(10 * 1024 * 1024);

    channel_ = grpc::CreateCustomChannel(target_, creds, args);
    if (!channel_) return false;

    if (!channel_->WaitForConnected(std::chrono::system_clock::now() + 5s)) {
        return false;
    }

    stub_ = AgentIngest::NewStub(channel_);
    return true;
}

void GrpcClient::disconnect() {
    std::lock_guard<std::mutex> lock(mutex_);
    stub_.reset();
    channel_.reset();
}

bool GrpcClient::is_connected() const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!channel_) return false;
    auto state = channel_->GetState(false);
    return state == GRPC_CHANNEL_READY;
}

void GrpcClient::apply_compression(grpc::ClientContext* ctx) {
    // Use gRPC's built-in gzip compression. zstd requires a custom codec plugin.
    ctx->set_compression_algorithm(GRPC_COMPRESS_STREAM_GZIP);
}

GrpcBatchResult GrpcClient::send_batch(const MetricBatch& batch) {
    std::lock_guard<std::mutex> lock(mutex_);
    GrpcBatchResult result;

    if (!stub_) {
        result.error = "gRPC stub not initialized";
        return result;
    }

    grpc::ClientContext ctx;
    apply_compression(&ctx);
    ctx.set_deadline(std::chrono::system_clock::now() + 10s);

    IngestResponse response;
    grpc::Status status = stub_->SendMetricBatch(&ctx, batch, &response);

    if (status.ok()) {
        result.accepted = response.accepted();
        result.rejected = response.rejected();
    } else {
        result.error = status.error_message();
    }

    return result;
}

GrpcBatchResult GrpcClient::stream_batch(const MetricBatch& batch) {
    std::lock_guard<std::mutex> lock(mutex_);
    GrpcBatchResult result;

    if (!stub_) {
        result.error = "gRPC stub not initialized";
        return result;
    }

    grpc::ClientContext ctx;
    apply_compression(&ctx);
    ctx.set_deadline(std::chrono::system_clock::now() + 30s);

    auto writer = stub_->StreamMetrics(&ctx);
    if (!writer) {
        result.error = "failed to create stream";
        return result;
    }

    if (!writer->Write(batch)) {
        result.error = "failed to write to stream";
        return result;
    }

    writer->WritesDone();

    IngestResponse response;
    grpc::Status status = writer->Finish();
    if (status.ok()) {
        result.accepted = response.accepted();
        result.rejected = response.rejected();
    } else {
        result.error = status.error_message();
    }

    return result;
}

void GrpcClient::stream_backlog(MMapRingBuffer& buffer, std::atomic<bool>& running) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!stub_) return;

    grpc::ClientContext ctx;
    apply_compression(&ctx);
    ctx.set_deadline(std::chrono::system_clock::now() + 120s);

    auto writer = stub_->StreamMetrics(&ctx);
    if (!writer) return;

    MetricBatch backlog_batch;
    int sent = 0;
    while (buffer.pop(backlog_batch) && running.load()) {
        MetricBatch pb;
        pb.set_queue_depth(static_cast<int64_t>(buffer.size()));
        pb.set_agent_id(backlog_batch.agent_id);
        pb.set_hostname(backlog_batch.hostname);
        pb.set_cluster(backlog_batch.cluster);
        pb.set_batch_seq(backlog_batch.batch_seq);
        pb.set_original_timestamp_ms(backlog_batch.original_timestamp_ms);
        pb.set_is_backlog(true);

        for (const auto& ms : backlog_batch.metrics) {
            auto* pt = pb.add_metrics();
            pt->set_name(ms.name);
            pt->set_value(ms.value);
            pt->mutable_timestamp()->set_seconds(ms.timestamp_ms / 1000);
            pt->mutable_timestamp()->set_nanos((ms.timestamp_ms % 1000) * 1000000);
            for (const auto& [k, v] : ms.labels) {
                (*pt->mutable_labels())[k] = v;
            }
        }

        if (!writer->Write(pb)) {
            break;
        }
        sent++;
    }

    writer->WritesDone();
    grpc::Status status = writer->Finish();
    if (!status.ok()) {
        std::cerr << "Backlog stream finished with error: " << status.error_message() << std::endl;
    }
}

GrpcHealthResult GrpcClient::health_check(const std::string& agent_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    GrpcHealthResult result;

    if (!stub_) {
        result.status = "DOWN";
        return result;
    }

    grpc::ClientContext ctx;
    ctx.set_deadline(std::chrono::system_clock::now() + 5s);

    HealthRequest request;
    request.set_agent_id(agent_id);

    HealthResponse response;
    grpc::Status status = stub_->HealthCheck(&ctx, request, &response);

    if (status.ok()) {
        result.status = response.status();
        result.uptime_seconds = response.uptime_seconds();
        result.backlog_size = response.backlog_size();
        result.queue_depth = response.queue_depth();
        result.active_probes.reserve(response.active_probes_size());
        for (const auto& p : response.active_probes()) {
            result.active_probes.push_back(p);
        }
    } else {
        result.status = "DOWN";
    }

    return result;
}

std::shared_ptr<grpc::ChannelCredentials> GrpcClient::create_tls_credentials() {
    grpc::SslCredentialsOptions opts;
    opts.pem_root_certs = read_file(ca_path_);
    opts.pem_private_key = read_file(key_path_);
    opts.pem_cert_chain = read_file(cert_path_);
    return grpc::SslCredentials(opts);
}

std::shared_ptr<grpc::ChannelCredentials> GrpcClient::create_insecure_credentials() {
    return grpc::InsecureChannelCredentials();
}

} // namespace astrawatch::agent::transport
