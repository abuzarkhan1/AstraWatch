#include "astrawatch/storage/ring_buffer.h"
#include "astrawatch/transport/config.h"

#include <iostream>
#include <cassert>
#include <thread>
#include <chrono>

using namespace astrawatch::agent::storage;
using namespace astrawatch::agent;

void test_ring_buffer_push_pop() {
    std::cout << "test_ring_buffer_push_pop... " << std::flush;

    std::remove("/tmp/astrawatch_test_rb");
    {
        MMapRingBuffer buf("/tmp/astrawatch_test_rb", 64 * 1024);

        MetricBatch batch;
        batch.agent_id = "agent-1";
        batch.hostname = "host-1";
        batch.cluster = "prod";
        batch.batch_seq = 1;
        batch.original_timestamp_ms = 1000;
        batch.is_backlog = false;

        MetricSample sample;
        sample.name = "test.metric";
        sample.value = 42.5;
        sample.timestamp_ms = 1000;
        batch.metrics.push_back(sample);

        assert(buf.push(batch));
        assert(buf.size() == 1);

        MetricBatch popped;
        assert(buf.pop(popped));
        assert(popped.agent_id == "agent-1");
        assert(popped.metrics.size() == 1);
        assert(popped.metrics[0].name == "test.metric");
        assert(popped.metrics[0].value == 42.5);
        assert(buf.empty());
    }

    std::remove("/tmp/astrawatch_test_rb");
    std::cout << "PASSED" << std::endl;
}

void test_ring_buffer_multiple_batches() {
    std::cout << "test_ring_buffer_multiple_batches... " << std::flush;

    std::remove("/tmp/astrawatch_test_rb2");
    {
        MMapRingBuffer buf("/tmp/astrawatch_test_rb2", 256 * 1024);

        for (int i = 0; i < 100; i++) {
            MetricBatch batch;
            batch.agent_id = "agent-1";
            batch.batch_seq = i;
            batch.original_timestamp_ms = i * 1000;

            MetricSample sample;
            sample.name = "test.metric";
            sample.value = static_cast<double>(i);
            sample.timestamp_ms = i * 1000;
            batch.metrics.push_back(sample);

            assert(buf.push(batch));
        }

        assert(buf.size() == 100);

        for (int i = 0; i < 100; i++) {
            MetricBatch popped;
            assert(buf.pop(popped));
            assert(popped.batch_seq == i);
        }

        assert(buf.empty());
    }

    std::remove("/tmp/astrawatch_test_rb2");
    std::cout << "PASSED" << std::endl;
}

void test_config_from_env() {
    std::cout << "test_config_from_env... ";

    ::setenv("ASTRAWATCH_AGENT_ID", "test-agent", 1);
    ::setenv("ASTRAWATCH_CLUSTER", "test-cluster", 1);
    ::setenv("ASTRAWATCH_COLLECTOR_ADDR", "collector:9090", 1);
    ::setenv("ASTRAWATCH_BATCH_INTERVAL_MS", "1000", 1);
    ::setenv("ASTRAWATCH_BUFFER_SIZE_MB", "200", 1);

    auto cfg = AgentConfig::from_env();
    assert(cfg.agent_id == "test-agent");
    assert(cfg.cluster == "test-cluster");
    assert(cfg.collector_address == "collector:9090");
    assert(cfg.batch_interval.count() == 1000);
    assert(cfg.buffer_size_bytes == 200 * 1024 * 1024);

    std::cout << "PASSED" << std::endl;
}

void test_config_defaults() {
    std::cout << "test_config_defaults... ";

    auto cfg = AgentConfig::defaults();
    assert(cfg.collector_address == "localhost:9090");
    assert(cfg.batch_interval.count() == 500);
    assert(cfg.buffer_size_bytes == 100 * 1024 * 1024);
    assert(cfg.enable_sched_probe == true);
    assert(cfg.enable_tcp_probe == true);
    assert(cfg.enable_block_io_probe == true);

    std::cout << "PASSED" << std::endl;
}

void test_ring_buffer_escaping() {
    std::cout << "test_ring_buffer_escaping... " << std::flush;

    std::remove("/tmp/astrawatch_test_rb_esc");
    {
        MMapRingBuffer buf("/tmp/astrawatch_test_rb_esc", 64 * 1024);

        MetricBatch batch;
        batch.agent_id = "agent\nwith\nnewlines";
        batch.hostname = "host\\with\\slashes";
        batch.cluster = "prod\r\ncluster";
        batch.batch_seq = 1;
        batch.original_timestamp_ms = 1000;
        batch.is_backlog = false;

        MetricSample sample;
        sample.name = "test\nmetric.name";
        sample.value = 42.5;
        sample.timestamp_ms = 1000;
        sample.labels["label\nkey"] = "label\nval\\with\\slash";
        batch.metrics.push_back(sample);

        assert(buf.push(batch));
        assert(buf.size() == 1);

        MetricBatch popped;
        assert(buf.pop(popped));
        assert(popped.agent_id == "agent\nwith\nnewlines");
        assert(popped.hostname == "host\\with\\slashes");
        assert(popped.cluster == "prod\r\ncluster");
        assert(popped.metrics.size() == 1);
        assert(popped.metrics[0].name == "test\nmetric.name");
        assert(popped.metrics[0].labels["label\nkey"] == "label\nval\\with\\slash");
        assert(buf.empty());
    }

    std::remove("/tmp/astrawatch_test_rb_esc");
    std::cout << "PASSED" << std::endl;
}

int main() {
    std::cout << "Running AstraWatch C++ Agent tests..." << std::endl;
    std::cout << std::endl;

    test_config_from_env();
    test_config_defaults();
    test_ring_buffer_push_pop();
    test_ring_buffer_multiple_batches();
    test_ring_buffer_escaping();

    std::cout << std::endl;
    std::cout << "All tests PASSED!" << std::endl;
    return 0;
}
