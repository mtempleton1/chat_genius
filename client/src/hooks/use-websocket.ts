import { useEffect, useRef, useCallback } from "react";
import { useUser } from "./use-user";
import { useToast } from "./use-toast";

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

export function useWebSocket() {
  const { user } = useUser();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const messageHandlersRef = useRef<((message: WebSocketMessage) => void)[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (!user || wsRef.current?.readyState === WebSocket.OPEN) return;

    // Use relative URL path to support both development and production
    const ws = new WebSocket(`${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`);

    ws.onopen = () => {
      console.log("WebSocket connected");
      ws.send(JSON.stringify({ type: "auth", userId: user.id }));
      // Clear reconnect timeout if connection successful
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        messageHandlersRef.current.forEach((handler) => handler(message));
      } catch (error) {
        console.error("WebSocket message parsing error:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      // Only attempt to reconnect if we still have a user and the page is visible
      if (user && document.visibilityState === "visible") {
        // Exponential backoff for reconnection attempts
        reconnectTimeoutRef.current = setTimeout(() => {
          wsRef.current = null;
          connect();
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      toast({
        title: "Connection Error",
        description: "Lost connection to chat server. Attempting to reconnect...",
        variant: "destructive",
      });
    };

    wsRef.current = ws;
  }, [user, toast]);

  useEffect(() => {
    connect();

    // Handle visibility changes to reconnect when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && user && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
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
        wsRef.current.close();
      }
    };
  }, [user, connect]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      toast({
        title: "Connection Error",
        description: "Unable to send message. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const addMessageHandler = useCallback((handler: (message: WebSocketMessage) => void) => {
    messageHandlersRef.current.push(handler);
    return () => {
      messageHandlersRef.current = messageHandlersRef.current.filter(
        (h) => h !== handler
      );
    };
  }, []);

  return {
    sendMessage,
    addMessageHandler,
  };
}