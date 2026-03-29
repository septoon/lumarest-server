import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify, { FastifyReply } from "fastify";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import {
  authSchema,
  menuUpdateSchema,
  printerUpdateSchema,
  syncEnvelopeSchema,
  syncOperationSchema,
  userUpdateSchema,
} from "./contracts";
import { applyOrderOperation, SyncConflictError } from "./orderSync";
import { loadBootstrap } from "./catalog";
import { broadcast, registerSocket } from "./broadcast";
import { prisma } from "./prisma";

class CatalogConflictError extends Error {}

const sendApiError = (
  reply: FastifyReply,
  error: unknown,
  fallbackMessage: string,
) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      message: "Invalid request payload",
      issues: error.issues,
    });
  }

  if (error instanceof SyncConflictError) {
    return reply.status(409).send({
      message: error.message,
    });
  }

  if (error instanceof CatalogConflictError) {
    return reply.status(409).send({
      message: error.message,
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return reply.status(409).send({
      message: "Referenced entity does not exist",
      code: error.code,
    });
  }

  if (error instanceof Error) {
    return reply.status(500).send({
      message: error.message || fallbackMessage,
    });
  }

  return reply.status(500).send({
    message: fallbackMessage,
  });
};

export const buildApp = () => {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.register(websocket);

  app.get("/api/health", async () => ({
    ok: true,
    timestamp: new Date().toISOString(),
  }));

  app.get("/api/bootstrap", async () => loadBootstrap());

  app.post("/api/auth/pin", async (request, reply) => {
    const body = authSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { id: body.userId },
    });

    if (!user || user.pin !== body.pin) {
      return reply.status(401).send({ message: "Invalid credentials" });
    }

    return {
      id: user.id,
      name: user.name,
      role: user.role,
    };
  });

  app.post("/api/orders/sync", async (request, reply) => {
    try {
      const body = syncEnvelopeSchema.parse(request.body);

      for (const operation of body.operations) {
        await applyOrderOperation(syncOperationSchema.parse(operation));
      }

      return {
        ok: true,
        count: body.operations.length,
      };
    } catch (error) {
      request.log.error(error, "Failed to apply order sync operations");
      return sendApiError(reply, error, "Failed to sync orders");
    }
  });

  app.put("/api/catalog/menu", async (request, reply) => {
    try {
      const body = menuUpdateSchema.parse(request.body);

      await prisma.$transaction(async (tx) => {
        const incomingDepartmentIds = new Set(body.departments.map((department) => department.id));
        const incomingCategoryIds = new Set(body.categories.map((category) => category.id));
        const incomingMenuItemIds = new Set(body.menuItems.map((menuItem) => menuItem.id));

        const existingMenuItems = await tx.menuItem.findMany({
          select: { id: true },
        });
        const removableMenuItemIds = existingMenuItems
          .map((item) => item.id)
          .filter((id) => !incomingMenuItemIds.has(id));

        const referencedRemovedMenuItems =
          removableMenuItemIds.length > 0
            ? await tx.orderItem.findMany({
                where: {
                  menuItemId: {
                    in: removableMenuItemIds,
                  },
                },
                select: { menuItemId: true },
                distinct: ["menuItemId"],
              })
            : [];

        if (referencedRemovedMenuItems.length > 0) {
          throw new CatalogConflictError(
            `Нельзя удалить блюда, которые уже используются в заказах: ${referencedRemovedMenuItems
              .map((item) => item.menuItemId)
              .join(", ")}`,
          );
        }

        for (const department of body.departments) {
          await tx.department.upsert({
            where: { id: department.id },
            update: {
              name: department.name,
              sortOrder: department.sortOrder,
            },
            create: department,
          });
        }

        for (const category of body.categories) {
          await tx.category.upsert({
            where: { id: category.id },
            update: {
              departmentId: category.departmentId,
              name: category.name,
              color: category.color,
              sortOrder: category.sortOrder,
            },
            create: category,
          });
        }

        for (const menuItem of body.menuItems) {
          await tx.menuItem.upsert({
            where: { id: menuItem.id },
            update: {
              categoryId: menuItem.categoryId,
              name: menuItem.name,
              description: menuItem.description,
              sku: menuItem.sku,
              priceCents: menuItem.priceCents,
              unit: menuItem.unit,
              sortOrder: menuItem.sortOrder,
              station: menuItem.station,
              available: menuItem.available,
            },
            create: menuItem,
          });
        }

        if (removableMenuItemIds.length > 0) {
          await tx.menuItem.deleteMany({
            where: {
              id: {
                in: removableMenuItemIds,
              },
            },
          });
        }

        const existingCategories = await tx.category.findMany({
          select: { id: true },
        });
        const removableCategoryIds = existingCategories
          .map((category) => category.id)
          .filter((id) => !incomingCategoryIds.has(id));

        if (removableCategoryIds.length > 0) {
          await tx.category.deleteMany({
            where: {
              id: {
                in: removableCategoryIds,
              },
            },
          });
        }

        const existingDepartments = await tx.department.findMany({
          select: { id: true },
        });
        const removableDepartmentIds = existingDepartments
          .map((department) => department.id)
          .filter((id) => !incomingDepartmentIds.has(id));

        if (removableDepartmentIds.length > 0) {
          await tx.department.deleteMany({
            where: {
              id: {
                in: removableDepartmentIds,
              },
            },
          });
        }
      });

      const bootstrap = await loadBootstrap();
      broadcast({
        type: "MENU_UPDATED",
        payload: {
          departments: bootstrap.departments,
          categories: bootstrap.categories,
          menuItems: bootstrap.menuItems,
        },
      });

      return bootstrap;
    } catch (error) {
      request.log.error(error, "Failed to save menu catalog");
      return sendApiError(reply, error, "Failed to save menu");
    }
  });

  app.put("/api/printers", async (request) => {
    const body = printerUpdateSchema.parse(request.body);

    await prisma.$transaction(async (tx) => {
      await tx.printer.deleteMany();
      await tx.printer.createMany({
        data: body.printers,
      });
    });

    const bootstrap = await loadBootstrap();
    broadcast({
      type: "PRINTERS_UPDATED",
      payload: {
        printers: bootstrap.printers,
      },
    });

    return { ok: true };
  });

  app.put("/api/users", async (request) => {
    const body = userUpdateSchema.parse(request.body);

    await prisma.$transaction(async (tx) => {
      await tx.user.deleteMany();
      await tx.user.createMany({
        data: body.users,
      });
    });

    const bootstrap = await loadBootstrap();
    broadcast({
      type: "USERS_UPDATED",
      payload: {
        users: bootstrap.users,
      },
    });

    return { ok: true };
  });

  app.get(
    "/ws",
    { websocket: true },
    (connection) => {
      registerSocket(connection.socket);

      connection.socket.on("message", async (raw: Buffer) => {
        const message = JSON.parse(raw.toString()) as {
          type: "ORDER_CREATED" | "ORDER_UPDATED";
          payload: unknown;
        };

        if (message.type === "ORDER_CREATED" || message.type === "ORDER_UPDATED") {
          await applyOrderOperation(syncOperationSchema.parse(message.payload));
          connection.socket.send(
            JSON.stringify({
              type: "ACK",
              payload: {
                at: new Date().toISOString(),
                messageType: message.type,
              },
            }),
          );
        }
      });
    },
  );

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
};
