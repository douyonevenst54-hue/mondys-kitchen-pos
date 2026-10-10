"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getManagerFromSession } from "@/lib/staff";
import { isBusinessDate } from "@/lib/business-date";

export type ClubResult = { ok: true; id?: string } | { ok: false; error: string };

const Day = z.string().refine((v) => isBusinessDate(v), "Pick a valid date");
const Id = z.string().min(1).max(64);

const PostSchema = z
  .object({
    id: Id.optional(),
    kind: z.enum(["DRAW", "WINNER", "NEWS"]),
    title: z.string().trim().min(1, "Add a title").max(80, "Keep the title under 80 characters"),
    body: z.string().trim().min(1, "Add a message").max(600, "Keep the message under 600 characters"),
    eventDate: Day.nullable(),
    showFrom: Day,
    showUntil: Day.nullable(),
    isPinned: z.boolean(),
    isPublished: z.boolean(),
  })
  .refine((p) => p.kind !== "DRAW" || p.eventDate, { message: "Pick the draw date", path: ["eventDate"] })
  .refine((p) => !p.showUntil || p.showUntil >= p.showFrom, {
    message: "The last day can't be before the first day",
    path: ["showUntil"],
  });

export type PostInput = z.input<typeof PostSchema>;

function refresh() {
  revalidatePath("/order");
  revalidatePath("/club");
}

async function managerOnly(fn: (managerId: string) => Promise<ClubResult>): Promise<ClubResult> {
  const manager = await getManagerFromSession();
  if (!manager) return { ok: false, error: "Only an owner or manager can change PS Club posts" };
  try {
    const res = await fn(manager.id);
    if (res.ok) refresh();
    return res;
  } catch (e) {
    console.error("PS Club change failed:", e);
    return { ok: false, error: "Couldn't save. Try again." };
  }
}

/** Create a post, or update it when `id` is given. */
export async function savePost(input: PostInput): Promise<ClubResult> {
  const p = PostSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form" };
  const { id, ...data } = p.data;
  return managerOnly(async (managerId) => {
    if (id) {
      await prisma.announcement.update({ where: { id }, data });
      return { ok: true, id };
    }
    const row = await prisma.announcement.create({ data: { ...data, createdById: managerId } });
    return { ok: true, id: row.id };
  });
}

/** Show or hide a post without deleting it. */
export async function setPostPublished(id: string, isPublished: boolean): Promise<ClubResult> {
  const p = z.object({ id: Id, isPublished: z.boolean() }).safeParse({ id, isPublished });
  if (!p.success) return { ok: false, error: "Invalid request" };
  return managerOnly(async () => {
    await prisma.announcement.update({ where: { id: p.data.id }, data: { isPublished: p.data.isPublished } });
    return { ok: true };
  });
}

/** Pinned posts sit at the top of the corner. */
export async function setPostPinned(id: string, isPinned: boolean): Promise<ClubResult> {
  const p = z.object({ id: Id, isPinned: z.boolean() }).safeParse({ id, isPinned });
  if (!p.success) return { ok: false, error: "Invalid request" };
  return managerOnly(async () => {
    await prisma.announcement.update({ where: { id: p.data.id }, data: { isPinned: p.data.isPinned } });
    return { ok: true };
  });
}

export async function deletePost(id: string): Promise<ClubResult> {
  const p = Id.safeParse(id);
  if (!p.success) return { ok: false, error: "Invalid request" };
  return managerOnly(async () => {
    await prisma.announcement.delete({ where: { id: p.data } });
    return { ok: true };
  });
}
