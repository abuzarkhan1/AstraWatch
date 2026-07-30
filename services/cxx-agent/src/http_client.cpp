#include "astrawatch/transport/http_client.h"

#include <sstream>
#include <cstring>
#include <stdexcept>

#ifdef HAS_CURL
#include <curl/curl.h>
#endif

namespace astrawatch::agent::transport {

static size_t write_callback(void* contents, size_t size, size_t nmemb, void* userp) {
    size_t total = size * nmemb;
    auto* str = static_cast<std::string*>(userp);
    str->append(static_cast<char*>(contents), total);
    return total;
}

HttpClient::HttpClient(const std::string& collector_url)
    : base_url_(collector_url)
    , timeout_ms_(5000)
{
    // Strip trailing slash
    if (!base_url_.empty() && base_url_.back() == '/') {
        base_url_.pop_back();
    }
}

HttpClient::~HttpClient() = default;

bool HttpClient::send_batch(const AgentBatch& batch, IngestResponse& response) {
    std::string json = build_json(batch);
    std::string resp_body;

    std::string url = base_url_ + "/v1/agent/metrics";
    if (!post_json(url, json, resp_body)) {
        response.error = "HTTP request failed";
        return false;
    }

    // Parse response (simple JSON parsing)
    auto parse_int = [](const std::string& s, const std::string& key) -> int {
        auto pos = s.find(key);
        if (pos == std::string::npos) return 0;
        pos = s.find(':', pos);
        if (pos == std::string::npos) return 0;
        pos++;
        while (pos < s.size() && (s[pos] == ' ' || s[pos] == '\t')) pos++;
        std::string val;
        while (pos < s.size() && s[pos] >= '0' && s[pos] <= '9') {
            val += s[pos++];
        }
        return val.empty() ? 0 : std::stoi(val);
    };

    response.accepted = parse_int(resp_body, "\"accepted\"");
    response.rejected = parse_int(resp_body, "\"rejected\"");
    response.error = "";

    return true;
}

bool HttpClient::health_check(std::string& status) {
    std::string resp_body;
    std::string url = base_url_ + "/v1/agent/health";
    if (!post_json(url, "{}", resp_body)) {
        status = "DOWN";
        return false;
    }

    auto pos = resp_body.find("\"status\"");
    if (pos != std::string::npos) {
        pos = resp_body.find('"', pos + 8);
        if (pos != std::string::npos) {
            auto end = resp_body.find('"', pos + 1);
            if (end != std::string::npos) {
                status = resp_body.substr(pos + 1, end - pos - 1);
            }
        }
    }

    return true;
}

std::string HttpClient::build_json(const AgentBatch& batch) {
    std::ostringstream json;
    json << "{\n";
    json << "  \"agentId\": \"" << batch.agent_id << "\",\n";
    json << "  \"hostname\": \"" << batch.hostname << "\",\n";
    json << "  \"cluster\": \"" << batch.cluster << "\",\n";
    json << "  \"batchSeq\": " << batch.batch_seq << ",\n";
    json << "  \"originalTimestampMs\": " << batch.original_timestamp_ms << ",\n";
    json << "  \"isBacklog\": " << (batch.is_backlog ? "true" : "false") << ",\n";
    json << "  \"queueDepth\": " << batch.queue_depth << ",\n";
    json << "  \"metrics\": [\n";

    for (size_t i = 0; i < batch.metrics.size(); i++) {
        const auto& m = batch.metrics[i];
        json << "    {\n";
        json << "      \"name\": \"" << m.name << "\",\n";
        json << "      \"value\": " << m.value << ",\n";
        json << "      \"timestampMs\": " << m.timestamp_ms << ",\n";
        json << "      \"labels\": {";

        bool first = true;
        for (const auto& [k, v] : m.labels) {
            if (!first) json << ",";
            json << "\"" << k << "\":\"" << v << "\"";
            first = false;
        }

        json << "}\n";
        json << "    }";
        if (i < batch.metrics.size() - 1) json << ",";
        json << "\n";
    }

    json << "  ]\n";
    json << "}\n";

    return json.str();
}

bool HttpClient::post_json(const std::string& url, const std::string& json_body, std::string& response_body) {
#ifdef HAS_CURL
    CURL* curl = curl_easy_init();
    if (!curl) return false;

    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_body.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response_body);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT_MS, static_cast<long>(timeout_ms_));
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT_MS, 3000L);

    // mTLS support
    // curl_easy_setopt(curl, CURLOPT_SSLCERT, cert_path.c_str());
    // curl_easy_setopt(curl, CURLOPT_SSLKEY, key_path.c_str());
    // curl_easy_setopt(curl, CURLOPT_CAINFO, ca_path.c_str());

    CURLcode res = curl_easy_perform(curl);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    return res == CURLE_OK;
#else
    // No curl available — print warning and simulate
    response_body = R"({"accepted":0,"rejected":0,"error":"curl not available"})";
    return false;
#endif
}

} // namespace astrawatch::agent::transport
