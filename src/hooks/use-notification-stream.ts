'use client'

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@clerk/nextjs';

interface NotificationStreamEvent {
  type: 'notification' | 'system' | 'connection' | 'heartbeat';
  notification?: any;
  message?: string;
  timestamp: string;
}

interface UseNotificationStreamOptions {
  onNotification?: (notification: any) => void;
  onSystemMessage?: (notification: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

export function useNotificationStream(options: UseNotificationStreamOptions = {}) {
  const {
    onNotification,
    onSystemMessage,
    onConnect,
    onDisconnect,
    onError,
    autoReconnect = true,
    reconnectDelay = 3000,
  } = options;

  const { isSignedIn, getToken } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);
  const shouldConnectRef = useRef(true);
  const [isClient, setIsClient] = useState(false);
  const connectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  // Ensure we only run on the client side
  // This prevents SSR errors since EventSource is only available in browsers
  useEffect(() => {
    setIsClient(true);
  }, []);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    isConnectingRef.current = false;
  }, []);

  const connect = useCallback(async function connect() {
    // Only run on client side
    if (!isClient) {
      return;
    }

    // Check if EventSource is available
    if (typeof EventSource === 'undefined') {
      console.log('EventSource not available in this environment');
      onError?.(new Error('EventSource not supported'));
      return;
    }

    if (!isSignedIn || isConnectingRef.current || !shouldConnectRef.current) {
      console.log('Skipping SSE connection:', { isSignedIn, isConnecting: isConnectingRef.current, shouldConnect: shouldConnectRef.current });
      return;
    }
    
    // Check if we've exceeded max reconnect attempts
    if (connectAttempts.current >= maxReconnectAttempts) {
      console.log(`Max reconnect attempts (${maxReconnectAttempts}) reached. Stopping SSE connection attempts.`);
      shouldConnectRef.current = false;
      return;
    }

    // Don't connect if no handlers are provided (no point in maintaining connection)
    if (!onNotification && !onSystemMessage && !onConnect && !onDisconnect && !onError) {
      console.log('Skipping SSE connection: No event handlers provided');
      return;
    }

    try {
      isConnectingRef.current = true;
      cleanup();

      // Check if user has authentication token
      const token = await getToken();
      if (!token) {
        console.log('No authentication token available for SSE connection');
        isConnectingRef.current = false;
        onError?.(new Error('Authentication required for real-time notifications'));
        return;
      }

      console.log('Attempting to connect to notification stream...');
      
      // Skip HEAD test for now - EventSource will handle connection testing
      console.log('Attempting to connect to notification stream without HEAD test...');
      
      const eventSource = new EventSource('/api/v1/notifications/stream');
      // Note: EventSource automatically includes cookies for same-origin requests

      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('Notification stream connected');
        isConnectingRef.current = false;
        connectAttempts.current = 0; // Reset attempts on successful connection
        onConnect?.();
      };

      eventSource.addEventListener('connected', (event) => {
        try {
          const data: NotificationStreamEvent = JSON.parse(event.data);
          console.log('Connected to notification stream:', data.message);
        } catch (error) {
          console.error('Error parsing connected event:', error);
        }
      });

      eventSource.addEventListener('notification', (event) => {
        try {
          const data: NotificationStreamEvent = JSON.parse(event.data);
          console.log('Received real-time notification:', data.notification);
          onNotification?.(data.notification);
        } catch (error) {
          console.error('Error parsing notification event:', error);
        }
      });

      eventSource.addEventListener('system', (event) => {
        try {
          const data: NotificationStreamEvent = JSON.parse(event.data);
          console.log('Received system notification:', data.notification);
          onSystemMessage?.(data.notification);
        } catch (error) {
          console.error('Error parsing system event:', error);
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        // Just acknowledge the heartbeat
        console.debug('Heartbeat received');
      });

      eventSource.onerror = (error) => {
        console.error('Notification stream error. ReadyState:', eventSource.readyState, 'Event:', error);
        isConnectingRef.current = false;
        
        // More detailed error information
        let errorMessage = 'Notification stream connection error';
        const EventSourceClass = typeof EventSource !== 'undefined' ? EventSource : null;
        if (EventSourceClass && eventSource.readyState === EventSourceClass.CLOSED) {
          errorMessage = 'Connection closed unexpectedly';
        } else if (EventSourceClass && eventSource.readyState === EventSourceClass.CONNECTING) {
          errorMessage = 'Connection failed to establish';
        }
        
        // Check if this is an authentication error
        if (EventSourceClass && eventSource.readyState === EventSourceClass.CLOSED) {
          onDisconnect?.();
          
          // Check if we should attempt reconnection
          if (autoReconnect && shouldConnectRef.current && isSignedIn) {
            connectAttempts.current++;
            if (connectAttempts.current < maxReconnectAttempts) {
              const backoffDelay = Math.min(reconnectDelay * Math.pow(2, connectAttempts.current - 1), 30000); // Exponential backoff, max 30s
              console.log(`Reconnecting to notification stream in ${backoffDelay}ms (attempt ${connectAttempts.current}/${maxReconnectAttempts})...`);
              reconnectTimeoutRef.current = setTimeout(() => {
                connect();
              }, backoffDelay);
            } else {
              console.log('Max reconnection attempts reached. Stopping auto-reconnect.');
              shouldConnectRef.current = false;
            }
          } else if (!isSignedIn) {
            console.log('User signed out, not attempting reconnection');
          }
        }
        
        onError?.(new Error(errorMessage));
      };

    } catch (error) {
      console.error('Failed to connect to notification stream:', error);
      isConnectingRef.current = false;
      onError?.(error as Error);
      
      if (autoReconnect && shouldConnectRef.current) {
        connectAttempts.current++;
        if (connectAttempts.current < maxReconnectAttempts) {
          const backoffDelay = Math.min(reconnectDelay * Math.pow(2, connectAttempts.current - 1), 30000);
          console.log(`Reconnecting after error in ${backoffDelay}ms (attempt ${connectAttempts.current}/${maxReconnectAttempts})...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, backoffDelay);
        } else {
          console.log('Max reconnection attempts reached after error. Stopping auto-reconnect.');
          shouldConnectRef.current = false;
        }
      }
    }
  }, [isClient, isSignedIn, getToken, onConnect, onDisconnect, onError, onNotification, onSystemMessage, autoReconnect, reconnectDelay, cleanup]);

  const disconnect = useCallback(() => {
    shouldConnectRef.current = false;
    cleanup();
    onDisconnect?.();
  }, [cleanup, onDisconnect]);

  const reconnect = useCallback(() => {
    console.log('Manual reconnect requested, resetting connection attempts');
    connectAttempts.current = 0;
    shouldConnectRef.current = true;
    connect();
  }, [connect]);

  // Connect when component mounts and user is signed in (only on client)
  useEffect(() => {
    if (isClient && isSignedIn && shouldConnectRef.current && autoReconnect) {
      // Only connect if not already connecting or connected
      if (!isConnectingRef.current && !eventSourceRef.current) {
        connect();
      }
    } else if (!isSignedIn) {
      disconnect();
    }
  }, [isClient, isSignedIn]); // Removed connect/disconnect from deps to prevent loops

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldConnectRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  // Return connection management functions
  return {
    connect,
    disconnect,
    reconnect,
    isConnected: isClient && eventSourceRef.current?.readyState === (typeof EventSource !== 'undefined' ? EventSource.OPEN : 1),
    isConnecting: isConnectingRef.current,
  };
}