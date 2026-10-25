import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';
import type { HeatmapCell, NoiseReading, DashboardStats } from '../types';

let socket: Socket | null = null;

export type SocketStatus = 'connected' | 'connecting' | 'disconnected';

export interface SocketCallbacks {
  onStatusChange?: (status: SocketStatus) => void;
  onHeatmapUpdate?: (cells: HeatmapCell[]) => void;
  onNewReading?: (reading: NoiseReading) => void;
  onStatsUpdate?: (stats: DashboardStats) => void;
}

export function initSocket(callbacks: SocketCallbacks): Socket {
  if (socket) {
    socket.disconnect();
  }

  callbacks.onStatusChange?.('connecting');

  socket = io(API_BASE, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 5000,
    timeout: 10000
  });

  socket.on('connect', () => {
    callbacks.onStatusChange?.('connected');
  });

  socket.on('disconnect', () => {
    callbacks.onStatusChange?.('disconnected');
  });

  socket.on('connect_error', () => {
    callbacks.onStatusChange?.('disconnected');
  });

  socket.on('heatmap:init', (cells: HeatmapCell[]) => {
    callbacks.onHeatmapUpdate?.(cells);
  });

  socket.on('heatmap:update', (cells: HeatmapCell[]) => {
    callbacks.onHeatmapUpdate?.(cells);
  });

  socket.on('reading:new', (reading: NoiseReading) => {
    callbacks.onNewReading?.(reading);
  });

  socket.on('stats:update', (stats: DashboardStats) => {
    callbacks.onStatsUpdate?.(stats);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
