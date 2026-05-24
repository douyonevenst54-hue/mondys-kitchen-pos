"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { refreshSessionShiftState } from "@/app/login/actions";

export async function logoutAndRedirect() {
  const c = await cookies();
  c.delete("mondy_session");
  redirect("/login");
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const PaymentInputSchema = z.object({
  method: z.enum([
    "CASH",
    "CARD_PRESENT",
    "CARD_MANUAL",
    "MOBILE_WALLET",
    "GIFT_CARD",
    "STORE_CREDIT",
    "CASH_APP",
    "CHECK",
    "PI_NETWORK",
    "HOUSE_ACCOUNT",
    "OTHER",
  ]),
  amount: z.number().positive(),
  tendered: z.number().nullable().optional(),
  changeGiven: z.number().nullable().optional(),
  cardLast4: z.string().optional().nullable(),
  cardBrand: z.string().optional().nullable(),
});

const LineInputSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  nameSnapshot: z.string(),
  spiceLevel: z.enum(["Mild", "Medium", "Hot"]).optional().nullable(),
});

const DiscountInputSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    type: z.enum(["PERCENT", "FIXED_AMOUNT", "COMP"]),
    value: z.number(),
    amountApplied: z.number(),
    appliedByStaffId: z.string(),
    reason: z.string().optional().nullable(),
  })
  .nullable();

const CheckoutSchema = z.object({
  orderType: z.enum(["DINE_IN", "TAKEOUT", "DELIVERY"]),
  tableId: z.string().nullable(),
  customerName: z.string(),
  customerPhone: z.string().optional().default(""),
  deliveryAddress: z.string().optional().default(""),
  deliveryNotes: z.string().optional().default(""),
  deliveryFee: z.number().nonnegative().default(0),
  staffId: z.string(),
  lines: z.array(LineInputSchema).min(1),
  discount: DiscountInputSchema,
  subtotal: z.number(),
  discountAmount: z.number(),
  taxAmount: z.number(),
  tipAmount: z.number().nonnegative().default(0),
  total: z.number(),
  taxRate: z.number(),
  payment: PaymentInputSchema,
});

export type CheckoutInput = z.infer<typeof CheckoutSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type Session = { staffId: string; name: string; role: string };

async function requireSession(): Promise<Session> {
  const c = await cookies();
  const raw = c.get("mondy_session")?.value;
  if (!raw) throw new Error("Not authenticated");
  return JSON.parse(raw) as Session;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout: create order + record payment in a single transaction
// ─────────────────────────────────────────────────────────────────────────────

export async function submitCheckout(input: CheckoutInput) {
  const parsed = CheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid checkout payload",
    };
  }
  const data = parsed.data;
  const session = await requireSession();

  // Make sure the staffId in the payload matches the logged-in user.
  if (session.staffId !== data.staffId) {
    return { ok: false as const, error: "Session/staff mismatch" };
  }

  // Delivery requires address + phone
  if (data.orderType === "DELIVERY") {
    if (!data.deliveryAddress.trim()) {
      return { ok: false as const, error: "Delivery address is required" };
    }
    if (!data.customerPhone.trim()) {
      return {
        ok: false as const,
        error: "Customer phone is required for delivery",
      };
    }
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      // 1. Find an open shift for this staff (if any) — payments roll into it.
      const openShift = await tx.shift.findFirst({
        where: { staffId: data.staffId, endedAt: null },
        orderBy: { startedAt: "desc" },
      });

      // 2. Create the order with line items (using nested writes).
      const created = await tx.order.create({
        data: {
          staffId: data.staffId,
          shiftId: openShift?.id,
          tableId: data.orderType === "DINE_IN" ? data.tableId : null,
          orderType: data.orderType,
          status: "COMPLETED",
          customerName:
            data.orderType !== "DINE_IN" && data.customerName
              ? data.customerName
              : null,
          customerPhone:
            data.orderType === "DELIVERY" && data.customerPhone
              ? data.customerPhone
              : null,
          deliveryAddress:
            data.orderType === "DELIVERY" ? data.deliveryAddress : null,
          deliveryNotes:
            data.orderType === "DELIVERY" && data.deliveryNotes
              ? data.deliveryNotes
              : null,
          deliveryFee: data.orderType === "DELIVERY" ? data.deliveryFee : 0,
          subtotal: data.subtotal,
          discountAmount: data.discountAmount,
          taxAmount: data.taxAmount,
          tipAmount: data.tipAmount,
          total: data.total,
          taxExempt: false,
          completedAt: new Date(),
          items: {
            create: data.lines.map((l) => ({
              menuItemId: l.menuItemId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              nameSnapshot: l.nameSnapshot,
              lineTotal: Math.round(l.unitPrice * l.quantity * 100) / 100,
              notes: l.spiceLevel ? `Spice: ${l.spiceLevel}` : null,
            })),
          },
        },
        include: { items: true },
      });

      // 3. Record the discount application (if any). Custom discounts have
      // synthetic ids like "custom-PERCENT-..." that aren't in the Discount
      // table; we skip persisting OrderDiscount for those but keep the
      // discountAmount on the order.
      if (data.discount && !data.discount.id.startsWith("custom-") && !data.discount.id.startsWith("comp-")) {
        await tx.orderDiscount.create({
          data: {
            orderId: created.id,
            discountId: data.discount.id,
            amountApplied: data.discount.amountApplied,
            reason: data.discount.reason ?? null,
            appliedByStaffId: data.discount.appliedByStaffId,
          },
        });
      }

      // 4. Record the payment.
      await tx.payment.create({
        data: {
          orderId: created.id,
          method: data.payment.method,
          status: "COMPLETED",
          amount: data.payment.amount,
          tendered: data.payment.tendered ?? null,
          changeGiven: data.payment.changeGiven ?? null,
          cardLast4: data.payment.cardLast4 ?? null,
          cardBrand: data.payment.cardBrand ?? null,
        },
      });

      return created;
    });

    return {
      ok: true as const,
      orderId: order.id,
      orderNumber: order.orderNumber,
    };
  } catch (e) {
    console.error("Checkout failed:", e);
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Checkout failed",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Void order (manager-PIN gated)
// ─────────────────────────────────────────────────────────────────────────────

const VoidSchema = z.object({
  orderId: z.string(),
  reason: z.string().min(3, "Reason required (at least 3 characters)"),
  managerPin: z.string().regex(/^\d{4,8}$/),
});

export async function voidOrder(
  orderId: string,
  reason: string,
  managerPin: string,
) {
  const session = await requireSession();
  const parsed = VoidSchema.safeParse({ orderId, reason, managerPin });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid void request",
    };
  }

  // Verify the PIN belongs to an OWNER or MANAGER
  const candidates = await prisma.staff.findMany({
    where: { isActive: true, role: { in: ["OWNER", "MANAGER"] } },
    select: { id: true, name: true, pinHash: true },
  });
  let manager: { id: string; name: string } | null = null;
  for (const c of candidates) {
    if (await bcrypt.compare(parsed.data.managerPin, c.pinHash)) {
      manager = { id: c.id, name: c.name };
      break;
    }
  }
  if (!manager) {
    return { ok: false as const, error: "Not a manager PIN" };
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, status: true },
  });
  if (!order) {
    return { ok: false as const, error: "Order not found" };
  }
  if (order.status === "VOIDED") {
    return { ok: false as const, error: "Order is already voided" };
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedReason: parsed.data.reason,
        voidedByStaffId: manager.id,
      },
    }),
    prisma.payment.updateMany({
      where: { orderId: order.id, status: "COMPLETED" },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
        refundReason: parsed.data.reason,
      },
    }),
  ]);

  return {
    ok: true as const,
    voidedByName: manager.name,
  };
}

export async function getCurrentShift(staffId: string) {
  const shift = await prisma.shift.findFirst({
    where: { staffId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!shift) return null;
  return {
    id: shift.id,
    startedAt: shift.startedAt,
    openingCash: Number(shift.openingCash),
  };
}

const OpenShiftSchema = z.object({
  openingCash: z.number().nonnegative(),
});

export async function openShift(openingCash: number) {
  const session = await requireSession();
  const parsed = OpenShiftSchema.safeParse({ openingCash });
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid opening cash amount" };
  }
  const existing = await prisma.shift.findFirst({
    where: { staffId: session.staffId, endedAt: null },
  });
  if (existing) {
    return { ok: false as const, error: "A shift is already open" };
  }
  const shift = await prisma.shift.create({
    data: {
      staffId: session.staffId,
      openingCash: parsed.data.openingCash,
    },
  });

  // Refresh the session cookie so the proxy knows there's now an open shift.
  await refreshSessionShiftState(true);

  return { ok: true as const, shiftId: shift.id };
}

const CloseShiftSchema = z.object({
  shiftId: z.string(),
  closingCash: z.number().nonnegative(),
  notes: z.string().optional(),
});

export async function closeShift(
  shiftId: string,
  closingCash: number,
  notes?: string,
) {
  const session = await requireSession();
  const parsed = CloseShiftSchema.safeParse({ shiftId, closingCash, notes });
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid close payload" };
  }
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift || shift.staffId !== session.staffId) {
    return { ok: false as const, error: "Shift not found" };
  }
  if (shift.endedAt) {
    return { ok: false as const, error: "Shift already closed" };
  }

  // Compute expected cash = opening + sum(CASH payments) - refunds
  const cashPayments = await prisma.payment.aggregate({
    where: {
      method: "CASH",
      status: "COMPLETED",
      order: { shiftId },
    },
    _sum: { amount: true },
  });
  const cashIn = Number(cashPayments._sum.amount ?? 0);
  const expected = Number(shift.openingCash) + cashIn;
  const variance = parsed.data.closingCash - expected;

  await prisma.shift.update({
    where: { id: shiftId },
    data: {
      endedAt: new Date(),
      closingCash: parsed.data.closingCash,
      expectedCash: expected,
      variance,
      notes: parsed.data.notes ?? null,
    },
  });

  // Refresh session cookie — no more open shift.
  await refreshSessionShiftState(false);

  return {
    ok: true as const,
    expected,
    cashIn,
    openingCash: Number(shift.openingCash),
    closingCash: parsed.data.closingCash,
    variance,
  };
}