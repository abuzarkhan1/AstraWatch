#include "astrawatch/transport/procfs_reader.h"
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <iostream>

namespace astrawatch::agent {

ProcfsMetrics ProcfsReader::read_metrics() {
    ProcfsMetrics metrics;

    // 1. /proc/meminfo
    {
        std::ifstream file("/proc/meminfo");
        std::string line;
        uint64_t mem_total = 0;
        uint64_t mem_free = 0;
        uint64_t mem_available = 0;
        
        while (std::getline(file, line)) {
            if (line.compare(0, 9, "MemTotal:") == 0) {
                std::istringstream iss(line.substr(9));
                iss >> mem_total;
            } else if (line.compare(0, 8, "MemFree:") == 0) {
                std::istringstream iss(line.substr(8));
                iss >> mem_free;
            } else if (line.compare(0, 13, "MemAvailable:") == 0) {
                std::istringstream iss(line.substr(13));
                iss >> mem_available;
            }
        }
        
        if (mem_total > 0) {
            uint64_t used = mem_total - (mem_available > 0 ? mem_available : mem_free);
            metrics.memory_usage_percent = (static_cast<double>(used) / mem_total) * 100.0;
        }
    }

    // 2. /proc/stat
    {
        std::ifstream file("/proc/stat");
        std::string line;
        if (std::getline(file, line)) {
            if (line.compare(0, 4, "cpu ") == 0) {
                std::istringstream iss(line.substr(4));
                uint64_t user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice;
                if (iss >> user >> nice >> system >> idle >> iowait >> irq >> softirq >> steal >> guest >> guest_nice) {
                    uint64_t idle_time = idle + iowait;
                    uint64_t non_idle_time = user + nice + system + irq + softirq + steal;
                    uint64_t total_time = idle_time + non_idle_time;

                    if (last_total_time_ > 0 && total_time > last_total_time_) {
                        uint64_t total_diff = total_time - last_total_time_;
                        uint64_t idle_diff = idle_time - last_idle_time_;
                        metrics.cpu_usage_percent = (static_cast<double>(total_diff - idle_diff) / total_diff) * 100.0;
                    }

                    last_total_time_ = total_time;
                    last_idle_time_ = idle_time;
                }
            }
        }
    }

    // 3. /proc/net/dev
    {
        std::ifstream file("/proc/net/dev");
        std::string line;
        while (std::getline(file, line)) {
            auto colon = line.find(':');
            if (colon != std::string::npos) {
                std::istringstream iss(line.substr(colon + 1));
                uint64_t rx_bytes, rx_packets, rx_errs, rx_drop, rx_fifo, rx_frame, rx_compressed, rx_multicast;
                uint64_t tx_bytes, tx_packets, tx_errs, tx_drop, tx_fifo, tx_colls, tx_carrier, tx_compressed;
                if (iss >> rx_bytes >> rx_packets >> rx_errs >> rx_drop >> rx_fifo >> rx_frame >> rx_compressed >> rx_multicast
                        >> tx_bytes >> tx_packets >> tx_errs >> tx_drop >> tx_fifo >> tx_colls >> tx_carrier >> tx_compressed) {
                    metrics.net_rx_bytes += rx_bytes;
                    metrics.net_tx_bytes += tx_bytes;
                }
            }
        }
    }

    // 4. /proc/diskstats
    {
        std::ifstream file("/proc/diskstats");
        std::string line;
        while (std::getline(file, line)) {
            std::istringstream iss(line);
            int major, minor;
            std::string name;
            if (iss >> major >> minor >> name) {
                uint64_t reads, reads_merged, sectors_read, time_reading;
                uint64_t writes, writes_merged, sectors_written, time_writing;
                if (iss >> reads >> reads_merged >> sectors_read >> time_reading
                        >> writes >> writes_merged >> sectors_written >> time_writing) {
                    if (name.find("loop") == std::string::npos && name.find("ram") == std::string::npos) {
                        metrics.disk_reads += reads;
                        metrics.disk_writes += writes;
                    }
                }
            }
        }
    }

    return metrics;
}

} // namespace astrawatch::agent
