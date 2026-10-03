import { eq } from "drizzle-orm";
import { db, sqlite } from "./db";
import { assets, projects } from "./schema";
import { HttpError } from "./security";
import { storage } from "./storage";
import { assertNoActiveMotion } from "./repository";
export async function flushDeletedFiles() {
  const list = sqlite.prepare("SELECT filename FROM storage_gc").all() as {
    filename: string;
  }[];
  for (const { filename } of list) {
    await storage.remove(filename);
    sqlite.prepare("DELETE FROM storage_gc WHERE filename=?").run(filename);
  }
}
export async function deleteProject(id: string) {
  sqlite
    .transaction(() => {
      assertNoActiveMotion(id);
      const busy = sqlite
        .prepare("SELECT id FROM jobs WHERE projectId=? AND leaseUntil>?")
        .get(id, Date.now());
      if (busy)
        throw new HttpError(
          409,
          "The worker is finishing a step. Try deleting again in two minutes.",
        );
      const list = db
        .select()
        .from(assets)
        .where(eq(assets.projectId, id))
        .all();
      for (const a of list)
        sqlite
          .prepare("INSERT OR IGNORE INTO storage_gc VALUES(?)")
          .run(a.filename);
      db.delete(projects).where(eq(projects.id, id)).run();
    })
    .immediate();
  await flushDeletedFiles();
}
