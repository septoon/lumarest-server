import { z } from "zod";

export const roleSchema = z.enum(["ADMIN", "WAITER"]);
export const orderStatusSchema = z.enum(["OPEN", "CLOSED"]);
export const paymentMethodSchema = z.enum(["CASH", "CARD"]);
export const syncOperationTypeSchema = z.enum([
  "ORDER_CREATED",
  "ORDER_UPDATED",
  "ORDER_ITEM_REMOVED",
  "PRECHECK_PRINTED",
  "PRECHECK_CANCELLED",
  "ORDER_CLOSED",
]);

export const orderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  menuItemId: z.string(),
  quantity: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
  note: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const orderSchema = z.object({
  id: z.string(),
  tableId: z.string(),
  waiterId: z.string(),
  status: orderStatusSchema,
  paymentMethod: paymentMethodSchema.optional(),
  precheckPrintedAt: z.string().optional(),
  totalCents: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  syncedAt: z.string().optional(),
});

export const syncOperationSchema = z.object({
  order: orderSchema,
  items: z.array(orderItemSchema),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const syncEnvelopeSchema = z.object({
  operations: z.array(syncOperationSchema),
});

export const authSchema = z.object({
  userId: z.string(),
  pin: z.string().min(4).max(12),
});

export const categoryInputSchema = z.object({
  id: z.string(),
  departmentId: z.string(),
  name: z.string(),
  color: z.string(),
  sortOrder: z.number().int(),
});

export const departmentInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
});

export const menuItemInputSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  sku: z.string().optional(),
  priceCents: z.number().int().nonnegative(),
  unit: z.string(),
  sortOrder: z.number().int(),
  station: z.enum(["BAR", "KITCHEN", "GRILL"]),
  available: z.boolean(),
});

export const menuUpdateSchema = z.object({
  departments: z.array(departmentInputSchema),
  categories: z.array(categoryInputSchema),
  menuItems: z.array(menuItemInputSchema),
});

export const printerUpdateSchema = z.object({
  printers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ipAddress: z.string(),
      scope: z.enum(["BAR", "KITCHEN", "GRILL", "PRECHECK", "REPORT"]),
    }),
  ),
});

export const userUpdateSchema = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: roleSchema,
      pin: z.string(),
    }),
  ),
});
