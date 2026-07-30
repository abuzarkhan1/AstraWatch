export function setupDashboardSocket(socket, io) {
  socket.on('dashboard:subscribe', ({ dashboardId } = {}) => {
    if (dashboardId) {
      socket.join(`dashboard:${dashboardId}`);
    }
  });

  socket.on('dashboard:unsubscribe', ({ dashboardId } = {}) => {
    if (dashboardId) {
      socket.leave(`dashboard:${dashboardId}`);
    }
  });

  return {
    emitUpdate(dashboardId, data) {
      io.to(`dashboard:${dashboardId}`).emit('dashboard:update', data);
    },
  };
}
