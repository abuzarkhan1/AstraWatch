# Stage 1 — build eBPF objects
FROM ubuntu:22.04 AS ebpf-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    clang llvm libbpf-dev linux-headers-generic make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY bpf/ bpf/
RUN mkdir -p /build/ebpf && \
    for f in sched_switch tcp_probe block_io; do \
        clang -g -O2 -target bpf -D__TARGET_ARCH_x86 \
            -I/usr/include/x86_64-linux-gnu \
            -c bpf/${f}.bpf.c -o /build/ebpf/${f}.bpf.o; \
    done

# Stage 2 — build agent binary
FROM ubuntu:22.04 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake ninja-build libcurl4-openssl-dev libbpf-dev \
    libgrpc++-dev protobuf-compiler libprotobuf-dev libzstd-dev libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY --from=ebpf-builder /build/ebpf/ /src/build/ebpf/

COPY CMakeLists.txt .
COPY include/ include/
COPY src/ src/
COPY test/ test/
COPY bpf/ bpf/

RUN cmake -S . -B build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_TESTING=ON && \
    cmake --build build && \
    cmake --install build --prefix /install

# Stage 3 — minimal runtime image
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4 libbpf0 ca-certificates \
    && rm -rf /var/lib/apt/lists/* && \
    mkdir -p /var/lib/astrawatch /etc/astrawatch/ebpf

COPY --from=builder /install/usr/local/bin/astrawatch-agent /usr/local/bin/
COPY --from=ebpf-builder /build/ebpf/*.bpf.o /etc/astrawatch/ebpf/

ENV ASTRAWATCH_BUFFER_PATH=/var/lib/astrawatch/agent_buffer

ENTRYPOINT ["/usr/local/bin/astrawatch-agent"]
