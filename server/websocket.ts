import { Server as HttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { db } from "@db";
import { users, channelMembers } from "@db/schema";
import { eq } from "drizzle-orm";

interface Client extends WebSocket {
  userId?: number;
  channels?: Set<number>;
  isAlive?: boolean;
}

export function setupWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({
    noServer: true,
    clientTracking: true,
  });

  let isInitialized = false;

  // Handle upgrade events
  server.on("upgrade", (request, socket, head) => {
    try {
      // Skip handling Vite HMR requests
      if (request.headers["sec-websocket-protocol"] === "vite-hmr") {
        socket.destroy();
        return;
      }

      if (!isInitialized) {
        console.log("WebSocket server not yet initialized");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch (error) {
      console.error("WebSocket upgrade error:", error);
      socket.destroy();
    }
  });

  const clients = new Map<number, Client>();

  function heartbeat(this: Client) {
    this.isAlive = true;
  }

  wss.on("connection", (ws: Client) => {
    console.log("New WebSocket connection established");
    ws.isAlive = true;
    ws.channels = new Set();
    ws.on("pong", heartbeat);

    ws.on("message", async (message: string) => {
      try {
        const data = JSON.parse(message);
        console.log("WebSocket received message:", data);

        switch (data.type) {
          case "auth":
            ws.userId = data.userId;
            clients.set(data.userId, ws);
            console.log(`User ${data.userId} authenticated via WebSocket`);

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

            // Send confirmation back to client
            ws.send(
              JSON.stringify({
                type: "auth_success",
                userId: data.userId,
              })
            );

            broadcastUserStatus(data.userId, "online");
            break;

          case "message":
          case "thread_message":
            if (!ws.userId || !data.channelId) break;
            console.log(`Broadcasting ${data.type}:`, data);

            // Broadcast the message to all clients in the channel
            broadcastToChannel(data.channelId, data);

            // Send confirmation back to sender
            ws.send(
              JSON.stringify({
                type: "message_sent",
                channelId: data.channelId,
                messageId: data.messageId || data.newMessage?.id,
                parentId: data.parentId,
              })
            );
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
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Failed to process message",
          })
        );
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

    ws.on("error", (error) => {
      console.error("WebSocket client error:", error);
    });
  });

  // Heartbeat interval
  const interval = setInterval(() => {
    wss.clients.forEach((ws: Client) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  async function broadcastToChannel(channelId: number, message: any) {
    try {
      const channelMemberIds = await db
        .select({ userId: channelMembers.userId })
        .from(channelMembers)
        .where(eq(channelMembers.channelId, channelId));

      const data = JSON.stringify(message);

      for (const { userId } of channelMemberIds) {
        const client = clients.get(userId);
        if (client?.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      }
    } catch (error) {
      console.error("Error broadcasting to channel:", error);
    }
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

  // Mark WebSocket server as initialized
  isInitialized = true;
  console.log("WebSocket server initialized successfully");
}