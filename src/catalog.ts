import { prisma } from "./prisma";

export const loadBootstrap = async () => {
  const [departments, categories, menuItems, printers, tables, users, zones] = await Promise.all([
    prisma.department.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.menuItem.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.printer.findMany(),
    prisma.restaurantTable.findMany(),
    prisma.user.findMany(),
    prisma.zone.findMany(),
  ]);

  return {
    departments: departments.map((item) => ({
      id: item.id,
      name: item.name,
      sortOrder: item.sortOrder,
      updatedAt: item.updatedAt.toISOString(),
    })),
    categories: categories.map((item) => ({
      id: item.id,
      departmentId: item.departmentId,
      name: item.name,
      color: item.color,
      sortOrder: item.sortOrder,
      updatedAt: item.updatedAt.toISOString(),
    })),
    menuItems: menuItems.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description ?? undefined,
      sku: item.sku ?? undefined,
      priceCents: item.priceCents,
      unit: item.unit,
      sortOrder: item.sortOrder,
      station: item.station,
      available: item.available,
      updatedAt: item.updatedAt.toISOString(),
    })),
    printers: printers.map((item) => ({
      id: item.id,
      name: item.name,
      ipAddress: item.ipAddress,
      scope: item.scope,
      updatedAt: item.updatedAt.toISOString(),
    })),
    tables: tables.map((item) => ({
      id: item.id,
      name: item.name,
      zoneId: item.zoneId,
      seats: item.seats,
      updatedAt: item.updatedAt.toISOString(),
    })),
    users: users.map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      pin: item.pin,
      updatedAt: item.updatedAt.toISOString(),
    })),
    zones: zones.map((item) => ({
      id: item.id,
      name: item.name,
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
};
