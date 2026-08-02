import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../config.js';

// No hardcoded fallback secret (audit V2: a default signing key in source was a
// security hole). The secret comes from the shared JWT_SECRET env var; if it is
// missing, all token validation fails closed.
const JWT_SECRET = config.JWT_SECRET || '';

// In-memory API key store, populated from the orchestrator's internal endpoint
// (see RealtimeGateway.syncApiKeys). Unknown keys are rejected — accepting any
// 16+ char string as a valid key was an auth bypass.
const apiKeyStore = new Map();

class SocketAuth {
  validateToken(token) {
    if (!JWT_SECRET) {
      return { valid: false, error: 'JWT_SECRET not configured on realtime' };
    }
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

    // The orchestrator persists only the SHA-256 of each key; the gateway stores
    // the same hashes, so the presented plaintext is hashed before lookup. The
    // plaintext key itself is never stored.
    const keyHash = sha256(key);
    const prefix = key.substring(0, 8);
    const entry = apiKeyStore.get(keyHash);
    if (entry) {
      if (entry.revoked) {
        return { valid: false, error: 'API key has been revoked' };
      }
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        apiKeyStore.delete(keyHash);
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

    // Unknown API key → reject. Keys are only valid once synced from the
    // orchestrator's persisted API-key store.
    return { valid: false, error: 'Unknown API key' };
  }

  registerApiKey(key, metadata = {}) {
    apiKeyStore.set(sha256(key), {
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
    apiKeyStore.delete(sha256(key));
  }

  /**
   * Replace the entire store with the keys returned by the orchestrator's
   * internal endpoint (each entry carries its SHA-256 keyHash). This is what
   * makes created API keys actually usable for WebSocket auth (audit: the store
   * was never populated).
   */
  replaceApiKeys(keys) {
    apiKeyStore.clear();
    if (!Array.isArray(keys)) return;
    for (const k of keys) {
      if (!k || !k.keyHash) continue;
      apiKeyStore.set(k.keyHash, {
        userId: k.userId || null,
        roles: k.roles || [],
        permissions: k.permissions || ['read'],
        tenantId: k.tenantId || 'default',
        revoked: !!k.revoked,
        expiresAt: k.expiresAt ? new Date(k.expiresAt).getTime() : null,
        createdAt: Date.now(),
      });
    }
  }

  countApiKeys() {
    return apiKeyStore.size;
  }

  isTokenExpiringSoon(decoded, windowSeconds = 300) {
    if (!decoded.exp) return false;
    return (decoded.exp * 1000) - Date.now() < windowSeconds * 1000;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('base64url');
}

export default new SocketAuth();
