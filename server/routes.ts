import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import {
  channels,
  messages,
  reactions,
  channelMembers,
  organizations,
  workspaces,
  workspaceMembers,
  users,
  directMessages,
} from "@db/schema";
import { eq, and, asc, or, desc, isNull } from "drizzle-orm";
import multer from "multer";
import type { InferModel } from "drizzle-orm";

// Define some type helpers for our database models
type User = InferModel<typeof users>;
type Workspace = InferModel<typeof workspaces>;
type WorkspaceMember = InferModel<typeof workspaceMembers>;
type Message = InferModel<typeof messages>;
type Channel = InferModel<typeof channels>;
type DirectMessage = InferModel<typeof directMessages>;

// Keep existing multer configuration
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
  // Create HTTP server first
  const httpServer = createServer(app);

  // Setup WebSocket after creating HTTP server but before registering routes
  setupWebSocket(httpServer);

  // Middleware to ensure Content-Type is set for API responses
  app.use('/api', (req, res, next) => {
    res.type('application/json');
    next();
  });

  app.get("/api/user/workspaces", async (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    try {
      const userWorkspaces = await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          organizationId: workspaces.organizationId,
          createdAt: workspaces.createdAt,
          organization: organizations,
          role: workspaceMembers.role,
        })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, user.id))
        .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
        .leftJoin(organizations, eq(workspaces.organizationId, organizations.id));

      res.json(userWorkspaces);
    } catch (error) {
      console.error("Error fetching user workspaces:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces/:workspaceId", async (req, res) => {
    const workspaceId = parseInt(req.params.workspaceId);
    if (isNaN(workspaceId)) {
      return res.status(400).json({ error: "Invalid workspace ID" });
    }

    try {
      const [workspaceResult] = await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          organizationId: workspaces.organizationId,
          createdAt: workspaces.createdAt,
          organization: organizations,
        })
        .from(workspaces)
        .leftJoin(organizations, eq(workspaces.organizationId, organizations.id))
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!workspaceResult) {
        return res.status(404).json({ error: "Workspace not found" });
      }

      // If user is authenticated, check membership
      if (req.user) {
        const user = req.user;
        const [member] = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.userId, user.id),
            ),
          )
          .limit(1);

        if (member) {
          // Return full workspace data for members
          return res.json({
            ...workspaceResult,
            membership: member,
          });
        }
      }

      // For non-members or non-authenticated users, return basic info
      const publicWorkspaceData = {
        id: workspaceResult.id,
        name: workspaceResult.name,
        organizationId: workspaceResult.organizationId,
        createdAt: workspaceResult.createdAt,
        organization: workspaceResult.organization
          ? {
              id: workspaceResult.organization.id,
              name: workspaceResult.organization.name,
              domain: workspaceResult.organization.domain,
            }
          : null,
      };

      return res.json(publicWorkspaceData);
    } catch (error) {
      console.error("Error fetching workspace:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces/:workspaceId/channels", async (req, res) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "Not authenticated" });

      const workspaceId = parseInt(req.params.workspaceId);
      if (isNaN(workspaceId)) {
        return res.status(400).json({ error: "Invalid workspace ID" });
      }

      // Check workspace membership
      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, user.id),
          ),
        )
        .limit(1);

      if (!member) {
        return res.status(403).json({ error: "Not a member of this workspace" });
      }

      const workspaceChannels = await db
        .select()
        .from(channels)
        .where(eq(channels.workspaceId, workspaceId));

      res.json(workspaceChannels);
    } catch (error) {
      console.error("Error fetching workspace channels:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces/:workspaceId/users", async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const workspaceId = parseInt(req.params.workspaceId);
      if (isNaN(workspaceId)) {
        return res.status(400).json({ error: "Invalid workspace ID" });
      }

      // Check workspace membership using proper typing
      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, user.id),
          ),
        )
        .limit(1);

      if (!member) {
        return res.status(403).json({ error: "Not a member of this workspace" });
      }

      // Get all workspace users with proper typing
      const workspaceUsers = await db
        .select({
          id: users.id,
          username: users.username,
        })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId))
        .innerJoin(users, eq(workspaceMembers.userId, users.id));

      res.json(workspaceUsers);
    } catch (error) {
      console.error("Error fetching workspace users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/workspaces/:workspaceId/channels", async (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const workspaceId = parseInt(req.params.workspaceId);
    if (isNaN(workspaceId)) {
      return res.status(400).json({ error: "Invalid workspace ID" });
    }

    const { name, isPrivate } = req.body;

    // Check workspace membership
    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id),
        ),
      )
      .limit(1);

    if (!member) {
      return res.status(403).json({ error: "Not a member of this workspace" });
    }

    const [channel] = await db
      .insert(channels)
      .values({
        name,
        workspaceId,
        isPrivate: isPrivate || false,
        joinByDefault: true,
        createdById: user.id,
      })
      .returning();

    // Get all workspace members
    const members = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));

    // Add all workspace members to the channel
    if (members.length > 0) {
      await db.insert(channelMembers).values(
        members.map((member) => ({
          channelId: channel.id,
          userId: member.userId,
        })),
      );
    }

    res.json(channel);
  });

  app.get("/api/channels/:channelId/messages", async (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const channelId = parseInt(req.params.channelId);
    if (isNaN(channelId)) {
      return res.status(400).json({ error: "Invalid channel ID" });
    }

    try {
      // Get channel and verify workspace membership
      const [channel] = await db
        .select({
          id: channels.id,
          name: channels.name,
          workspaceId: channels.workspaceId,
          workspace: workspaces,
        })
        .from(channels)
        .leftJoin(workspaces, eq(channels.workspaceId, workspaces.id))
        .where(eq(channels.id, channelId))
        .limit(1);

      if (!channel || !channel.workspace) {
        return res.status(404).json({ error: "Channel not found" });
      }

      // Verify workspace membership
      const [workspaceMember] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, channel.workspaceId),
            eq(workspaceMembers.userId, user.id),
          ),
        )
        .limit(1);

      if (!workspaceMember) {
        return res.status(403).json({ error: "Not a member of this workspace" });
      }

      // Get only root messages (not thread replies)
      const channelMessages = await db
        .select()
        .from(messages)
        .where(
          and(eq(messages.channelId, channelId), isNull(messages.parentId)),
        )
        .orderBy(desc(messages.createdAt))
        .limit(50);

      const messagesWithDetails = await Promise.all(
        channelMessages.map(async (message) => {
          const messageReactions = await db
            .select({
              reaction: reactions,
              user: users,
            })
            .from(reactions)
            .leftJoin(users, eq(reactions.userId, users.id))
            .where(eq(reactions.messageId, message.id));

          const [messageUser] = await db
            .select()
            .from(users)
            .where(eq(users.id, message.userId!))
            .limit(1);

          return {
            ...message,
            reactions: messageReactions,
            user: messageUser,
          };
        }),
      );

      res.json(messagesWithDetails);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/messages/:messageId/thread", async (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const messageId = parseInt(req.params.messageId);
    if (isNaN(messageId)) {
      return res.status(400).json({ error: "Invalid message ID" });
    }

    try {
      // First get the parent message and its channel with proper typing
      const [message] = await db
        .select({
          message: messages,
          channel: channels,
          workspace: workspaces,
        })
        .from(messages)
        .leftJoin(channels, eq(messages.channelId, channels.id))
        .leftJoin(workspaces, eq(channels.workspaceId, workspaces.id))
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message || !message.workspace) {
        return res.status(404).json({ error: "Message or workspace not found" });
      }

      // Verify workspace membership with proper typing
      const [workspaceMember] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, message.workspace.id),
            eq(workspaceMembers.userId, user.id),
          ),
        )
        .limit(1);

      if (!workspaceMember) {
        return res.status(403).json({ error: "Not a member of this workspace" });
      }

      // Get the thread messages
      const threadMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.parentId, messageId))
        .orderBy(asc(messages.createdAt));

      res.json(threadMessages);
    } catch (error) {
      console.error("Error fetching thread:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add file upload endpoint
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, name: req.file.originalname });
  });

  // Add endpoint to update user's current workspace
  app.post("/api/user/workspace", async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    const workspaceId = req.body.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID is required" });
    }

    try {
      // Verify workspace membership
      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.userId, req.user.id),
            eq(workspaceMembers.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!member) {
        return res.status(403).json({ error: "Not a member of this workspace" });
      }

      // Update the session with new workspace ID after null check
      req.user.workspaceId = workspaceId;

      return res.json({
        message: "Workspace updated successfully",
        user: {
          id: req.user.id,
          username: req.user.username,
          workspaceId
        }
      });
    } catch (error) {
      console.error("Error updating workspace:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add new direct message endpoints
  app.get("/api/workspaces/:workspaceId/direct-messages/:userId", async (req, res) => {
    const user = req.user as User | undefined;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const workspaceId = parseInt(req.params.workspaceId);
    const otherUserId = parseInt(req.params.userId);
    const { parentId } = req.query;

    if (isNaN(workspaceId) || isNaN(otherUserId)) {
      return res.status(400).json({ error: "Invalid workspace or user ID" });
    }

    try {
      // Verify workspace membership for both users
      const [currentUserMember, otherUserMember] = await Promise.all([
        db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.userId, user.id),
            ),
          )
          .limit(1),
        db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.userId, otherUserId),
            ),
          )
          .limit(1),
      ]);

      if (!currentUserMember[0] || !otherUserMember[0]) {
        return res.status(403).json({ error: "One or both users are not members of this workspace" });
      }

      // Get or create direct message conversation
      let conversation = await db
        .select()
        .from(directMessages)
        .where(
          and(
            eq(directMessages.workspaceId, workspaceId),
            or(
              and(
                eq(directMessages.user1Id, user.id),
                eq(directMessages.user2Id, otherUserId),
              ),
              and(
                eq(directMessages.user1Id, otherUserId),
                eq(directMessages.user2Id, user.id),
              ),
            ),
          ),
        )
        .limit(1)
        .then(rows => rows[0]);

      if (!conversation) {
        // Create new direct message conversation
        const inserted = await db
          .insert(directMessages)
          .values({
            workspaceId,
            user1Id: user.id,
            user2Id: otherUserId,
          })
          .returning();
        conversation = inserted[0];
      }

      // Get messages for this direct message conversation
      const messageResults = await db
        .select({
          message: messages,
          user: users,
        })
        .from(messages)
        .where(
          and(
            eq(messages.directMessageId, conversation.id),
            parentId
              ? eq(messages.parentId, parseInt(parentId as string))
              : isNull(messages.parentId),
          ),
        )
        .leftJoin(users, eq(messages.userId, users.id))
        .orderBy(asc(messages.createdAt));

      res.json(messageResults);
    } catch (error) {
      console.error("Error fetching direct messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/workspaces/:workspaceId/direct-messages/:userId", async (req, res) => {
    const user = req.user as User | undefined;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const workspaceId = parseInt(req.params.workspaceId);
    const otherUserId = parseInt(req.params.userId);
    const { content, parentId } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Message content is required" });
    }

    if (isNaN(workspaceId) || isNaN(otherUserId)) {
      return res.status(400).json({ error: "Invalid workspace or user ID" });
    }

    try {
      // Verify workspace membership for both users
      const [currentUserMember, otherUserMember] = await Promise.all([
        db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.userId, user.id),
            ),
          )
          .limit(1),
        db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.userId, otherUserId),
            ),
          )
          .limit(1),
      ]);

      if (!currentUserMember[0] || !otherUserMember[0]) {
        return res.status(403).json({ error: "One or both users are not members of this workspace" });
      }

      // Get or create direct message conversation
      let conversation = await db
        .select()
        .from(directMessages)
        .where(
          and(
            eq(directMessages.workspaceId, workspaceId),
            or(
              and(
                eq(directMessages.user1Id, user.id),
                eq(directMessages.user2Id, otherUserId),
              ),
              and(
                eq(directMessages.user1Id, otherUserId),
                eq(directMessages.user2Id, user.id),
              ),
            ),
          ),
        )
        .limit(1)
        .then(rows => rows[0]);

      if (!conversation) {
        // Create new direct message conversation
        const inserted = await db
          .insert(directMessages)
          .values({
            workspaceId,
            user1Id: user.id,
            user2Id: otherUserId,
          })
          .returning();
        conversation = inserted[0];
      }

      // Create the message
      const [newMessage] = await db
        .insert(messages)
        .values({
          content,
          userId: user.id,
          directMessageId: conversation.id,
          parentId: parentId ? parseInt(parentId) : null,
        })
        .returning();

      // Fetch the created message with user details
      const [messageWithUser] = await db
        .select({
          message: messages,
          user: users,
        })
        .from(messages)
        .where(eq(messages.id, newMessage.id))
        .leftJoin(users, eq(messages.userId, users.id))
        .limit(1);

      res.json(messageWithUser);
    } catch (error) {
      console.error("Error creating direct message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}