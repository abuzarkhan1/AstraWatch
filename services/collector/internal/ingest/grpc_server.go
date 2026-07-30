package ingest

import (
	"context"
	"log"
	"net"
	"time"

	"github.com/astrawatch/collector/internal/ingest/agentproto"
	"github.com/astrawatch/collector/pkg"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

type grpcAgentServer struct {
	agentproto.UnimplementedAgentIngestServer
	handler *AgentHandler
	startAt time.Time
}

func newGRPCAgentServer(h *AgentHandler) *grpcAgentServer {
	return &grpcAgentServer{handler: h, startAt: time.Now()}
}

func (s *grpcAgentServer) SendMetricBatch(ctx context.Context, batch *agentproto.MetricBatch) (*agentproto.IngestResponse, error) {
	var accepted, rejected int32
	for _, mp := range batch.Metrics {
		labels := mp.Labels
		if labels == nil {
			labels = make(map[string]string)
		}
		labels["source"] = "cxx-agent"
		labels["agent_id"] = batch.AgentId
		labels["host"] = batch.Hostname
		if batch.IsBacklog {
			labels["is_backlog"] = "true"
		}

		pmp := pkg.MetricPoint{
			Name:      mp.Name,
			Value:     mp.Value,
			Timestamp: mp.Timestamp.AsTime(),
			Labels:    labels,
		}

		if err := s.handler.processMetricPoint(pmp, batch.AgentId); err != nil {
			rejected++
			continue
		}
		accepted++
	}

	log.Printf("gRPC SendMetricBatch: agent=%s accepted=%d rejected=%d", batch.AgentId, accepted, rejected)
	return &agentproto.IngestResponse{
		Accepted: accepted,
		Rejected: rejected,
	}, nil
}

func (s *grpcAgentServer) StreamMetrics(stream grpc.ClientStreamingServer[agentproto.MetricBatch, agentproto.IngestResponse]) error {
	var totalAccepted, totalRejected int32
	for {
		batch, err := stream.Recv()
		if err != nil {
			break
		}

		var accepted, rejected int32
		for _, mp := range batch.Metrics {
			labels := mp.Labels
			if labels == nil {
				labels = make(map[string]string)
			}
			labels["source"] = "cxx-agent"
			labels["agent_id"] = batch.AgentId
			labels["host"] = batch.Hostname
			if batch.IsBacklog {
				labels["is_backlog"] = "true"
			}

			pmp := pkg.MetricPoint{
				Name:      mp.Name,
				Value:     mp.Value,
				Timestamp: mp.Timestamp.AsTime(),
				Labels:    labels,
			}

			if err := s.handler.processMetricPoint(pmp, batch.AgentId); err != nil {
				rejected++
				continue
			}
			accepted++
		}

		totalAccepted += accepted
		totalRejected += rejected
	}

	log.Printf("gRPC StreamMetrics: accepted=%d rejected=%d", totalAccepted, totalRejected)
	return stream.SendAndClose(&agentproto.IngestResponse{
		Accepted: totalAccepted,
		Rejected: totalRejected,
	})
}

func (s *grpcAgentServer) HealthCheck(ctx context.Context, req *agentproto.HealthRequest) (*agentproto.HealthResponse, error) {
	return &agentproto.HealthResponse{
		Status:        "HEALTHY",
		UptimeSeconds: int64(time.Since(s.startAt).Seconds()),
	}, nil
}

type GRPCCollectorServer struct {
	server *grpc.Server
	port   string
}

func StartGRPCCollector(handler *AgentHandler, port string, certFile, keyFile string) (*GRPCCollectorServer, error) {
	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return nil, nil
	}

	var opts []grpc.ServerOption
	opts = append(opts,
		grpc.MaxRecvMsgSize(10*1024*1024),
		grpc.MaxSendMsgSize(10*1024*1024),
	)

	if certFile != "" && keyFile != "" {
		creds, err := credentials.NewServerTLSFromFile(certFile, keyFile)
		if err != nil {
			return nil, err
		}
		opts = append(opts, grpc.Creds(creds))
	} else {
		opts = append(opts, grpc.Creds(insecure.NewCredentials()))
	}

	grpcServer := grpc.NewServer(opts...)
	srv := newGRPCAgentServer(handler)
	agentproto.RegisterAgentIngestServer(grpcServer, srv)

	go func() {
		log.Printf("gRPC collector listening on :%s", port)
		if err := grpcServer.Serve(lis); err != nil {
			log.Printf("gRPC server stopped: %v", err)
		}
	}()

	return &GRPCCollectorServer{
		server: grpcServer,
		port:   port,
	}, nil
}

func (g *GRPCCollectorServer) Stop() {
	if g.server != nil {
		log.Println("Stopping gRPC collector...")
		g.server.GracefulStop()
	}
}

func (g *GRPCCollectorServer) Port() string { return g.port }
