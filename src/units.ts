export type MeasurementUnit = "штуки" | "литры" | "граммы" | "килограммы";

const roundToScale = (value: number, scale: number) => {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
};

const isMultipleOf = (value: number, step: number) =>
  Math.abs(value / step - Math.round(value / step)) < 1e-9;

export const normalizeMeasurementUnit = (unit?: string): MeasurementUnit => {
  switch ((unit ?? "").trim().toLowerCase()) {
    case "литры":
    case "литр":
    case "л":
      return "литры";
    case "граммы":
    case "грамм":
    case "г":
      return "граммы";
    case "килограммы":
    case "килограмм":
    case "кг":
      return "килограммы";
    default:
      return "штуки";
  }
};

export const isValidQuantityForUnit = (quantity: number, unit?: string) => {
  const normalizedUnit = normalizeMeasurementUnit(unit);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return false;
  }

  if (normalizedUnit === "штуки") {
    return isMultipleOf(quantity, 0.5);
  }

  return Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 1e-9;
};

export const normalizeQuantityForUnit = (quantity: number, unit?: string) => {
  const normalizedUnit = normalizeMeasurementUnit(unit);

  if (normalizedUnit === "штуки") {
    return roundToScale(Math.round(quantity * 2) / 2, 1);
  }

  return roundToScale(quantity, 3);
};

export const calculateLineTotalCents = (priceCents: number, quantity: number) => {
  const quantityMillis = Math.round(roundToScale(quantity, 3) * 1000);
  const rawCents = Math.round((priceCents * quantityMillis) / 1000);
  return Math.round(rawCents / 100) * 100;
};
