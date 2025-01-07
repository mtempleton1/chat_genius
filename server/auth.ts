import passport from "passport";
import { IVerifyOptions, Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, workspaceMembers, workspaces, organizations } from "@db/schema";
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
      64
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
});

// Schema for registering with an existing workspace
const existingWorkspaceUserSchema = baseUserSchema.extend({
  workspaceId: z.number(),
});

// Type for the validated registration data
type RegisterData = {
  username: string;
  password: string;
  organization?: string;
  workspace?: string;
  workspaceId?: number;
};

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
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
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
    })
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, { id: user.id, workspaceId: user.workspaceId });
  });

  passport.deserializeUser(async (data: { id: number; workspaceId?: number }, done) => {
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
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      let validatedData: RegisterData;

      // Try validating as new workspace registration
      const newWorkspaceResult = newWorkspaceUserSchema.safeParse(req.body);
      if (newWorkspaceResult.success) {
        validatedData = newWorkspaceResult.data;
      } else {
        // Try validating as existing workspace registration
        const existingWorkspaceResult = existingWorkspaceUserSchema.safeParse(req.body);
        if (existingWorkspaceResult.success) {
          validatedData = existingWorkspaceResult.data;
        } else {
          return res
            .status(400)
            .send("Invalid input: Please provide either organization and workspace names or a workspace ID");
        }
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

      if ('workspaceId' in validatedData && validatedData.workspaceId) {
        // Existing workspace registration
        const [workspace] = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, validatedData.workspaceId))
          .limit(1);

        if (!workspace) {
          return res.status(404).send("Workspace not found");
        }

        const [workspaceMember] = await db
          .insert(workspaceMembers)
          .values({
            userId: newUser.id,
            workspaceId: validatedData.workspaceId,
            role: "member",
          })
          .returning();

        newWorkspaceId = validatedData.workspaceId;
      } else if (validatedData.organization && validatedData.workspace) {
        // New workspace registration
        const [org] = await db
          .insert(organizations)
          .values({ name: validatedData.organization })
          .returning();

        const [ws] = await db
          .insert(workspaces)
          .values({ name: validatedData.workspace, organizationId: org.id })
          .returning();

        const [workspaceMember] = await db
          .insert(workspaceMembers)
          .values({
            userId: newUser.id,
            workspaceId: ws.id,
            role: "owner",
          })
          .returning();

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
            workspaceId: newWorkspaceId
          },
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    // For login, we'll accept either format
    const loginData = z.object({
      username: z.string().min(1, "Username is required"),
      password: z.string().min(1, "Password is required"),
      workspaceId: z.number().optional(),
    }).safeParse(req.body);

    if (!loginData.success) {
      return res
        .status(400)
        .send("Invalid input: " + loginData.error.issues.map(i => i.message).join(", "));
    }

    const { username, password, workspaceId } = loginData.data;

    passport.authenticate("local", async (err: any, user: Express.User, info: IVerifyOptions) => {
      if (err) return next(err);
      if (!user) return res.status(400).send(info.message ?? "Login failed");

      // If workspaceId is provided, verify membership
      if (workspaceId) {
        const member = await db.query.workspaceMembers.findFirst({
          where: and(
            eq(workspaceMembers.userId, user.id),
            eq(workspaceMembers.workspaceId, workspaceId)
          ),
        });

        if (!member) {
          return res.status(403).send("Not a member of this workspace");
        }

        user.workspaceId = workspaceId;
      }

      req.logIn(user, (err) => {
        if (err) return next(err);
        return res.json({
          message: "Login successful",
          user: { 
            id: user.id, 
            username: user.username,
            workspaceId: user.workspaceId 
          },
        });
      });
    })(req, res, next);
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