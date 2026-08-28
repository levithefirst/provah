import { Account, RpcProvider } from "starknet";
import { STARKNET_RPC_URL, STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY } from "./config";

export function provider(): RpcProvider {
  return new RpcProvider({ nodeUrl: STARKNET_RPC_URL });
}

/**
 * Prova's own operating account — pays gas for deploying/administering
 * ProvaPass. Standard OpenZeppelin single-signer account (no guardian),
 * which validates plain [r, s] signatures — starknet.js's default signer.
 */
export function operatorAccount(): Account {
  if (!STARKNET_ACCOUNT_ADDRESS || !STARKNET_PRIVATE_KEY) {
    throw new Error("STARKNET_ACCOUNT_ADDRESS / STARKNET_PRIVATE_KEY not configured");
  }
  return new Account({
    provider: provider(),
    address: STARKNET_ACCOUNT_ADDRESS,
    signer: STARKNET_PRIVATE_KEY,
    cairoVersion: "1",
  });
}

// Serializes every operator-account transaction (claims, admin campaign
// creation) within this process. Account.execute() reads the account's
// current nonce from the chain at call time rather than tracking it
// locally, so two genuinely concurrent submissions (two claims landing on
// the same warm serverless instance in the same instant) can both read the
// same nonce and one reverts on-chain as "nonce too low" — wasting the gas
// Prova is sponsoring and leaving that claim looking failed when it wasn't
// the user's fault. This queues same-process submissions one at a time so
// each sees the previous one's nonce increment before it reads its own.
// Residual risk, documented rather than silently assumed away: Vercel can
// route concurrent requests to separate serverless instances, and a mutex
// in one instance's memory can't serialize across instances — closing that
// fully needs a real cross-instance nonce manager (e.g. a DB-backed lock),
// out of scope for this pass. See STATUS.md "Pre-demo QA".
let operatorQueue: Promise<unknown> = Promise.resolve();
export function withOperatorLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = operatorQueue.then(fn, fn);
  // Swallow the error here so one failed submission doesn't wedge the queue
  // for everyone after it — the real rejection still propagates to this
  // call's own caller via `result`.
  operatorQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
