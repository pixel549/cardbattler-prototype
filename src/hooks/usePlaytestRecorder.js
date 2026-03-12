import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PLAYTEST_UPLOAD_ENDPOINT,
  createPlaytestSessionId,
  readPlaytestModeEnabled,
} from '../playtest/config.js';

function getDeviceMeta() {
  if (typeof window === 'undefined') {
    return {
      userAgent: 'server',
      width: null,
      height: null,
      pixelRatio: null,
      language: null,
      standalone: false,
    };
  }
  return {
    userAgent: window.navigator?.userAgent ?? 'unknown',
    width: window.innerWidth,
    height: Math.round(window.visualViewport?.height || window.innerHeight),
    pixelRatio: window.devicePixelRatio ?? 1,
    language: window.navigator?.language ?? null,
    standalone: Boolean(window.matchMedia?.('(display-mode: standalone)').matches),
  };
}

export default function usePlaytestRecorder({ screen = 'app', enabled } = {}) {
  const resolvedEnabled = enabled ?? readPlaytestModeEnabled();
  const [status, setStatus] = useState(() => ({
    enabled: resolvedEnabled,
    sessionId: resolvedEnabled ? createPlaytestSessionId(screen) : null,
    pendingCount: 0,
    lastSyncAt: null,
    lastError: null,
  }));
  const sessionIdRef = useRef(status.sessionId);
  const startedAtRef = useRef(status.enabled ? new Date().toISOString() : null);
  const seqRef = useRef(0);
  const pendingEventsRef = useRef([]);
  const flushInFlightRef = useRef(false);

  useEffect(() => {
    if (!resolvedEnabled) {
      pendingEventsRef.current = [];
      sessionIdRef.current = null;
      startedAtRef.current = null;
      seqRef.current = 0;
      setStatus({
        enabled: false,
        sessionId: null,
        pendingCount: 0,
        lastSyncAt: null,
        lastError: null,
      });
      return;
    }
    if (!sessionIdRef.current) {
      sessionIdRef.current = createPlaytestSessionId(screen);
      startedAtRef.current = new Date().toISOString();
      seqRef.current = 0;
    }
    setStatus((prev) => ({
      ...prev,
      enabled: true,
      sessionId: sessionIdRef.current,
    }));
  }, [resolvedEnabled, screen]);

  const flush = useCallback(async (reason = 'manual', preferBeacon = false) => {
    if (!resolvedEnabled || flushInFlightRef.current || pendingEventsRef.current.length === 0) return false;

    const payload = {
      sessionId: sessionIdRef.current || createPlaytestSessionId(screen),
      screen,
      startedAt: startedAtRef.current || new Date().toISOString(),
      flushedAt: new Date().toISOString(),
      reason,
      meta: getDeviceMeta(),
      events: pendingEventsRef.current.splice(0),
    };

    sessionIdRef.current = payload.sessionId;
    startedAtRef.current = payload.startedAt;
    setStatus((prev) => ({ ...prev, sessionId: payload.sessionId, pendingCount: 0 }));

    if (preferBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(
        PLAYTEST_UPLOAD_ENDPOINT,
        new Blob([JSON.stringify(payload)], { type: 'application/json' }),
      );
      if (ok) {
        setStatus((prev) => ({ ...prev, lastSyncAt: payload.flushedAt, lastError: null }));
        return true;
      }
      pendingEventsRef.current.unshift(...payload.events);
      setStatus((prev) => ({
        ...prev,
        pendingCount: pendingEventsRef.current.length,
        lastError: 'Beacon upload failed',
      }));
      return false;
    }

    flushInFlightRef.current = true;
    try {
      const response = await fetch(PLAYTEST_UPLOAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
      }
      setStatus((prev) => ({ ...prev, lastSyncAt: payload.flushedAt, lastError: null }));
      return true;
    } catch (error) {
      pendingEventsRef.current.unshift(...payload.events);
      setStatus((prev) => ({
        ...prev,
        pendingCount: pendingEventsRef.current.length,
        lastError: error instanceof Error ? error.message : 'Upload failed',
      }));
      return false;
    } finally {
      flushInFlightRef.current = false;
    }
  }, [resolvedEnabled, screen]);

  const record = useCallback((type, payload = {}) => {
    if (!resolvedEnabled) return;
    if (!sessionIdRef.current) {
      sessionIdRef.current = createPlaytestSessionId(screen);
      startedAtRef.current = new Date().toISOString();
      seqRef.current = 0;
    }
    seqRef.current += 1;
    pendingEventsRef.current.push({
      seq: seqRef.current,
      at: new Date().toISOString(),
      type,
      payload,
    });
    const nextPendingCount = pendingEventsRef.current.length;
    setStatus((prev) => ({
      ...prev,
      enabled: true,
      sessionId: sessionIdRef.current,
      pendingCount: nextPendingCount,
    }));
    if (nextPendingCount >= 8) {
      void flush('threshold');
    }
  }, [flush, resolvedEnabled, screen]);

  useEffect(() => {
    if (!resolvedEnabled) return undefined;
    record('session_started', {
      screen,
      path: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
      meta: getDeviceMeta(),
    });

    const onPageHide = () => {
      void flush('pagehide', true);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide);
      }
      void flush('unmount', true);
    };
  }, [flush, record, resolvedEnabled, screen]);

  return {
    enabled: resolvedEnabled,
    sessionId: status.sessionId,
    pendingCount: status.pendingCount,
    lastSyncAt: status.lastSyncAt,
    lastError: status.lastError,
    record,
    flush,
  };
}
