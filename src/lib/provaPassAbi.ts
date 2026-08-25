import sierra from "@/contracts/prova_pass.sierra.json";
import casm from "@/contracts/prova_pass.casm.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PROVA_PASS_SIERRA = sierra as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PROVA_PASS_CASM = casm as any;
export const PROVA_PASS_ABI = PROVA_PASS_SIERRA.abi;
