import type { AnyCircuitElement } from "circuit-json";

export const CIRCUIT_JSON = "dist/index/circuit.json";

export type Circuit = AnyCircuitElement[];
export type ElementOf<T extends AnyCircuitElement["type"]> = Extract<
  AnyCircuitElement,
  { type: T }
>;

export const loadCircuit = async (
  path: string = CIRCUIT_JSON,
): Promise<Circuit> => {
  const data: unknown = await Bun.file(path).json();
  if (!Array.isArray(data))
    throw new Error(`${path}: not a circuit JSON array`);
  return data as Circuit;
};

export const elementsOf = <T extends AnyCircuitElement["type"]>(
  circuit: Circuit,
  type: T,
): ElementOf<T>[] => circuit.filter((e): e is ElementOf<T> => e.type === type);
