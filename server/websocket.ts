import { Server as HttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { db } from "@db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";

interface Client extends WebSocket {
  userId?: number;
}

export function setupWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  const clients = new Map<number, Client>();

  wss.on("connection", (ws: Client) => {
    ws.on("message", async (message: string) => {
      try {
        const data = JSON.parse(message);
        
        switch (data.type) {
          case "auth":
            ws.userId = data.userId;
            clients.set(data.userId, ws);
            
            // Update user status
            await db
              .update(users)
              .set({ status: "online", lastSeen: new Date() })
              .where(eq(users.id, data.userId));
            
            broadcastUserStatus(data.userId, "online");
            break;
            
          case "message":
            broadcastToChannel(data.channelId, {
              type: "message",
              message: data.message,
            });
            break;
            
          case "typing":
            broadcastToChannel(data.channelId, {
              type: "typing",
              userId: ws.userId,
              channelId: data.channelId,
            });
            break;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", async () => {
      if (ws.userId) {
        clients.delete(ws.userId);
        
        // Update user status
        await db
          .update(users)
          .set({ status: "offline", lastSeen: new Date() })
          .where(eq(users.id, ws.userId));
        
        broadcastUserStatus(ws.userId, "offline");
      }
    });
  });

  function broadcastToChannel(channelId: number, message: any) {
    const data = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  function broadcastUserStatus(userId: number, status: string) {
    const message = JSON.stringify({
      type: "userStatus",
      userId,
      status,
    });
    
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}
