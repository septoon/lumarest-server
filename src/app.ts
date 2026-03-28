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
        await tx.menuItem.deleteMany();
        await tx.category.deleteMany();
        await tx.department.deleteMany();

        await tx.department.createMany({
          data: body.departments,
        });

        await tx.category.createMany({
          data: body.categories,
        });

        await tx.menuItem.createMany({
          data: body.menuItems,
        });
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
