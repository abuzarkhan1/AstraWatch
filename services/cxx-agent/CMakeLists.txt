cmake_minimum_required(VERSION 3.20)
project(astrawatch-agent VERSION 1.0.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# ── Dependencies ──────────────────────────────────────────────────────────
find_package(PkgConfig REQUIRED)

# gRPC + Protobuf (primary transport)
find_package(gRPC REQUIRED)
find_package(Protobuf REQUIRED)

# OpenSSL (mTLS)
find_package(OpenSSL REQUIRED)

# zstd (application-level compression, gRPC already does transport-level)
find_package(zstd QUIET)
if(NOT zstd_FOUND)
    find_package(PkgConfig)
    pkg_check_modules(ZSTD libzstd)
endif()

# libbpf (eBPF loading) — optional; agent runs without eBPF on unsupported kernels
find_package(PkgConfig)
if(PkgConfig_FOUND)
    pkg_check_modules(LIBBPF libbpf)
endif()
if(NOT LIBBPF_FOUND)
    find_path(LIBBPF_INCLUDE_DIRS bpf/libbpf.h QUIET)
    find_library(LIBBPF_LIBRARIES bpf QUIET)
endif()

# Threads
find_package(Threads REQUIRED)

# ── Compile definitions and features ─────────────────────────────────────
if(LIBBPF_FOUND)
    add_definitions(-DHAS_LIBBPF)
    message(STATUS "libbpf found — eBPF probes enabled")
else()
    message(STATUS "libbpf NOT found — eBPF probes disabled (stub impl)")
endif()

if(zstd_FOUND OR ZSTD_FOUND)
    add_definitions(-DHAS_ZSTD)
    message(STATUS "zstd found — compression enabled")
else()
    message(STATUS "zstd NOT found — compression disabled")
endif()

# ── Protobuf generation ───────────────────────────────────────────────────
set(PROTO_FILE ${CMAKE_SOURCE_DIR}/proto/agent.proto)
set(PROTO_BINARY_DIR ${CMAKE_BINARY_DIR}/proto)

file(MAKE_DIRECTORY ${PROTO_BINARY_DIR})

protobuf_generate(
    PROTO_OUT ${PROTO_BINARY_DIR}
    LANGUAGE cpp
    PROTOS ${PROTO_FILE}
)

# ── Sources ───────────────────────────────────────────────────────────────
set(AGENT_SOURCES
    src/main.cpp
    src/config.cpp
    src/bpf_manager.cpp
    src/grpc_client.cpp
    src/ring_buffer.cpp
)

set(AGENT_HEADERS
    include/astrawatch/transport/config.h
    include/astrawatch/transport/bpf_manager.h
    include/astrawatch/transport/grpc_client.h
    include/astrawatch/storage/ring_buffer.h
)

# ── eBPF object compilation (requires clang + bpf target) ─────────────────
set(BPF_SOURCES
    bpf/sched_switch.bpf.c
    bpf/tcp_probe.bpf.c
    bpf/block_io.bpf.c
)

set(BPF_OBJECTS "")
foreach(BPF_SRC ${BPF_SOURCES})
    get_filename_component(BPF_NAME ${BPF_SRC} NAME_WE)
    set(BPF_OBJ ${CMAKE_BINARY_DIR}/ebpf/${BPF_NAME}.bpf.o)

    add_custom_command(
        OUTPUT ${BPF_OBJ}
        COMMAND clang -g -O2 -target bpf -D__TARGET_ARCH_x86
                -I/usr/include/x86_64-linux-gnu
                -c ${BPF_SRC}
                -o ${BPF_OBJ}
        DEPENDS ${BPF_SRC}
        COMMENT "Compiling eBPF: ${BPF_SRC} → ${BPF_OBJ}"
    )
    list(APPEND BPF_OBJECTS ${BPF_OBJ})
endforeach()

add_custom_target(ebpf_objects ALL DEPENDS ${BPF_OBJECTS})
install(FILES ${BPF_OBJECTS} DESTINATION /etc/astrawatch/ebpf)

# ── Executable ────────────────────────────────────────────────────────────
add_executable(astrawatch-agent
    ${AGENT_SOURCES}
    ${AGENT_HEADERS}
    ${PROTO_BINARY_DIR}/agent.pb.cc
    ${PROTO_BINARY_DIR}/agent.grpc.pb.cc
)

target_include_directories(astrawatch-agent PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${PROTO_BINARY_DIR}
    ${LIBBPF_INCLUDE_DIRS}
    ${gRPC_INCLUDE_DIRS}
    ${Protobuf_INCLUDE_DIRS}
    ${OPENSSL_INCLUDE_DIR}
)

target_link_libraries(astrawatch-agent PRIVATE
    gRPC::grpc++
    protobuf::libprotobuf
    OpenSSL::SSL
    OpenSSL::Crypto
    Threads::Threads
    dl
)

if(LIBBPF_FOUND)
    target_link_libraries(astrawatch-agent PRIVATE ${LIBBPF_LIBRARIES})
endif()

if(ZSTD_FOUND OR zstd_FOUND)
    if(ZSTD_FOUND)
        target_link_libraries(astrawatch-agent PRIVATE ${ZSTD_LIBRARIES})
    else()
        target_link_libraries(astrawatch-agent PRIVATE zstd::libzstd)
    endif()
endif()

# ── Tests ─────────────────────────────────────────────────────────────────
enable_testing()
add_executable(agent_test
    test/ring_buffer_test.cpp
    src/ring_buffer.cpp
    src/config.cpp
)
target_include_directories(agent_test PRIVATE
    ${CMAKE_SOURCE_DIR}/include
)
target_link_libraries(agent_test PRIVATE Threads::Threads)
add_test(NAME agent_test COMMAND agent_test)

# ── Install ───────────────────────────────────────────────────────────────
install(TARGETS astrawatch-agent DESTINATION /usr/local/bin)
install(DIRECTORY include/ DESTINATION include)
install(FILES ${CMAKE_SOURCE_DIR}/proto/agent.proto DESTINATION share/astrawatch/proto)

# ── Packaging ─────────────────────────────────────────────────────────────
set(CPACK_PACKAGE_NAME "astrawatch-agent")
set(CPACK_PACKAGE_VERSION "1.0.0")
include(CPack)
