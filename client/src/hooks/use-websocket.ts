import { useEffect, useRef } from "react";
import { useUser } from "./use-user";

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

export function useWebSocket() {
  const { user } = useUser();
  const wsRef = useRef<WebSocket | null>(null);
  const messageHandlersRef = useRef<((message: WebSocketMessage) => void)[]>([]);

  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", userId: user.id }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      messageHandlersRef.current.forEach((handler) => handler(message));
    };

    ws.onclose = () => {
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (document.visibilityState === "visible") {
          wsRef.current = null;
        }
      }, 3000);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [user]);

  const sendMessage = (message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const addMessageHandler = (handler: (message: WebSocketMessage) => void) => {
    messageHandlersRef.current.push(handler);
    return () => {
      messageHandlersRef.current = messageHandlersRef.current.filter(
        (h) => h !== handler
      );
    };
  };

  return {
    sendMessage,
    addMessageHandler,
  };
}
