export function setupIncidentSocket(socket, io) {
  const tenantId = socket.user?.tenantId || 'default';

  socket.on('incident:subscribe', ({ incidentId } = {}) => {
    if (incidentId) {
      socket.join(`tenant:${tenantId}:incident:${incidentId}`);
    }
  });

  socket.on('incident:unsubscribe', ({ incidentId } = {}) => {
    if (incidentId) {
      socket.leave(`tenant:${tenantId}:incident:${incidentId}`);
    }
  });

  return {
    emitUpdated(incidentId, data, targetTenantId = tenantId) {
      io.to(`tenant:${targetTenantId}:incident:${incidentId}`).emit('incident:updated', data);
    },
    emitResolved(incidentId, data, targetTenantId = tenantId) {
      io.to(`tenant:${targetTenantId}:incident:${incidentId}`).emit('incident:resolved', data);
    },
    emitAcknowledged(incidentId, data, targetTenantId = tenantId) {
      io.to(`tenant:${targetTenantId}:incident:${incidentId}`).emit('incident:acknowledged', data);
    },
  };
}
