export function setupIncidentSocket(socket, io) {
  socket.on('incident:subscribe', ({ incidentId } = {}) => {
    if (incidentId) {
      socket.join(`incident:${incidentId}`);
    }
  });

  socket.on('incident:unsubscribe', ({ incidentId } = {}) => {
    if (incidentId) {
      socket.leave(`incident:${incidentId}`);
    }
  });

  return {
    emitUpdated(incidentId, data) {
      io.to(`incident:${incidentId}`).emit('incident:updated', data);
    },
    emitResolved(incidentId, data) {
      io.to(`incident:${incidentId}`).emit('incident:resolved', data);
    },
    emitAcknowledged(incidentId, data) {
      io.to(`incident:${incidentId}`).emit('incident:acknowledged', data);
    },
  };
}
