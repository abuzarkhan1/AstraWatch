#include "astrawatch/storage/ring_buffer.h"

#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <cstring>
#include <cerrno>
#include <stdexcept>
#include <sstream>

namespace astrawatch::agent::storage {

MMapRingBuffer::MMapRingBuffer(const std::string& path, size_t capacity)
    : path_(path)
    , capacity_(capacity)
    , fd_(-1)
    , mapped_(nullptr)
    , header_(nullptr)
    , data_(nullptr)
{
    // Allocate header + data region: 4KB header, rest is data
    size_t total_size = 4096 + capacity_;

    struct stat st;
    bool is_new = (::stat(path_.c_str(), &st) != 0 || st.st_size == 0);

    fd_ = ::open(path_.c_str(), O_RDWR | O_CREAT, 0644);
    if (fd_ < 0) {
        throw std::runtime_error("Failed to open ring buffer file: " +
                                 std::string(std::strerror(errno)));
    }

    // Extend file to required size
    if (::ftruncate(fd_, static_cast<off_t>(total_size)) < 0) {
        ::close(fd_);
        throw std::runtime_error("Failed to truncate ring buffer file: " +
                                 std::string(std::strerror(errno)));
    }

    mapped_ = ::mmap(nullptr, total_size, PROT_READ | PROT_WRITE,
                     MAP_SHARED, fd_, 0);
    if (mapped_ == MAP_FAILED) {
        ::close(fd_);
        throw std::runtime_error("Failed to mmap ring buffer: " +
                                 std::string(std::strerror(errno)));
    }

    header_ = static_cast<RingHeader*>(mapped_);
    data_ = static_cast<uint8_t*>(mapped_) + 4096;

    // Initialize header if this is a new file or if offsets are 0 / corrupt
    if (is_new || header_->write_offset >= capacity_ || header_->read_offset >= capacity_ ||
        (header_->write_offset == 0 && header_->read_offset == 0)) {
        std::memset(mapped_, 0, total_size);
    }

    ::close(fd_); // fd no longer needed after mmap
    fd_ = -1;
}

MMapRingBuffer::~MMapRingBuffer() {
    size_t total_size = 4096 + capacity_;
    if (mapped_ != MAP_FAILED && mapped_ != nullptr) {
        ::munmap(mapped_, total_size);
    }
}

bool MMapRingBuffer::push(const MetricBatch& batch) {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<uint8_t> serialized;
    serialize_batch(batch, serialized);

    size_t entry_size = serialized.size() + sizeof(uint32_t); // len prefix

    if (entry_size > capacity_ / 4) {
        return false; // batch too large
    }

    if (entry_size > write_available()) {
        return false; // ring buffer full
    }

    uint32_t len = static_cast<uint32_t>(serialized.size());
    if (header_->write_offset + sizeof(len) > capacity_) {
        size_t first_part = capacity_ - header_->write_offset;
        std::memcpy(data_ + header_->write_offset, &len, first_part);
        std::memcpy(data_, reinterpret_cast<uint8_t*>(&len) + first_part, sizeof(len) - first_part);
    } else {
        std::memcpy(data_ + header_->write_offset, &len, sizeof(len));
    }
    header_->write_offset = (header_->write_offset + sizeof(len)) % capacity_;

    if (header_->write_offset + serialized.size() > capacity_) {
        // Wrap around — copy in two parts
        size_t first_part = capacity_ - header_->write_offset;
        std::memcpy(data_ + header_->write_offset, serialized.data(), first_part);
        std::memcpy(data_, serialized.data() + first_part, serialized.size() - first_part);
    } else {
        std::memcpy(data_ + header_->write_offset, serialized.data(), serialized.size());
    }
    header_->write_offset = (header_->write_offset + serialized.size()) % capacity_;
    header_->count++;

    if (header_->oldest_ts == 0 || batch.original_timestamp_ms < header_->oldest_ts) {
        header_->oldest_ts = batch.original_timestamp_ms;
    }

    return true;
}

bool MMapRingBuffer::pop(MetricBatch& batch) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (header_->count == 0) return false;

    uint32_t len;
    if (header_->read_offset + sizeof(len) > capacity_) {
        size_t first_part = capacity_ - header_->read_offset;
        std::memcpy(&len, data_ + header_->read_offset, first_part);
        std::memcpy(reinterpret_cast<uint8_t*>(&len) + first_part, data_, sizeof(len) - first_part);
    } else {
        std::memcpy(&len, data_ + header_->read_offset, sizeof(len));
    }
    header_->read_offset = (header_->read_offset + sizeof(len)) % capacity_;

    std::vector<uint8_t> serialized(len);
    if (header_->read_offset + len > capacity_) {
        size_t first_part = capacity_ - header_->read_offset;
        std::memcpy(serialized.data(), data_ + header_->read_offset, first_part);
        std::memcpy(serialized.data() + first_part, data_, len - first_part);
    } else {
        std::memcpy(serialized.data(), data_ + header_->read_offset, len);
    }
    header_->read_offset = (header_->read_offset + len) % capacity_;
    header_->count--;

    return deserialize_batch(serialized.data(), len, batch);
}

size_t MMapRingBuffer::size() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return static_cast<size_t>(header_->count);
}

size_t MMapRingBuffer::capacity() const {
    return capacity_;
}

bool MMapRingBuffer::empty() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return header_->count == 0;
}

void MMapRingBuffer::clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    header_->write_offset = 0;
    header_->read_offset = 0;
    header_->count = 0;
    header_->oldest_ts = 0;
}

int64_t MMapRingBuffer::oldest_timestamp_ms() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return static_cast<int64_t>(header_->oldest_ts);
}

size_t MMapRingBuffer::write_available() const {
    if (header_->count == 0) {
        return capacity_;
    }
    if (header_->write_offset > header_->read_offset) {
        return capacity_ - (header_->write_offset - header_->read_offset);
    } else if (header_->write_offset < header_->read_offset) {
        return header_->read_offset - header_->write_offset;
    } else {
        return 0;
    }
}

static std::string escape_string(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        if (c == '\\') {
            out += "\\\\";
        } else if (c == '\n') {
            out += "\\n";
        } else if (c == '\r') {
            out += "\\r";
        } else {
            out.push_back(c);
        }
    }
    return out;
}

static std::string unescape_string(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (size_t i = 0; i < s.size(); ++i) {
        if (s[i] == '\\' && i + 1 < s.size()) {
            char next = s[i + 1];
            if (next == '\\') {
                out.push_back('\\');
                i++;
            } else if (next == 'n') {
                out.push_back('\n');
                i++;
            } else if (next == 'r') {
                out.push_back('\r');
                i++;
            } else {
                out.push_back(s[i]);
            }
        } else {
            out.push_back(s[i]);
        }
    }
    return out;
}

void MMapRingBuffer::serialize_batch(const MetricBatch& batch, std::vector<uint8_t>& out) {
    std::ostringstream oss;
    oss << escape_string(batch.agent_id) << "\n"
        << escape_string(batch.hostname) << "\n"
        << escape_string(batch.cluster) << "\n"
        << batch.batch_seq << "\n"
        << batch.original_timestamp_ms << "\n"
        << (batch.is_backlog ? "1" : "0") << "\n"
        << batch.metrics.size() << "\n";

    for (const auto& m : batch.metrics) {
        oss << escape_string(m.name) << "\n"
            << m.value << "\n"
            << m.timestamp_ms << "\n"
            << m.labels.size() << "\n";
        for (const auto& [k, v] : m.labels) {
            oss << escape_string(k) << "\n" << escape_string(v) << "\n";
        }
    }

    std::string str = oss.str();
    out.assign(str.begin(), str.end());
}

bool MMapRingBuffer::deserialize_batch(const uint8_t* data, size_t len, MetricBatch& batch) {
    try {
        std::string str(reinterpret_cast<const char*>(data), len);
        std::istringstream iss(str);

        std::string line;
        if (!std::getline(iss, line)) return false;
        batch.agent_id = unescape_string(line);

        if (!std::getline(iss, line)) return false;
        batch.hostname = unescape_string(line);

        if (!std::getline(iss, line)) return false;
        batch.cluster = unescape_string(line);

        std::string seq_str;
        if (!std::getline(iss, seq_str)) return false;
        batch.batch_seq = std::stoll(seq_str);

        std::string ts_str;
        if (!std::getline(iss, ts_str)) return false;
        batch.original_timestamp_ms = std::stoll(ts_str);

        std::string backlog_str;
        if (!std::getline(iss, backlog_str)) return false;
        batch.is_backlog = backlog_str == "1";

        std::string count_str;
        if (!std::getline(iss, count_str)) return false;
        size_t count = std::stoul(count_str);

        for (size_t i = 0; i < count; i++) {
            MetricSample sample;
            if (!std::getline(iss, line)) return false;
            sample.name = unescape_string(line);

            std::string val_str;
            if (!std::getline(iss, val_str)) return false;
            sample.value = std::stod(val_str);

            std::string ts_s;
            if (!std::getline(iss, ts_s)) return false;
            sample.timestamp_ms = std::stoll(ts_s);

            std::string labels_count;
            if (!std::getline(iss, labels_count)) return false;
            size_t lc = std::stoul(labels_count);

            for (size_t j = 0; j < lc; j++) {
                std::string k_line, v_line;
                if (!std::getline(iss, k_line)) return false;
                if (!std::getline(iss, v_line)) return false;
                sample.labels[unescape_string(k_line)] = unescape_string(v_line);
            }
            batch.metrics.push_back(std::move(sample));
        }

        return true;
    } catch (...) {
        return false;
    }
}

} // namespace astrawatch::agent::storage
