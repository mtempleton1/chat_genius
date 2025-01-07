import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import {
  users,
  workspaceMembers,
  workspaces,
  organizations,
  channels,
  channelMembers,
} from "@db/schema";
import { db } from "@db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const scryptAsync = promisify(scrypt);
const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    const [hashedPassword, salt] = storedPassword.split(".");
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const suppliedPasswordBuf = (await scryptAsync(
      suppliedPassword,
      salt,
      64,
    )) as Buffer;
    return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
  },
};

// Base schema for all user registrations
const baseUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Schema for registering with a new organization/workspace
const newWorkspaceUserSchema = baseUserSchema.extend({
  organization: z.string().min(1, "Organization name is required"),
  workspace: z.string().min(1, "Workspace name is required"),
  workspaceId: z.undefined(),
});

// Schema for registering with an existing workspace
const existingWorkspaceUserSchema = baseUserSchema.extend({
  workspaceId: z.number(),
  organization: z.undefined(),
  workspace: z.undefined(),
});

// Type guard functions
function isNewWorkspaceRegistration(
  data: any,
): data is z.infer<typeof newWorkspaceUserSchema> {
  return "organization" in data && "workspace" in data;
}

function isExistingWorkspaceRegistration(
  data: any,
): data is z.infer<typeof existingWorkspaceUserSchema> {
  return "workspaceId" in data && typeof data.workspaceId === "number";
}

// Base user type from database
type BaseUser = {
  id: number;
  username: string;
  password: string;
  avatar?: string | null;
  status?: string | null;
  lastSeen?: Date | null;
  createdAt?: Date | null;
};

// Extended user type with workspace info
type User = BaseUser & {
  workspaceId?: number;
};

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends BaseUser {
      workspaceId?: number;
    }
  }
}

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "chatgenius-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: app.get("env") === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    store: new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user) {
          return done(null, false, { message: "Invalid username" });
        }

        const isMatch = await crypto.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Invalid password" });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, { id: user.id, workspaceId: user.workspaceId });
  });

  passport.deserializeUser(
    async (data: { id: number; workspaceId?: number }, done) => {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, data.id))
          .limit(1);

        if (user) {
          (user as User).workspaceId = data.workspaceId;
        }
        done(null, user);
      } catch (err) {
        done(err);
      }
    },
  );

  app.post("/api/register", async (req, res, next) => {
    try {
      let validatedData:
        | z.infer<typeof newWorkspaceUserSchema>
        | z.infer<typeof existingWorkspaceUserSchema>;

      if ("workspaceId" in req.body && req.body.workspaceId) {
        const result = existingWorkspaceUserSchema.safeParse(req.body);
        if (!result.success) {
          return res
            .status(400)
            .send("Invalid input for workspace registration");
        }
        validatedData = result.data;
      } else {
        const result = newWorkspaceUserSchema.safeParse(req.body);
        if (!result.success) {
          return res
            .status(400)
            .send("Invalid input for new organization registration");
        }
        validatedData = result.data;
      }

      const { username, password } = validatedData;

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const hashedPassword = await crypto.hash(password);
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
          avatar: `https://api.dicebear.com/7.x/avatars/svg?seed=${username}`,
        })
        .returning();

      let newWorkspaceId: number | undefined;

      if (isExistingWorkspaceRegistration(validatedData)) {
        // Existing workspace registration
        const [workspace] = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, validatedData.workspaceId))
          .limit(1);

        if (!workspace) {
          return res.status(404).send("Workspace not found");
        }

        await db.insert(workspaceMembers).values({
          userId: newUser.id,
          workspaceId: validatedData.workspaceId,
          role: "member",
        });

        // Add user to all default channels in the workspace
        const defaultChannels = await db
          .select()
          .from(channels)
          .where(
            and(
              eq(channels.workspaceId, validatedData.workspaceId),
              eq(channels.joinByDefault, true),
            ),
          );

        if (defaultChannels.length > 0) {
          await db.insert(channelMembers).values(
            defaultChannels.map((channel) => ({
              userId: newUser.id,
              channelId: channel.id,
            })),
          );
        }

        newWorkspaceId = validatedData.workspaceId;
      } else if (isNewWorkspaceRegistration(validatedData)) {
        // New workspace registration
        const [org] = await db
          .insert(organizations)
          .values({ name: validatedData.organization })
          .returning();

        const [ws] = await db
          .insert(workspaces)
          .values({ name: validatedData.workspace, organizationId: org.id })
          .returning();

        await db.insert(workspaceMembers).values({
          userId: newUser.id,
          workspaceId: ws.id,
          role: "owner",
        });

        newWorkspaceId = ws.id;
      }

      const userWithWorkspace = { ...newUser, workspaceId: newWorkspaceId };

      req.login(userWithWorkspace, (err) => {
        if (err) return next(err);
        return res.json({
          message: "Registration successful",
          user: {
            id: newUser.id,
            username: newUser.username,
            workspaceId: newWorkspaceId,
          },
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    const loginData = z
      .object({
        username: z.string().min(1, "Username is required"),
        password: z.string().min(1, "Password is required"),
        workspaceId: z.number().optional(),
      })
      .safeParse(req.body);

    if (!loginData.success) {
      return res
        .status(400)
        .send(
          "Invalid input: " +
            loginData.error.issues.map((i) => i.message).join(", "),
        );
    }

    passport.authenticate(
      "local",
      async (err: any, user: Express.User, info: IVerifyOptions) => {
        if (err) return next(err);
        if (!user) return res.status(400).send(info.message ?? "Login failed");

        // If workspaceId is provided, verify membership
        if (loginData.data.workspaceId) {
          const [member] = await db
            .select()
            .from(workspaceMembers)
            .where(
              and(
                eq(workspaceMembers.userId, user.id),
                eq(workspaceMembers.workspaceId, loginData.data.workspaceId),
              ),
            )
            .limit(1);

          if (!member) {
            return res.status(403).send("Not a member of this workspace");
          }

          user.workspaceId = loginData.data.workspaceId;
        }

        req.logIn(user, (err) => {
          if (err) return next(err);
          return res.json({
            message: "Login successful",
            user: {
              id: user.id,
              username: user.username,
              workspaceId: user.workspaceId,
            },
          });
        });
      },
    )(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).send("Logout failed");
      res.json({ message: "Logout successful" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      return res.json(req.user);
    }
    res.status(401).send("Not logged in");
  });
}
