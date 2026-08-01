export function setupDashboardSocket(socket, io) {
  const tenantId = socket.user?.tenantId || 'default';

  socket.on('dashboard:subscribe', ({ dashboardId } = {}) => {
    if (dashboardId) {
      socket.join(`tenant:${tenantId}:dashboard:${dashboardId}`);
    }
  });

  socket.on('dashboard:unsubscribe', ({ dashboardId } = {}) => {
    if (dashboardId) {
      socket.leave(`tenant:${tenantId}:dashboard:${dashboardId}`);
    }
  });

  return {
    emitUpdate(dashboardId, data, targetTenantId = tenantId) {
      io.to(`tenant:${targetTenantId}:dashboard:${dashboardId}`).emit('dashboard:update', data);
    },
  };
}
