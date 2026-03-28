import { PaymentMethod, Prisma } from "@prisma/client";
import { z } from "zod";
import { orderSchema, orderItemSchema } from "./contracts";
import { prisma } from "./prisma";

const operationSchema = z.object({
  order: orderSchema,
  items: z.array(orderItemSchema),
  meta: z.record(z.string(), z.unknown()).optional(),
});

type SyncOperation = z.infer<typeof operationSchema>;

const toPaymentMethod = (value?: string) =>
  value ? (value as PaymentMethod) : undefined;

export const applyOrderOperation = async (operation: SyncOperation) => {
  const parsed = operationSchema.parse(operation);

  await prisma.$transaction(async (tx) => {
    await tx.order.upsert({
      where: { id: parsed.order.id },
      create: {
        id: parsed.order.id,
        tableId: parsed.order.tableId,
        waiterId: parsed.order.waiterId,
        status: parsed.order.status,
        paymentMethod: toPaymentMethod(parsed.order.paymentMethod),
        precheckPrintedAt: parsed.order.precheckPrintedAt
          ? new Date(parsed.order.precheckPrintedAt)
          : undefined,
        totalCents: parsed.order.totalCents,
        syncedAt: new Date(),
        createdAt: new Date(parsed.order.createdAt),
        updatedAt: new Date(parsed.order.updatedAt),
      },
      update: {
        tableId: parsed.order.tableId,
        waiterId: parsed.order.waiterId,
        status: parsed.order.status,
        paymentMethod: toPaymentMethod(parsed.order.paymentMethod),
        precheckPrintedAt: parsed.order.precheckPrintedAt
          ? new Date(parsed.order.precheckPrintedAt)
          : null,
        totalCents: parsed.order.totalCents,
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
        data: parsed.items.map((item) => ({
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
