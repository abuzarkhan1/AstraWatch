package com.astrawatch.orchestrator.adapter.in.web;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record ApiResponse<T>(boolean success, T data, Map<String, Object> meta) {

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, metaOf());
    }

    public static <T> ApiResponse<T> created(T data) {
        return new ApiResponse<>(true, data, metaOf());
    }

    @SuppressWarnings("unchecked")
    public static <T> ApiResponse<T> accepted() {
        return (ApiResponse<T>) new ApiResponse<>(true, null, metaOf());
    }

    public static <T> ApiResponse<T> of(T data) {
        return ok(data);
    }

    private static Map<String, Object> metaOf() {
        return Map.of("timestamp", Instant.now().toString(), "traceId", UUID.randomUUID().toString());
    }
}
