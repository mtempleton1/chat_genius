import { Server as HttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { db } from "@db";
import { users, channelMembers } from "@db/schema";
import { eq } from "drizzle-orm";

interface Client extends WebSocket {
  userId?: number;
  channels?: Set<number>;
}

export function setupWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Map<number, Client>();

  wss.on("connection", (ws: Client) => {
    ws.channels = new Set();

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

            // Get user's channels
            const userChannels = await db
              .select({ channelId: channelMembers.channelId })
              .from(channelMembers)
              .where(eq(channelMembers.userId, data.userId));

            userChannels.forEach(({ channelId }) => {
              ws.channels?.add(channelId);
            });

            broadcastUserStatus(data.userId, "online");
            break;

          case "message":
            if (!ws.userId || !data.channelId) break;

            // Broadcast to channel members
            broadcastToChannel(data.channelId, {
              type: "message",
              channelId: data.channelId,
              content: data.content,
              userId: ws.userId
            });
            break;

          case "typing":
            if (!ws.userId || !data.channelId) break;

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

    // Ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on("close", () => {
      clearInterval(pingInterval);
    });
  });

  async function broadcastToChannel(channelId: number, message: any) {
    const channelMemberIds = await db
      .select({ userId: channelMembers.userId })
      .from(channelMembers)
      .where(eq(channelMembers.channelId, channelId));

    const data = JSON.stringify(message);

    channelMemberIds.forEach(({ userId }) => {
      const client = clients.get(userId);
      if (client?.readyState === WebSocket.OPEN) {
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