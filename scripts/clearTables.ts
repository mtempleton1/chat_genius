
import { db } from "../db";
import { 
  reactions,
  messages,
  channelMembers,
  channels,
  workspaceMembers,
  workspaces,
  organizations,
  users,
  directMessages
} from "../db/schema";

async function clearTables() {
  try {
    console.log("Starting to clear tables...");
    
    // Drop tables in order (respecting foreign key constraints)
    console.log("Clearing reactions...");
    await db.delete(reactions);
    
    console.log("Clearing messages...");
    await db.delete(messages);
    
    console.log("Clearing channel members...");
    await db.delete(channelMembers);
    
    console.log("Clearing channels...");
    await db.delete(channels);
    
    console.log("Clearing direct messages...");
    await db.delete(directMessages);
    
    console.log("Clearing workspace members...");
    await db.delete(workspaceMembers);
    
    console.log("Clearing workspaces...");
    await db.delete(workspaces);
    
    console.log("Clearing organizations...");
    await db.delete(organizations);
    
    console.log("Clearing users...");
    await db.delete(users);

    console.log("All tables cleared successfully!");
  } catch (error) {
    console.error("Error while clearing tables:", error);
    process.exit(1);
  }
}

clearTables();
