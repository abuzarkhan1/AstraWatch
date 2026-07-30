import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// In-memory API key store. In production this would be a DB/Redis lookup.
const apiKeyStore = new Map();

class SocketAuth {
  validateToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256', 'RS256'],
      });

      if (decoded.type && decoded.type === 'refresh') {
        return { valid: false, error: 'Refresh tokens not allowed for WebSocket' };
      }

      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        return { valid: false, error: 'Token expired' };
      }

      return {
        valid: true,
        userId: decoded.sub || decoded.userId,
        roles: decoded.roles || [],
        permissions: decoded.permissions || [],
        teamId: decoded.teamId,
        tenantId: decoded.tenantId || 'default',
        exp: decoded.exp,
        token,
      };
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return { valid: false, error: 'Token expired' };
      }
      return { valid: false, error: 'Invalid token' };
    }
  }

  validateApiKey(key) {
    if (!key || typeof key !== 'string') {
      return { valid: false, error: 'API key is required' };
    }
    if (key.length < 16) {
      return { valid: false, error: 'API key too short' };
    }

    const prefix = key.substring(0, 8);
    if (apiKeyStore.has(key)) {
      const entry = apiKeyStore.get(key);
      if (entry.revoked) {
        return { valid: false, error: 'API key has been revoked' };
      }
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        apiKeyStore.delete(key);
        return { valid: false, error: 'API key has expired' };
      }
      return {
        valid: true,
        type: 'api_key',
        keyPrefix: prefix,
        userId: entry.userId,
        roles: entry.roles || [],
        permissions: entry.permissions || ['read'],
        tenantId: entry.tenantId || 'default',
      };
    }

    // Accept any valid-format key for dev; real validation would hit the orchestrator DB
    return {
      valid: true,
      type: 'api_key',
      keyPrefix: prefix,
      userId: null,
      roles: [],
      permissions: ['read'],
      tenantId: 'default',
    };
  }

  registerApiKey(key, metadata = {}) {
    apiKeyStore.set(key, {
      userId: metadata.userId || null,
      roles: metadata.roles || [],
      permissions: metadata.permissions || ['read'],
      tenantId: metadata.tenantId || 'default',
      revoked: false,
      expiresAt: metadata.expiresAt || null,
      createdAt: Date.now(),
    });
  }

  revokeApiKey(key) {
    if (apiKeyStore.has(key)) {
      const entry = apiKeyStore.get(key);
      entry.revoked = true;
      apiKeyStore.set(key, entry);
    }
  }

  isTokenExpiringSoon(decoded, windowSeconds = 300) {
    if (!decoded.exp) return false;
    return (decoded.exp * 1000) - Date.now() < windowSeconds * 1000;
  }
}

export default new SocketAuth();
