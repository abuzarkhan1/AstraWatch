#ifndef ASTRAWATCH_AGENT_HTTP_CLIENT_H
#define ASTRAWATCH_AGENT_HTTP_CLIENT_H

#include <string>
#include <vector>
#include <cstdint>
#include <map>
#include <functional>
#include <memory>

namespace astrawatch::agent::transport {

struct MetricPoint {
    std::string name;
    double value;
    int64_t timestamp_ms;
    std::map<std::string, std::string> labels;
};

struct AgentBatch {
    std::string agent_id;
    std::string hostname;
    std::string cluster;
    std::vector<MetricPoint> metrics;
    int64_t batch_seq;
    int64_t original_timestamp_ms;
    bool is_backlog;
    int64_t queue_depth;
};

struct IngestResponse {
    int accepted;
    int rejected;
    std::string agent_id;
    std::string error;
};

/**
 * HTTP/JSON client for sending agent metrics to the Go Collector.
 * Uses libcurl for HTTP transport.
 */
class HttpClient {
public:
    explicit HttpClient(const std::string& collector_url = "http://localhost:8080");
    ~HttpClient();

    bool send_batch(const AgentBatch& batch, IngestResponse& response);
    bool health_check(std::string& status);

    std::string base_url() const { return base_url_; }
    void set_timeout_ms(int ms) { timeout_ms_ = ms; }

private:
    std::string base_url_;
    int timeout_ms_;

    std::string build_json(const AgentBatch& batch);
    bool post_json(const std::string& url, const std::string& json, std::string& response);
};

} // namespace astrawatch::agent::transport

#endif // ASTRAWATCH_AGENT_HTTP_CLIENT_H
