import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { channels, messages, reactions, channelMembers, organizations, workspaces, workspaceMembers } from "@db/schema";
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

  // Organization and Workspace routes
  app.post("/api/organizations", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const { name, domain } = req.body;
    const [organization] = await db
      .insert(organizations)
      .values({ name, domain })
      .returning();

    // Create default workspace
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "General", organizationId: organization.id })
      .returning();

    // Add creator as workspace member with owner role
    await db
      .insert(workspaceMembers)
      .values({
        userId: user.id,
        workspaceId: workspace.id,
        role: "owner",
      });

    res.json({ organization, workspace });
  });

  app.post("/api/workspaces", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const { name, organizationId } = req.body;
    const [workspace] = await db
      .insert(workspaces)
      .values({ name, organizationId })
      .returning();

    // Add creator as workspace member with owner role
    await db
      .insert(workspaceMembers)
      .values({
        userId: user.id,
        workspaceId: workspace.id,
        role: "owner",
      });

    res.json(workspace);
  });

  app.get("/api/workspaces/:workspaceId", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, parseInt(req.params.workspaceId)),
      with: {
        organization: true,
      },
    });

    if (!workspace) {
      return res.status(404).send("Workspace not found");
    }

    // Check if user is a member of this workspace
    const member = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, user.id)
      ),
    });

    if (!member) {
      return res.status(403).send("Not a member of this workspace");
    }

    res.json(workspace);
  });

  // Channel routes - updated to work with workspaces
  app.get("/api/workspaces/:workspaceId/channels", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const workspaceId = parseInt(req.params.workspaceId);

    // Check workspace membership
    const member = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id)
      ),
    });

    if (!member) {
      return res.status(403).send("Not a member of this workspace");
    }

    const workspaceChannels = await db.query.channels.findMany({
      where: and(
        eq(channels.workspaceId, workspaceId),
        eq(channels.isPrivate, false)
      ),
      with: {
        members: true,
      },
    });

    res.json(workspaceChannels);
  });

  app.post("/api/workspaces/:workspaceId/channels", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const workspaceId = parseInt(req.params.workspaceId);
    const { name, isPrivate } = req.body;

    // Check workspace membership
    const member = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id)
      ),
    });

    if (!member) {
      return res.status(403).send("Not a member of this workspace");
    }

    const [channel] = await db
      .insert(channels)
      .values({
        name,
        workspaceId,
        isPrivate: isPrivate || false,
        createdById: user.id,
      })
      .returning();

    // Add creator as a channel member
    await db.insert(channelMembers).values({
      channelId: channel.id,
      userId: user.id,
    });

    res.json(channel);
  });

  // Message routes - keep existing implementation but add workspace membership check
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const channelId = parseInt(req.params.channelId);

    // Get channel and verify workspace membership
    const channel = await db.query.channels.findFirst({
      where: eq(channels.id, channelId),
      with: {
        workspace: true,
      },
    });

    if (!channel) {
      return res.status(404).send("Channel not found");
    }

    const member = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, channel.workspace.id),
        eq(workspaceMembers.userId, user.id)
      ),
    });

    if (!member) {
      return res.status(403).send("Not a member of this workspace");
    }

    const channelMessages = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.channelId, channelId),
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
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

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
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const { content, channelId, parentId } = req.body;
    const [message] = await db
      .insert(messages)
      .values({
        content,
        channelId,
        parentId: parentId || null,
        userId: user.id,
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
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");
    if (!req.file) return res.status(400).send("No file uploaded");

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, name: req.file.originalname });
  });

  // Reactions
  app.post("/api/messages/:messageId/reactions", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const { emoji } = req.body;
    const [reaction] = await db
      .insert(reactions)
      .values({
        emoji,
        messageId: parseInt(req.params.messageId),
        userId: user.id,
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
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    await db
      .delete(reactions)
      .where(
        and(
          eq(reactions.id, parseInt(req.params.reactionId)),
          eq(reactions.userId, user.id)
        )
      );

    res.status(204).send();
  });

  return httpServer;
}