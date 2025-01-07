import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { channels, messages, reactions, channelMembers } from "@db/schema";
import { eq, and, asc, or, desc } from "drizzle-orm";
import multer from "multer";

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  const httpServer = createServer(app);
  setupWebSocket(httpServer);

  // Channel routes
  app.get("/api/channels", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const userChannels = await db.query.channels.findMany({
      with: {
        members: true,
      },
      where: (channels, { eq }) => eq(channels.isPrivate, false),
    });

    res.json(userChannels);
  });

  app.post("/api/channels", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { name, isPrivate } = req.body;
    const [channel] = await db
      .insert(channels)
      .values({
        name,
        isPrivate,
        createdById: req.user.id,
      })
      .returning();

    // Add creator as a member
    await db.insert(channelMembers).values({
      channelId: channel.id,
      userId: req.user.id,
    });

    res.json(channel);
  });

  // Message routes
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const channelMessages = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.channelId, parseInt(req.params.channelId)),
          eq(messages.parentId, null) // Only get top-level messages
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(50);

    // Get user and reaction info for each message
    const enrichedMessages = await Promise.all(
      channelMessages.map(async (message) => {
        const [enriched] = await db.query.messages.findMany({
          where: eq(messages.id, message.id),
          with: {
            user: true,
            reactions: {
              with: {
                user: true,
              },
            },
          },
          limit: 1,
        });
        return enriched;
      })
    );

    res.json(enrichedMessages);
  });

  app.get("/api/messages/:messageId/thread", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const messageId = parseInt(req.params.messageId);
    const threadMessages = await db
      .select()
      .from(messages)
      .where(
        or(
          eq(messages.id, messageId),
          eq(messages.parentId, messageId)
        )
      )
      .orderBy(asc(messages.createdAt));

    // Get user and reaction info for each message
    const enrichedMessages = await Promise.all(
      threadMessages.map(async (message) => {
        const [enriched] = await db.query.messages.findMany({
          where: eq(messages.id, message.id),
          with: {
            user: true,
            reactions: {
              with: {
                user: true,
              },
            },
          },
          limit: 1,
        });
        return enriched;
      })
    );

    res.json(enrichedMessages);
  });

  app.post("/api/messages", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { content, channelId, parentId } = req.body;
    const [message] = await db
      .insert(messages)
      .values({
        content,
        channelId,
        parentId: parentId || null,
        userId: req.user.id,
      })
      .returning();

    // Fetch complete message with user data
    const [completeMessage] = await db.query.messages.findMany({
      where: eq(messages.id, message.id),
      with: {
        user: true,
        reactions: {
          with: {
            user: true,
          },
        },
      },
      limit: 1,
    });

    res.json(completeMessage);
  });

  // File upload
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");
    if (!req.file) return res.status(400).send("No file uploaded");

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, name: req.file.originalname });
  });

  // Reactions
  app.post("/api/messages/:messageId/reactions", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { emoji } = req.body;
    const [reaction] = await db
      .insert(reactions)
      .values({
        emoji,
        messageId: parseInt(req.params.messageId),
        userId: req.user.id,
      })
      .returning();

    const [completeReaction] = await db.query.reactions.findMany({
      where: eq(reactions.id, reaction.id),
      with: {
        user: true,
      },
      limit: 1,
    });

    res.json(completeReaction);
  });

  app.delete("/api/messages/:messageId/reactions/:reactionId", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    await db
      .delete(reactions)
      .where(
        and(
          eq(reactions.id, parseInt(req.params.reactionId)),
          eq(reactions.userId, req.user.id)
        )
      );

    res.status(204).send();
  });

  return httpServer;
}