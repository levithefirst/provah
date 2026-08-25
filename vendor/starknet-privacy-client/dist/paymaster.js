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
import { hash, num, stark } from "starknet";
import { safeStringify } from "./json.js";
/** Convert a starknet.js {@link Call} into the paymaster wire shape. */
export function toPaymasterCall(call) {
    return {
        to: call.contractAddress,
        selector: hash.getSelectorFromName(call.entrypoint),
        // Calldata may arrive as numbers/bigints; the wire needs 0x-hex FELTs (num.toHex, not String,
        // which would emit decimal — the same class of bug as the signature felts).
        calldata: (call.calldata ?? []).map((item) => num.toHex(item)),
    };
}
/**
 * Normalize a starknet.js {@link Signature} to the 0x-hex `FELT[]` the SNIP-29/AVNU paymaster expects.
 * `stark.signatureToHexArray` yields hex for both array and Weierstrass inputs; stringifying an array
 * directly would emit decimal felts, which AVNU rejects.
 */
export function normalizeSignature(signature) {
    return stark.signatureToHexArray(signature);
}
/** The default {@link Paymaster}: a thin JSON-RPC client for the AVNU privacy paymaster. */
export class AvnuPaymaster {
    options;
    parameters;
    fetchFn;
    constructor(options) {
        this.options = options;
        this.parameters = {
            version: "0x1",
            fee_mode: {
                mode: options.feeMode.mode,
                pool_fee_token: options.feeMode.poolFeeToken,
                ...(options.feeMode.tip !== undefined ? { tip: options.feeMode.tip } : {}),
            },
        };
        this.fetchFn = options.fetch ?? fetch;
    }
    async buildTransaction(build) {
        const transaction = build.kind === "applyAction"
            ? { type: "apply_action", apply_action: { pool_address: build.poolAddress } }
            : {
                type: "invoke_and_apply_action",
                apply_action: { pool_address: build.poolAddress },
                invoke: { user_address: build.userAddress, calls: build.calls },
            };
        const result = await this.rpc("paymaster_buildTransaction", { transaction, parameters: this.parameters });
        return { feeAction: result.fee_action, typedData: result.typed_data };
    }
    async executeTransaction(execute) {
        const applyAction = {
            apply_actions_call: execute.applyActionsCall,
            proof: execute.proof,
            proof_facts: execute.proofFacts,
        };
        const transaction = execute.kind === "applyAction"
            ? { type: "apply_action", apply_action: applyAction }
            : {
                type: "invoke_and_apply_action",
                apply_action: applyAction,
                invoke: {
                    user_address: execute.userAddress,
                    typed_data: execute.typedData,
                    signature: execute.signature,
                },
            };
        const result = await this.rpc("paymaster_executeTransaction", {
            transaction,
            parameters: this.parameters,
        });
        return { transactionHash: result.transaction_hash };
    }
    async rpc(method, params) {
        const headers = { "Content-Type": "application/json" };
        if (this.options.apiKey)
            headers["x-paymaster-api-key"] = this.options.apiKey;
        const response = await this.fetchFn(this.options.url, {
            method: "POST",
            headers,
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const json = (await response.json());
        if (json.error) {
            const { data } = json.error;
            let detail = "";
            if (typeof data === "string")
                detail = `: ${data}`;
            else if (data && typeof data === "object") {
                const execError = data.execution_error;
                detail = `: ${execError ?? safeStringify(data)}`;
            }
            throw new Error(`Paymaster ${method}: ${json.error.message} (code: ${json.error.code})${detail}`);
        }
        if (json.result === undefined) {
            throw new Error(`Paymaster ${method}: malformed response (neither 'result' nor 'error')`);
        }
        return json.result;
    }
}
//# sourceMappingURL=paymaster.js.map