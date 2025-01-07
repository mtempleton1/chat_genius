import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
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
} from "@db/schema";
import { eq, and, asc, or, desc, isNull } from "drizzle-orm";
import multer from "multer";
import type { InferModel } from "drizzle-orm";

// Type definitions
type Workspace = InferModel<typeof workspaces>;
type Organization = InferModel<typeof organizations>;
type Channel = InferModel<typeof channels>;
type Message = InferModel<typeof messages>;

type WorkspaceWithOrg = Workspace & {
  organization: Organization | null;
};

type ChannelWithWorkspace = Channel & {
  workspace: WorkspaceWithOrg;
};

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
  // Important: Create HTTP server first
  const httpServer = createServer(app);

  // Important: Setup auth before other routes to ensure proper session handling
  setupAuth(app);

  // Setup WebSocket after creating HTTP server
  setupWebSocket(httpServer);

  // Add endpoint to get user's workspaces
  app.get("/api/user/workspaces", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

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
      res.status(500).send("Internal server error");
    }
  });

  app.get("/api/workspaces/:workspaceId", async (req, res) => {
    const workspaceId = parseInt(req.params.workspaceId);
    if (isNaN(workspaceId)) {
      return res.status(400).send("Invalid workspace ID");
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
        return res.status(404).send("Workspace not found");
      }

      // If user is authenticated, check membership
      if (req.user) {
        const user = req.user as Express.User;
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
      return res.status(500).send("Internal server error");
    }
  });

  app.get("/api/workspaces/:workspaceId/channels", async (req, res) => {
    console.log("BALAHABALAHAAHHFHFKLDFDHLDFLH");
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const workspaceId = parseInt(req.params.workspaceId);
    if (isNaN(workspaceId)) {
      return res.status(400).send("Invalid workspace ID");
    }

    // Check workspace membership
    const member = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id),
      ),
    });

    if (!member) {
      return res.status(403).send("Not a member of this workspace");
    }

    const workspaceChannels = await db.query.channels.findMany({
      where: eq(channels.workspaceId, workspaceId),
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
    if (isNaN(workspaceId)) {
      return res.status(400).send("Invalid workspace ID");
    }

    const { name, isPrivate } = req.body;

    // Check workspace membership
    const member = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id),
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
        joinByDefault: true,
        createdById: user.id,
      })
      .returning();

    // Get all workspace members
    const workspaceMembers = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));

    // Add all workspace members to the channel
    if (workspaceMembers.length > 0) {
      await db.insert(channelMembers).values(
        workspaceMembers.map(member => ({
          channelId: channel.id,
          userId: member.userId,
        }))
      );
    }

    res.json(channel);
  });

  app.get("/api/channels/:channelId/messages", async (req, res) => {
    console.log("ARE WE GETTTING HERERERERERERERE???????");

    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");
    const channelId = parseInt(req.params.channelId);
    if (isNaN(channelId)) {
      return res.status(400).send("Invalid channel ID");
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
        return res.status(404).send("Channel not found");
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
        return res.status(403).send("Not a member of this workspace");
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
      res.status(500).send("Internal server error");
    }
  });

  // Add file upload endpoint
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");
    if (!req.file) return res.status(400).send("No file uploaded");

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, name: req.file.originalname });
  });

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
    await db.insert(workspaceMembers).values({
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
    await db.insert(workspaceMembers).values({
      userId: user.id,
      workspaceId: workspace.id,
      role: "owner",
    });

    res.json(workspace);
  });

  app.get("/api/messages/:messageId/thread", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const messageId = parseInt(req.params.messageId);
    if (isNaN(messageId)) {
      return res.status(400).send("Invalid message ID");
    }

    try {
      // First get the parent message and its channel
      const message = await db
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

      if (!message || !message[0]) {
        return res.status(404).send("Message not found");
      }

      const { workspace } = message[0];

      // Verify workspace membership.  This is where the null check needs to be added.
      const [workspaceMember] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspace?.id),
            eq(workspaceMembers.userId, user.id),
          ),
        )
        .limit(1);

      if (!workspaceMember) {
        return res.status(403).send("Not a member of this workspace");
      }

      // Get the parent message with full details
      const parentMessage = await db.query.messages.findFirst({
        where: eq(messages.id, messageId),
        with: {
          user: true,
          reactions: {
            with: {
              user: true,
            },
          },
        },
      });

      if (!parentMessage) {
        return res.status(404).send("Thread not found");
      }

      // Then get all replies in chronological order
      const replies = await db.query.messages.findMany({
        where: eq(messages.parentId, messageId),
        with: {
          user: true,
          reactions: {
            with: {
              user: true,
            },
          },
        },
        orderBy: [asc(messages.createdAt)],
      });

      // Return the thread with parent message first
      res.json([parentMessage, ...replies]);
    } catch (error) {
      console.error("Error fetching thread:", error);
      res.status(500).send("Internal server error");
    }
  });

  app.post("/api/messages", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const { content, channelId, parentId } = req.body;

    // Validate channel ID
    const channelIdNum = parseInt(channelId);
    if (isNaN(channelIdNum)) {
      return res.status(400).send("Invalid channel ID");
    }

    try {
      // If this is a thread message, verify parent message exists
      if (parentId) {
        const parentMessage = await db.query.messages.findFirst({
          where: eq(messages.id, parentId),
        });

        if (!parentMessage) {
          return res.status(404).send("Parent message not found");
        }
      }

      const [newMessage] = await db
        .insert(messages)
        .values({
          content,
          channelId: channelIdNum,
          parentId: parentId ? parseInt(parentId) : null,
          userId: user.id,
        })
        .returning();

      // Fetch complete message with user and reactions
      const completeMessage = await db.query.messages.findFirst({
        where: eq(messages.id, newMessage.id),
        with: {
          user: true,
          reactions: {
            with: {
              user: true,
            },
          },
        },
      });

      if (!completeMessage) {
        return res.status(500).send("Failed to create message");
      }

      res.json(completeMessage);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).send("Internal server error");
    }
  });

  app.post("/api/messages/:messageId/reactions", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const messageId = parseInt(req.params.messageId);
    if (isNaN(messageId)) {
      return res.status(400).send("Invalid message ID");
    }

    const { emoji } = req.body;
    const [reaction] = await db
      .insert(reactions)
      .values({
        emoji,
        messageId,
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

    if (!completeReaction) {
      return res.status(500).send("Failed to create reaction");
    }

    res.json(completeReaction);
  });

  app.delete(
    "/api/messages/:messageId/reactions/:reactionId",
    async (req, res) => {
      const user = req.user as Express.User;
      if (!user) return res.status(401).send("Not authenticated");

      const messageId = parseInt(req.params.messageId);
      const reactionId = parseInt(req.params.reactionId);

      if (isNaN(messageId) || isNaN(reactionId)) {
        return res.status(400).send("Invalid message or reaction ID");
      }

      try {
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

        if (!message?.workspace) {
          return res.status(404).send("Message or workspace not found");
        }

        // Verify workspace membership
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
          return res.status(403).send("Not a member of this workspace");
        }

        await db
          .delete(reactions)
          .where(
            and(eq(reactions.id, reactionId), eq(reactions.userId, user.id)),
          );

        res.status(204).send();
      } catch (error) {
        console.error("Error deleting reaction:", error);
        res.status(500).send("Internal server error");
      }
    },
  );
  // Add endpoint to update user's current workspace
  app.post("/api/user/workspace", async (req, res) => {
    const user = req.user as Express.User;
    if (!user) return res.status(401).send("Not authenticated");

    const workspaceId = req.body.workspaceId;
    if (!workspaceId) {
      return res.status(400).send("Workspace ID is required");
    }

    try {
      // Verify workspace membership
      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.userId, user.id),
            eq(workspaceMembers.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!member) {
        return res.status(403).send("Not a member of this workspace");
      }

      // Update the session with new workspace ID
      req.user.workspaceId = workspaceId;

      return res.json({
        message: "Workspace updated successfully",
        user: {
          id: user.id,
          username: user.username,
          workspaceId
        }
      });
    } catch (error) {
      console.error("Error updating workspace:", error);
      res.status(500).send("Internal server error");
    }
  });

  return httpServer;
}