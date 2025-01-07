import { useEffect, useRef, useCallback } from "react";
import { useUser } from "./use-user";
import { useToast } from "./use-toast";

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

type MessageHandler = {
  id: string;
  scope: string;
  handler: (message: WebSocketMessage) => void;
  isPersistent: boolean;
};

export function useWebSocket() {
  const { user } = useUser();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const persistentHandlersRef = useRef<MessageHandler[]>([]);
  const temporaryHandlersRef = useRef<MessageHandler[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const isConnectingRef = useRef(false);

  const connect = useCallback(() => {
    if (!user || wsRef.current?.readyState === WebSocket.OPEN || isConnectingRef.current)
      return;

    isConnectingRef.current = true;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    console.log("Attempting WebSocket connection to:", wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected, authenticating...");
      ws.send(JSON.stringify({ type: "auth", userId: user.id }));
      reconnectAttemptsRef.current = 0;
      isConnectingRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("WebSocket received message:", message);

        if (message.type === "auth_success") {
          console.log("WebSocket authentication successful");
          return;
        }

        // Process all handlers (both persistent and temporary)
        const allHandlers = [...persistentHandlersRef.current, ...temporaryHandlersRef.current];

        allHandlers.forEach(({ handler, scope, isPersistent }) => {
          try {
            // Channel messages should be handled by channel handlers
            if (message.type === "message" && scope.startsWith("channel-")) {
              console.log(`Processing channel message with handler (scope: ${scope}, isPersistent: ${isPersistent})`);
              handler(message);
            }
            // Thread messages should only be handled by thread handlers
            else if (message.type === "thread_message" && scope.startsWith("thread-")) {
              console.log(`Processing thread message with handler (scope: ${scope}, isPersistent: ${isPersistent})`);
              handler(message);
            }
          } catch (error) {
            console.error(`Handler error for scope ${scope}:`, error);
          }
        });

      } catch (error) {
        console.error("WebSocket message parsing error:", error);
      }
    };

    ws.onclose = (event) => {
      console.log("WebSocket disconnected, event:", event);
      wsRef.current = null;
      isConnectingRef.current = false;

      // Only attempt reconnection if:
      // 1. User is authenticated
      // 2. Tab is visible
      // 3. Haven't exceeded max attempts
      if (
        user &&
        document.visibilityState === "visible" &&
        reconnectAttemptsRef.current < maxReconnectAttempts
      ) {
        const timeout = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current),
          10000,
        );
        reconnectAttemptsRef.current++;

        console.log(
          `Attempting to reconnect in ${timeout}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`,
        );

        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(connect, timeout);
      } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        toast({
          title: "Connection Error",
          description:
            "Unable to connect to chat server after multiple attempts. Please refresh the page.",
          variant: "destructive",
        });
      }
    };

    ws.onerror = (error) => {
      console.log("WebSocket error occurred:", error);
      // Don't close here, let onclose handle reconnection
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };

    wsRef.current = ws;
  }, [user, toast]);

  // Set up WebSocket connection and visibility handling
  useEffect(() => {
    connect();

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        user &&
        (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
      ) {
        console.log("Page became visible, attempting to reconnect WebSocket");
        reconnectAttemptsRef.current = 0; // Reset attempt counter
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [user, connect]);

  const sendMessage = useCallback(
    (message: WebSocketMessage) => {
      const trySendMessage = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log("Sending WebSocket message:", message);
          wsRef.current.send(JSON.stringify(message));
          return true;
        }
        return false;
      };

      // Try to send immediately
      if (!trySendMessage()) {
        console.log("WebSocket not ready, attempting reconnection");
        connect();
        // Retry once after a short delay
        setTimeout(() => {
          if (!trySendMessage()) {
            console.error("Failed to send WebSocket message after retry");
            toast({
              title: "Connection Error",
              description: "Unable to send message. Please try again.",
              variant: "destructive",
            });
          }
        }, 1000);
      }
    },
    [toast, connect],
  );

  const addMessageHandler = useCallback(
    (handler: (message: WebSocketMessage) => void, scope: string = "global") => {
      const handlerId = Math.random().toString(36).substring(7);
      const isPersistent = scope.startsWith("channel-");

      console.log(
        `Adding message handler (${handlerId}) for scope: ${scope}, isPersistent: ${isPersistent}`,
      );

      const newHandler = {
        id: handlerId,
        scope,
        handler,
        isPersistent,
      };

      if (isPersistent) {
        // For channel handlers, keep them in persistent array
        persistentHandlersRef.current = [
          ...persistentHandlersRef.current.filter(h => h.scope !== scope),
          newHandler
        ];
      } else {
        // For temporary handlers like threads, replace existing ones with same scope
        temporaryHandlersRef.current = [
          ...temporaryHandlersRef.current.filter(h => h.scope !== scope),
          newHandler
        ];
      }

      // Log current handlers for debugging
      console.log("Current handlers:", {
        persistent: persistentHandlersRef.current.map((h) => ({
          id: h.id,
          scope: h.scope,
        })),
        temporary: temporaryHandlersRef.current.map((h) => ({
          id: h.id,
          scope: h.scope,
        })),
      });

      // Return cleanup function
      return () => {
        if (!isPersistent) {
          console.log(`Removing temporary handler (${handlerId}) for scope: ${scope}`);
          temporaryHandlersRef.current = temporaryHandlersRef.current.filter(
            (h) => h.id !== handlerId
          );
        } else {
          console.log(
            `Keeping persistent channel handler (${handlerId}) active`,
          );
        }

        // Log remaining handlers after cleanup
        console.log("Remaining handlers after cleanup:", {
          persistent: persistentHandlersRef.current.map((h) => ({
            id: h.id,
            scope: h.scope,
          })),
          temporary: temporaryHandlersRef.current.map((h) => ({
            id: h.id,
            scope: h.scope,
          })),
        });
      };
    },
    [],
  );

  return {
    sendMessage,
    addMessageHandler,
  };
}