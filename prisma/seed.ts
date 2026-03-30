import { PrismaClient, PrinterScope, Role, Station } from "@prisma/client";

const prisma = new PrismaClient();

const now = new Date("2026-03-28T12:00:00.000Z");
const adminPin = process.env.ADMIN_PIN ?? "0000";

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.department.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.restaurantTable.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.user.deleteMany();

  await prisma.zone.createMany({
    data: [
      { id: "zone-main", name: "Зал", createdAt: now },
      { id: "zone-terrace", name: "Улица", createdAt: now },
    ],
  });

  await prisma.restaurantTable.createMany({
    data: [
      { id: "table-1", name: "T1", seats: 4, zoneId: "zone-main", createdAt: now },
      { id: "table-2", name: "T2", seats: 4, zoneId: "zone-main", createdAt: now },
      { id: "table-3", name: "T3", seats: 2, zoneId: "zone-main", createdAt: now },
      { id: "table-4", name: "T4", seats: 6, zoneId: "zone-terrace", createdAt: now },
    ],
  });

  await prisma.department.createMany({
    data: [
      { id: "dept-bar", name: "Бар", sortOrder: 1, createdAt: now },
      { id: "dept-kitchen", name: "Кухня", sortOrder: 2, createdAt: now },
      { id: "dept-grill", name: "Мангал", sortOrder: 3, createdAt: now },
    ],
  });

  await prisma.category.createMany({
    data: [
      {
        id: "cat-coffee",
        departmentId: "dept-bar",
        name: "Кофе",
        color: "#c96f3f",
        sortOrder: 1,
        createdAt: now,
      },
      {
        id: "cat-tea",
        departmentId: "dept-bar",
        name: "Чай",
        color: "#5e9f49",
        sortOrder: 2,
        createdAt: now,
      },
      {
        id: "cat-salads",
        departmentId: "dept-kitchen",
        name: "Салаты",
        color: "#f2b24f",
        sortOrder: 1,
        createdAt: now,
      },
      {
        id: "cat-dessert",
        departmentId: "dept-kitchen",
        name: "Десерты",
        color: "#8b5cf6",
        sortOrder: 2,
        createdAt: now,
      },
      {
        id: "cat-grill",
        departmentId: "dept-grill",
        name: "Гриль",
        color: "#d35d4b",
        sortOrder: 1,
        createdAt: now,
      },
    ],
  });

  await prisma.menuItem.createMany({
    data: [
      {
        id: "menu-espresso",
        categoryId: "cat-coffee",
        name: "Эспрессо",
        description: "Классический шот эспрессо",
        sku: "BAR-001",
        priceCents: 18000,
        unit: "штуки",
        sortOrder: 1,
        station: Station.BAR,
        available: true,
        createdAt: now,
      },
      {
        id: "menu-cappuccino",
        categoryId: "cat-coffee",
        name: "Капучино",
        description: "Молочный кофе",
        sku: "BAR-002",
        priceCents: 24000,
        unit: "штуки",
        sortOrder: 2,
        station: Station.BAR,
        available: true,
        createdAt: now,
      },
      {
        id: "menu-green-tea",
        categoryId: "cat-tea",
        name: "Зеленый чай",
        description: "Чайник 500 мл",
        sku: "BAR-003",
        priceCents: 22000,
        unit: "штуки",
        sortOrder: 1,
        station: Station.BAR,
        available: true,
        createdAt: now,
      },
      {
        id: "menu-burger",
        categoryId: "cat-salads",
        name: "Салат с курицей",
        description: "Свежий микс салата и курица",
        sku: "KIT-001",
        priceCents: 69000,
        unit: "штуки",
        sortOrder: 1,
        station: Station.KITCHEN,
        available: true,
        createdAt: now,
      },
      {
        id: "menu-cheesecake",
        categoryId: "cat-dessert",
        name: "Чизкейк",
        description: "Подается с соусом",
        sku: "KIT-002",
        priceCents: 32000,
        unit: "штуки",
        sortOrder: 1,
        station: Station.KITCHEN,
        available: true,
        createdAt: now,
      },
      {
        id: "menu-kebab",
        categoryId: "cat-grill",
        name: "Шашлык из свинины",
        description: "300 г",
        sku: "GRL-001",
        priceCents: 99000,
        unit: "штуки",
        sortOrder: 1,
        station: Station.GRILL,
        available: true,
        createdAt: now,
      },
    ],
  });

  await prisma.printer.createMany({
    data: [
      {
        id: "printer-bar",
        name: "Bar Ethernet",
        ipAddress: "192.168.0.41",
        scope: PrinterScope.BAR,
        createdAt: now,
      },
      {
        id: "printer-kitchen",
        name: "Kitchen Ethernet",
        ipAddress: "192.168.0.42",
        scope: PrinterScope.KITCHEN,
        createdAt: now,
      },
      {
        id: "printer-precheck",
        name: "Receipt Ethernet",
        ipAddress: "192.168.0.50",
        scope: PrinterScope.PRECHECK,
        createdAt: now,
      },
    ],
  });

  await prisma.user.createMany({
    data: [
      {
        id: "user-admin",
        name: "Виктория",
        role: Role.ADMIN,
        pin: adminPin,
        createdAt: now,
      },
      {
        id: "user-alice",
        name: "Alice Waiter",
        role: Role.WAITER,
        pin: "1111",
        createdAt: now,
      },
      {
        id: "user-bob",
        name: "Bob Waiter",
        role: Role.WAITER,
        pin: "2222",
        createdAt: now,
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
