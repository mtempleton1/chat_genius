
import { db } from "../db";
import { reactions, messages, channelMembers, channels, users } from "../db/schema";

async function clearTables() {
  console.log("Clearing all tables...");
  
  // Drop tables in order (respecting foreign key constraints)
  await db.delete(reactions);
  await db.delete(messages);
  await db.delete(channelMembers);
  await db.delete(channels);
  await db.delete(users);
  
  console.log("All tables cleared successfully!");
}

clearTables().catch(console.error);
