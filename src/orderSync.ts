import { OrderType, PaymentMethod, Prisma } from "@prisma/client";
import { z } from "zod";
import { orderSchema, orderItemSchema } from "./contracts";
import { prisma } from "./prisma";
import {
  calculateLineTotalCents,
  isValidQuantityForUnit,
  normalizeQuantityForUnit,
} from "./units";

const legacyMenuItemIdMap: Record<string, string> = {
  "menu-salad": "menu-burger",
};

const operationSchema = z.object({
  order: orderSchema,
  items: z.array(orderItemSchema),
  meta: z.record(z.string(), z.unknown()).optional(),
});

type SyncOperation = z.infer<typeof operationSchema>;

const toPaymentMethod = (value?: string) =>
  value ? (value as PaymentMethod) : undefined;
const toOrderType = (value?: string) =>
  value ? (value as OrderType) : OrderType.DINE_IN;

const normalizeMenuItemId = (menuItemId: string) =>
  legacyMenuItemIdMap[menuItemId] ?? menuItemId;

export class SyncConflictError extends Error {}

export const applyOrderOperation = async (operation: SyncOperation) => {
  const parsed = operationSchema.parse(operation);
  const incomingItems = parsed.items.map((item) => ({
    ...item,
    menuItemId: normalizeMenuItemId(item.menuItemId),
  }));
  const menuItemIds = [...new Set(incomingItems.map((item) => item.menuItemId))];

  const [table, waiter, menuItems] = await Promise.all([
    prisma.restaurantTable.findUnique({
      where: { id: parsed.order.tableId },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: parsed.order.waiterId },
      select: { id: true },
    }),
    menuItemIds.length > 0
      ? prisma.menuItem.findMany({
          where: {
            id: {
              in: menuItemIds,
            },
          },
          select: { id: true, unit: true },
        })
      : Promise.resolve([]),
  ]);

  if (!table) {
    throw new SyncConflictError(`Unknown tableId: ${parsed.order.tableId}`);
  }

  if (!waiter) {
    throw new SyncConflictError(`Unknown waiterId: ${parsed.order.waiterId}`);
  }

  const existingMenuItemIds = new Set(menuItems.map((item) => item.id));
  const missingMenuItemId = menuItemIds.find((menuItemId) => !existingMenuItemIds.has(menuItemId));

  if (missingMenuItemId) {
    throw new SyncConflictError(`Unknown menuItemId: ${missingMenuItemId}`);
  }

  const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
  const normalizedItems = incomingItems.map((item) => {
    const menuItem = menuItemsById.get(item.menuItemId);

    if (!menuItem) {
      throw new SyncConflictError(`Unknown menuItemId: ${item.menuItemId}`);
    }

    if (!isValidQuantityForUnit(item.quantity, menuItem.unit)) {
      throw new SyncConflictError(
        `Invalid quantity ${item.quantity} for unit ${menuItem.unit} in ${item.menuItemId}`,
      );
    }

    return {
      ...item,
      quantity: normalizeQuantityForUnit(item.quantity, menuItem.unit),
    };
  });
  const computedTotalCents = normalizedItems.reduce(
    (sum, item) => sum + calculateLineTotalCents(item.priceCents, item.quantity),
    0,
  );

  await prisma.$transaction(async (tx) => {
    await tx.order.upsert({
      where: { id: parsed.order.id },
      create: {
        id: parsed.order.id,
        tableId: parsed.order.tableId,
        waiterId: parsed.order.waiterId,
        orderType: toOrderType(parsed.order.orderType),
        status: parsed.order.status,
        paymentMethod: toPaymentMethod(parsed.order.paymentMethod),
        precheckPrintedAt: parsed.order.precheckPrintedAt
          ? new Date(parsed.order.precheckPrintedAt)
          : undefined,
        totalCents: computedTotalCents,
        syncedAt: new Date(),
        createdAt: new Date(parsed.order.createdAt),
        updatedAt: new Date(parsed.order.updatedAt),
      },
      update: {
        tableId: parsed.order.tableId,
        waiterId: parsed.order.waiterId,
        orderType: toOrderType(parsed.order.orderType),
        status: parsed.order.status,
        paymentMethod: toPaymentMethod(parsed.order.paymentMethod),
        precheckPrintedAt: parsed.order.precheckPrintedAt
          ? new Date(parsed.order.precheckPrintedAt)
          : null,
        totalCents: computedTotalCents,
        syncedAt: new Date(),
        updatedAt: new Date(parsed.order.updatedAt),
      },
    });

    await tx.orderItem.deleteMany({
      where: {
        orderId: parsed.order.id,
      },
    });

    if (parsed.items.length > 0) {
      await tx.orderItem.createMany({
        data: normalizedItems.map((item) => ({
          id: item.id,
          orderId: item.orderId,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          priceCents: item.priceCents,
          note: item.note,
          createdAt: new Date(item.createdAt),
          updatedAt: new Date(item.updatedAt),
        })),
      });
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
};
