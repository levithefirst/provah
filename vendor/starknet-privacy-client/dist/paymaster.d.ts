/**
 * Paymaster port for privacy submissions, plus the default AVNU adapter.
 *
 * A submission through a paymaster is a two-call flow (SNIP-29-style JSON-RPC, mirrored from the
 * reference in `demo/src/paymaster.ts`):
 *   1. {@link Paymaster.buildTransaction} quotes the fee as a {@link PaymasterFeeAction} — a `withdraw`
 *      (to the paymaster, for the fee token/amount) the caller adds to the action chain before proving.
 *      For an `invokeAndApplyAction` (deposits needing `approve`) it also returns `typedData` to sign.
 *   2. {@link Paymaster.executeTransaction} takes the proven `apply_actions` call + proof (+ the signed
 *      invoke for the `invokeAndApplyAction` case) and broadcasts it, returning the tx hash.
 *
 * `Paymaster` is injected into `SdkWallet` (via its constructor config), so a dapp can swap providers
 * or a fake in tests; {@link AvnuPaymaster} is the shipped default.
 */
import type { Call, Signature, TypedData } from "starknet";
/** Fee-payment mode. `sponsored_private` funds the fee from the pool via a fee-token withdrawal. */
export type PaymasterFeeMode = {
    mode: "sponsored_private";
    poolFeeToken: string;
    tip?: "low" | "normal" | "high";
};
/** The fee quote: a `withdraw` of `amount` `token` to the paymaster `recipient`, added to the chain. */
export type PaymasterFeeAction = {
    type: "withdraw";
    recipient: string;
    token: string;
    amount: string;
};
/** A Starknet call in the paymaster's wire shape (selector + raw calldata). */
export type PaymasterCall = {
    to: string;
    selector: string;
    calldata: string[];
};
/** `buildTransaction` request: apply actions on the pool, optionally with an invoke that needs approvals. */
export type PaymasterBuild = {
    kind: "applyAction";
    poolAddress: string;
} | {
    kind: "invokeAndApplyAction";
    poolAddress: string;
    userAddress: string;
    calls: PaymasterCall[];
};
/** `buildTransaction` result: the fee quote, plus (invoke case) the typed data the user must sign. */
export type PaymasterQuote = {
    feeAction: PaymasterFeeAction;
    typedData?: TypedData;
};
/** `executeTransaction` request: the proven apply-actions call + proof, plus the signed invoke if any. */
export type PaymasterExecute = {
    kind: "applyAction";
    applyActionsCall: PaymasterCall;
    proof: string;
    proofFacts: string[];
} | {
    kind: "invokeAndApplyAction";
    applyActionsCall: PaymasterCall;
    proof: string;
    proofFacts: string[];
    userAddress: string;
    typedData: TypedData;
    signature: string[];
};
/** The paymaster the client drives for non-strk20 submissions. */
export interface Paymaster {
    /** Quote the fee (and, for the invoke case, the typed data to sign) for the given transaction. */
    buildTransaction(build: PaymasterBuild): Promise<PaymasterQuote>;
    /** Broadcast the proven transaction through the paymaster; resolves to the tx hash. */
    executeTransaction(execute: PaymasterExecute): Promise<{
        transactionHash: string;
    }>;
}
/** Convert a starknet.js {@link Call} into the paymaster wire shape. */
export declare function toPaymasterCall(call: Call): PaymasterCall;
/**
 * Normalize a starknet.js {@link Signature} to the 0x-hex `FELT[]` the SNIP-29/AVNU paymaster expects.
 * `stark.signatureToHexArray` yields hex for both array and Weierstrass inputs; stringifying an array
 * directly would emit decimal felts, which AVNU rejects.
 */
export declare function normalizeSignature(signature: Signature): string[];
export interface AvnuPaymasterOptions {
    /** Paymaster JSON-RPC endpoint. */
    url: string;
    /** Fee mode (mode + pool fee token + tip) applied to every request. */
    feeMode: PaymasterFeeMode;
    /** Optional AVNU API key, sent as the `x-paymaster-api-key` header. */
    apiKey?: string;
    /** Injectable fetch (defaults to the global). */
    fetch?: typeof fetch;
}
/** The default {@link Paymaster}: a thin JSON-RPC client for the AVNU privacy paymaster. */
export declare class AvnuPaymaster implements Paymaster {
    private readonly options;
    private readonly parameters;
    private readonly fetchFn;
    constructor(options: AvnuPaymasterOptions);
    buildTransaction(build: PaymasterBuild): Promise<PaymasterQuote>;
    executeTransaction(execute: PaymasterExecute): Promise<{
        transactionHash: string;
    }>;
    private rpc;
}
//# sourceMappingURL=paymaster.d.ts.map