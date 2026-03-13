/**
 * Performance monitoring utilities for tracking app performance
 */

import { InteractionManager } from 'react-native';

interface PerformanceMetrics {
  componentName: string;
  renderTime: number;
  timestamp: number;
}

const metrics: PerformanceMetrics[] = [];
const MAX_METRICS = 100;

/**
 * Measure component render time
 * @param componentName Name of the component being measured
 * @returns Function to call when component finishes rendering
 */
export const measureRenderTime = (componentName: string) => {
  const startTime = performance.now();
  
  return () => {
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Store metric
    metrics.push({
      componentName,
      renderTime,
      timestamp: Date.now(),
    });
    
    // Keep only recent metrics
    if (metrics.length > MAX_METRICS) {
      metrics.shift();
    }
    
    // Log slow renders in development
    if (__DEV__ && renderTime > 16) { // 16ms = 60fps budget
      console.warn(`[Performance] Slow render: ${componentName} took ${renderTime.toFixed(2)}ms`);
    }
    
    return renderTime;
  };
};

/**
 * Run expensive operations after interactions complete
 * @param operation Function to run
 * @param delayMs Optional delay in milliseconds
 */
export const runAfterInteraction = <T,>(
  operation: () => T,
  delayMs?: number
): Promise<T> => {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      if (delayMs) {
        setTimeout(() => resolve(operation()), delayMs);
      } else {
        resolve(operation());
      }
    });
  });
};

/**
 * Get performance metrics summary
 */
export const getPerformanceMetrics = () => {
  const summary: Record<string, { count: number; avgTime: number; maxTime: number }> = {};
  
  metrics.forEach((metric) => {
    if (!summary[metric.componentName]) {
      summary[metric.componentName] = { count: 0, avgTime: 0, maxTime: 0 };
    }
    
    const s = summary[metric.componentName];
    s.count++;
    s.avgTime = (s.avgTime * (s.count - 1) + metric.renderTime) / s.count;
    s.maxTime = Math.max(s.maxTime, metric.renderTime);
  });
  
  return summary;
};

/**
 * Clear all metrics
 */
export const clearPerformanceMetrics = () => {
  metrics.length = 0;
};

/**
 * Debounce function for expensive operations
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * Throttle function to limit execution rate
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}
