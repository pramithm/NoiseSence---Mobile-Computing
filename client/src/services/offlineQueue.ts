import type { OfflineReading } from '../types';
import { submitReading } from './api';

const STORAGE_KEY = 'noisesense_offline_queue_v1';

export function getOfflineQueue(): OfflineReading[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveToOfflineQueue(reading: Omit<OfflineReading, 'id' | 'synced'>): OfflineReading {
  const queue = getOfflineQueue();
  const newItem: OfflineReading = {
    ...reading,
    id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    synced: false
  };
  queue.push(newItem);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  return newItem;
}

export function removeFromOfflineQueue(id: string) {
  const queue = getOfflineQueue().filter(item => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let syncedCount = 0;
  let failedCount = 0;
  const remaining: OfflineReading[] = [];

  for (const item of queue) {
    try {
      await submitReading({
        decibel: item.decibel,
        latitude: item.latitude,
        longitude: item.longitude,
        accuracy: item.accuracy,
        locationName: item.locationName,
        source: 'Synced from Offline Cache',
        timestamp: item.timestamp
      });
      syncedCount++;
    } catch (err) {
      console.warn(`Failed to sync reading ${item.id}:`, err);
      failedCount++;
      remaining.push(item);
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  return { synced: syncedCount, failed: failedCount };
}
