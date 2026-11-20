import { divideRounded } from "@nexora/contracts";

export interface CostLayer {
  id: string;
  quantity: bigint;
  value: bigint;
}
export interface CostAllocation {
  entry_id: string;
  quantity: bigint;
  value: bigint;
}

/** Quantities use the product's base unit; values use functional-currency minor units. */
export function issueStockCost(method: "fifo" | "weighted_average", quantity: bigint, layers: readonly CostLayer[]) {
  if (quantity <= 0n) throw new RangeError("Issue quantity must be positive.");
  const available = layers.reduce((sum, layer) => sum + layer.quantity, 0n);
  const carrying = layers.reduce((sum, layer) => sum + layer.value, 0n);
  if (layers.some((layer) => layer.quantity < 0n || layer.value < 0n || (layer.quantity === 0n && layer.value !== 0n)))
    throw new RangeError("Stock costing evidence is inconsistent.");
  if (quantity > available) throw new RangeError("Insufficient posted stock in this warehouse.");
  if (method === "weighted_average") {
    const value = quantity === available ? carrying : divideRounded(carrying * quantity, available);
    if (value <= 0n || (value >= carrying && quantity < available))
      throw new RangeError(
        "The issue leaves a quantity with no functional-currency value. Review quantity or valuation.",
      );
    const allocations: CostAllocation[] = [];
    return { value, allocations };
  }
  let remaining = quantity,
    value = 0n;
  const allocations: CostAllocation[] = [];
  for (const layer of layers) {
    if (!remaining) break;
    if (!layer.quantity) continue;
    const taken = remaining < layer.quantity ? remaining : layer.quantity;
    const amount = taken === layer.quantity ? layer.value : divideRounded(layer.value * taken, layer.quantity);
    if (amount <= 0n || (amount >= layer.value && taken < layer.quantity))
      throw new RangeError("The issue cannot be represented at the functional-currency precision.");
    allocations.push({ entry_id: layer.id, quantity: taken, value: amount });
    remaining -= taken;
    value += amount;
  }
  return { value, allocations };
}
