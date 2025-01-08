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
import { eq, and, asc, desc, isNull, or, sql } from "drizzle-orm";
import multer from "multer";
import type { InferModel } from "drizzle-orm";

// Define some type helpers for our database models
type User = InferModel<typeof users>;
type Message = InferModel<typeof messages>;

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
  const httpServer = createServer(app);
  setupWebSocket(httpServer);

  // Middleware to ensure Content-Type is set for API responses
  app.use("/api", (req, res, next) => {
    res.type("application/json");
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
        .leftJoin(
          organizations,
          eq(workspaces.organizationId, organizations.id),
        );

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
        .leftJoin(
          organizations,
          eq(workspaces.organizationId, organizations.id),
        )
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
        return res
          .status(403)
          .json({ error: "Not a member of this workspace" });
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
        return res
          .status(403)
          .json({ error: "Not a member of this workspace" });
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
          workspaceId: channels.workspaceId,
        })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (!channel) {
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
        return res
          .status(403)
          .json({ error: "Not a member of this workspace" });
      }

      // Get only root messages (not thread replies) with their users
      const channelMessages = await db
        .select({
          message: messages,
          user: users,
        })
        .from(messages)
        .where(
          and(eq(messages.channelId, channelId), isNull(messages.parentId)),
        )
        .leftJoin(users, eq(messages.userId, users.id))
        .orderBy(desc(messages.createdAt))
        .limit(50);

      // Get reply counts and reactions for each message
      const messagesWithDetails = await Promise.all(
        channelMessages.map(async ({ message, user }) => {
          // Get reply count for this message
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(messages)
            .where(eq(messages.parentId, message.id));

          return {
            message: {
              ...message,
              replyCount: count,
            },
            user,
          };
        }),
      );

      res.json(messagesWithDetails);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const { content, channelId, parentId, directMessageId } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Message content is required" });
    }

    if (!channelId && !directMessageId) {
      return res
        .status(400)
        .json({ error: "Either channelId or directMessageId is required" });
    }

    try {
      let workspaceId: number;

      if (channelId) {
        // Verify channel membership through workspace
        const [channel] = await db
          .select({
            id: channels.id,
            workspaceId: channels.workspaceId,
          })
          .from(channels)
          .where(eq(channels.id, channelId))
          .limit(1);

        if (!channel) {
          return res.status(404).json({ error: "Channel not found" });
        }

        workspaceId = channel.workspaceId;
      } else if (directMessageId) {
        // Verify direct message membership through workspace
        const [dm] = await db
          .select({
            id: directMessages.id,
            workspaceId: directMessages.workspaceId,
          })
          .from(directMessages)
          .where(eq(directMessages.id, directMessageId))
          .limit(1);

        if (!dm) {
          return res
            .status(404)
            .json({ error: "Direct message conversation not found" });
        }

        workspaceId = dm.workspaceId;
      } else {
        return res.status(400).json({ error: "Invalid request" });
      }

      // Verify workspace membership
      const [workspaceMember] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, user.id),
          ),
        )
        .limit(1);

      if (!workspaceMember) {
        return res
          .status(403)
          .json({ error: "Not a member of this workspace" });
      }

      // Create the message
      const [newMessage] = await db
        .insert(messages)
        .values({
          content,
          userId: user.id,
          channelId: channelId || null,
          directMessageId: directMessageId || null,
          parentId: parentId || null,
        })
        .returning() as Message[];

      // Fetch the created message with user details
      const [messageWithUser] = await db
        .select({
          id: messages.id,
          content: messages.content,
          userId: messages.userId,
          channelId: messages.channelId,
          directMessageId: messages.directMessageId,
          parentId: messages.parentId,
          attachments: messages.attachments,
          createdAt: messages.createdAt,
          updatedAt: messages.updatedAt,
          user: users,
        })
        .from(messages)
        .where(eq(messages.id, newMessage.id))
        .leftJoin(users, eq(messages.userId, users.id))
        .limit(1);

      res.json(messageWithUser);
    } catch (error) {
      console.error("Error creating message:", error);
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
      // First get the parent message and try to find workspace through both channels and direct messages
      const [parentMessageData] = await db
        .select({
          message: messages,
          channel: channels,
          directMessage: directMessages,
          workspace: workspaces,
          user: users,
        })
        .from(messages)
        .leftJoin(channels, eq(messages.channelId, channels.id))
        .leftJoin(
          directMessages,
          eq(messages.directMessageId, directMessages.id),
        )
        .leftJoin(
          workspaces,
          or(
            eq(channels.workspaceId, workspaces.id),
            eq(directMessages.workspaceId, workspaces.id),
          ),
        )
        .leftJoin(users, eq(messages.userId, users.id))
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!parentMessageData || !parentMessageData.workspace) {
        return res
          .status(404)
          .json({ error: "Message or workspace not found" });
      }

      // Verify workspace membership
      const [workspaceMember] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, parentMessageData.workspace.id),
            eq(workspaceMembers.userId, user.id),
          ),
        )
        .limit(1);

      if (!workspaceMember) {
        return res
          .status(403)
          .json({ error: "Not a member of this workspace" });
      }

      // Get the thread messages with user data
      const threadMessages = await db
        .select({
          message: messages,
          user: users,
        })
        .from(messages)
        .leftJoin(users, eq(messages.userId, users.id))
        .where(eq(messages.parentId, messageId))
        .orderBy(asc(messages.createdAt));

      // Flatten the data structure
      const allMessages = [
        {
          ...parentMessageData.message,
          user: parentMessageData.user,
        },
        ...threadMessages.map(({ message, user }) => ({
          ...message,
          user,
        })),
      ];

      res.json(allMessages);
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
            eq(workspaceMembers.workspaceId, workspaceId),
          ),
        )
        .limit(1);

      if (!member) {
        return res
          .status(403)
          .json({ error: "Not a member of this workspace" });
      }

      // Update the session with new workspace ID after null check
      req.user.workspaceId = workspaceId;

      return res.json({
        message: "Workspace updated successfully",
        user: {
          id: req.user.id,
          username: req.user.username,
          workspaceId,
        },
      });
    } catch (error) {
      console.error("Error updating workspace:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });


  return httpServer;
}