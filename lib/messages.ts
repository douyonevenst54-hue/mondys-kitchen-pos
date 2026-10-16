import "server-only";
import { prisma } from "@/lib/prisma";

/** New (not yet handled) customer messages, for the badges in the POS. */
export async function countNewMessages(): Promise<number> {
  try {
    return await prisma.customerMessage.count({ where: { isHandled: false } });
  } catch {
    return 0; // table not created yet
  }
}
