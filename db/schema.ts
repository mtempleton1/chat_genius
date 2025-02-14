import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import type { InferModel } from 'drizzle-orm';

// Organizations table
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Workspaces table
export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  organizationId: integer("organization_id")
    .references(() => organizations.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Users table with explicit status field
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  avatar: text("avatar"),
  status: text("status"),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// User-Workspace membership
export const workspaceMembers = pgTable("workspace_members", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  workspaceId: integer("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  role: text("role").default("member"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Channels table
export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  workspaceId: integer("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  isPrivate: boolean("is_private").default(false),
  joinByDefault: boolean("join_by_default").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  createdById: integer("created_by_id")
    .references(() => users.id)
    .notNull(),
});

export const channelMembers = pgTable("channel_members", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id")
    .references(() => channels.id)
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Direct Messages table to track conversations between two users in a workspace
export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .references(() => workspaces.id)
    .notNull(),
  user1Id: integer("user1_id")
    .references(() => users.id)
    .notNull(),
  user2Id: integer("user2_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Updated messages table to support both channel and direct messages
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: integer("user_id").references(() => users.id),
  // Make channelId optional since message can be in either channel or DM
  channelId: integer("channel_id").references(() => channels.id),
  // Add directMessageId for DM support
  directMessageId: integer("direct_message_id").references(() => directMessages.id),
  parentId: integer("parent_id").references(() => messages.id),
  attachments: jsonb("attachments").$type<{ url: string; name: string }[]>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reactions = pgTable("reactions", {
  id: serial("id").primaryKey(),
  emoji: text("emoji").notNull(),
  userId: integer("user_id").references(() => users.id),
  messageId: integer("message_id").references(() => messages.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  workspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workspaces.organizationId],
    references: [organizations.id],
  }),
  channels: many(channels),
  members: many(workspaceMembers),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [channels.workspaceId],
    references: [workspaces.id],
  }),
  messages: many(messages),
  members: many(channelMembers),
  createdBy: one(users, {
    fields: [channels.createdById],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  workspaces: many(workspaceMembers),
  messages: many(messages),
  channelMembers: many(channelMembers),
  reactions: many(reactions),
  directMessagesAsUser1: many(directMessages, { relationName: "user1" }),
  directMessagesAsUser2: many(directMessages, { relationName: "user2" }),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id],
  }),
}));

export const channelMembersRelations = relations(channelMembers, ({ one }) => ({
  channel: one(channels, {
    fields: [channelMembers.channelId],
    references: [channels.id],
  }),
  user: one(users, {
    fields: [channelMembers.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  directMessage: one(directMessages, {
    fields: [messages.directMessageId],
    references: [directMessages.id],
  }),
  parent: one(messages, {
    fields: [messages.parentId],
    references: [messages.id],
  }),
  replies: many(messages),
  reactions: many(reactions),
}));

export const reactionsRelations = relations(reactions, ({ one }) => ({
  user: one(users, {
    fields: [reactions.userId],
    references: [users.id],
  }),
  message: one(messages, {
    fields: [reactions.messageId],
    references: [messages.id],
  }),
}));

// Add relations for direct messages
export const directMessagesRelations = relations(directMessages, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [directMessages.workspaceId],
    references: [workspaces.id],
  }),
  user1: one(users, {
    fields: [directMessages.user1Id],
    references: [users.id],
  }),
  user2: one(users, {
    fields: [directMessages.user2Id],
    references: [users.id],
  }),
  messages: many(messages),
}));


// Schemas
export const insertChannelSchema = createInsertSchema(channels);
export const selectChannelSchema = createSelectSchema(channels);

export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export const insertWorkspaceSchema = createInsertSchema(workspaces);
export const selectWorkspaceSchema = createSelectSchema(workspaces);

// Add schemas for direct messages
export const insertDirectMessageSchema = createInsertSchema(directMessages);
export const selectDirectMessageSchema = createSelectSchema(directMessages);

// Types
export type User = InferModel<typeof users>;
export type Organization = InferModel<typeof organizations>;
export type Workspace = InferModel<typeof workspaces>;
export type Channel = InferModel<typeof channels>;
export type Message = InferModel<typeof messages>;
export type Reaction = InferModel<typeof reactions>;
// Add type for direct messages
export type DirectMessage = InferModel<typeof directMessages>;