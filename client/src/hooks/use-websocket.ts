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
};

export function useWebSocket() {
  const { user } = useUser();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const messageHandlersRef = useRef<MessageHandler[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const isConnectingRef = useRef(false);

  const connect = useCallback(() => {
    if (
      !user ||
      wsRef.current?.readyState === WebSocket.OPEN ||
      isConnectingRef.current
    )
      return;

    isConnectingRef.current = true;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    console.log("Attempting WebSocket connection to:", wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
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

        // Process all handlers for every message, let them decide if they should handle it
        messageHandlersRef.current.forEach(({ handler, scope }) => {
          try {
            console.log(`Calling handler for scope: ${scope}`);
            handler(message);
          } catch (handlerError) {
            console.error(`Handler error for scope ${scope}:`, handlerError);
          }
        });
      } catch (error) {
        console.error("WebSocket message parsing error:", error);
      }
    };

    ws.onclose = (event) => {
      console.log("WebSocket disconnected", event);
      wsRef.current = null;
      isConnectingRef.current = false;

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
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, timeout);
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
      console.error("WebSocket error:", error);
      isConnectingRef.current = false;
    };

    wsRef.current = ws;
  }, [user, toast]);

  useEffect(() => {
    connect();

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        user &&
        (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
      ) {
        console.log("Page became visible, attempting to reconnect WebSocket");
        reconnectAttemptsRef.current = 0;
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        console.log("Cleaning up WebSocket connection");
        wsRef.current.close();
      }
    };
  }, [user, connect]);

  const sendMessage = useCallback(
    (message: WebSocketMessage) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log("Sending WebSocket message:", message);
        wsRef.current.send(JSON.stringify(message));
      } else {
        console.log("WebSocket not ready, attempting reconnection");
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          connect();
        }
        // Wait for connection and retry sending
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log("Retrying WebSocket message:", message);
            wsRef.current.send(JSON.stringify(message));
          } else {
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
    (
      handler: (message: WebSocketMessage) => void,
      scope: string = "global",
    ) => {
      const handlerId = Math.random().toString(36).substring(7);
      console.log(
        `Adding new WebSocket message handler (${handlerId}) for scope: ${scope}`,
      );

      // Check for existing handlers with the same scope
      const existingHandlerIndex = messageHandlersRef.current.findIndex(
        (h) => h.scope === scope
      );

      // Update or add the handler
      const newHandler = {
        id: handlerId,
        scope,
        handler,
      };

      if (existingHandlerIndex !== -1) {
        // Update existing handler
        messageHandlersRef.current[existingHandlerIndex] = newHandler;
      } else {
        // Add new handler
        messageHandlersRef.current.push(newHandler);
      }

      // Log current handlers for debugging
      console.log(
        "Current handlers:",
        messageHandlersRef.current.map((h) => ({
          id: h.id,
          scope: h.scope,
        })),
      );

      // Return cleanup function that only removes this specific handler
      return () => {
        console.log(
          `Removing WebSocket message handler (${handlerId}) from scope: ${scope}`,
        );
        messageHandlersRef.current = messageHandlersRef.current.filter(
          (h) => h.id !== handlerId
        );

        // Log remaining handlers
        console.log(
          "Remaining handlers:",
          messageHandlersRef.current.map((h) => ({
            id: h.id,
            scope: h.scope,
          })),
        );
      };
    },
    [],
  );

  return {
    sendMessage,
    addMessageHandler,
  };
}