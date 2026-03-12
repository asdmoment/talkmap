import { useSyncExternalStore } from 'react';
import type { SessionEvent } from '../lib/socket';
import { createSessionStore, type SessionState } from './sessionStore';

let store = createSessionStore();
const listeners = new Set<() => void>();
let snapshot = store.getState();
let unsubscribeStore = store.subscribe(notifyListeners);
let sessionSocket: WebSocket | null = null;

function notifyListeners() {
  snapshot = store.getState();
  listeners.forEach((listener) => {
    listener();
  });
}

function attachStore() {
  unsubscribeStore();
  unsubscribeStore = store.subscribe(notifyListeners);
}

export function useSessionState(): SessionState {
  return useSyncExternalStore(subscribe, getSessionState, getSessionState);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSessionState() {
  return snapshot;
}

export function applySessionEvent(event: SessionEvent) {
  const nextState = store.applyEvent(event);
  snapshot = nextState;
  return nextState;
}

export function setSessionSocket(socket: WebSocket | null) {
  sessionSocket = socket;
}

export function getSessionSocket() {
  return sessionSocket;
}

export function seedSessionState(state: Partial<SessionState>) {
  store = createSessionStore(state);
  snapshot = store.getState();
  attachStore();
  notifyListeners();
}

export function resetSessionState() {
  store = createSessionStore();
  snapshot = store.getState();
  sessionSocket = null;
  attachStore();
  notifyListeners();
}
