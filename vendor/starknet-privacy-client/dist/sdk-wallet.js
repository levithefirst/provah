import { cairo, num } from "starknet";
import { toStarknetCall } from "./calls.js";
import { normalizeSignature, toPaymasterCall } from "./paymaster.js";
/**
 * The non-native {@link PrivacyWallet} for wallets that are not get-starknet v6 strk20 wallets (EVM /
 * legacy-SN, via a CallSet signer inside the prover). It proves through the injected prover and
 * broadcasts through the paymaster so the user never needs to hold the fee token.
 *
 * `strk20InvokeTransaction` quotes the fee, folds it in as a `withdraw` so the proof covers it,
 * proves, then hands the proven call to the paymaster. It picks the flow from the actions: with no
 * deposit it is the private `apply_action`; with a deposit it is the "regular" `invoke_and_apply_action`,
 * because a deposit needs an ERC-20 `approve` that must run as the user (the token owner) — under
 * `apply_action` the executing account is the paymaster, not the user, so the approve rides in the
 * paymaster's user-signed invoke instead.
 *
 * `executeWithProof` / `estimateInvokeFee` — the client's pre-proved surrounding-calls / fee-estimate
 * paths — are not used on this path and reject.
 */
export class SdkWallet {
    config;
    constructor(config) {
        this.config = config;
    }
    partialCommitment(dappName) {
        return this.config.prover.partialCommitment(dappName);
    }
    strk20PrepareInvoke(actions, simulate) {
        return this.config.prover.prove(actions, simulate);
    }
    async strk20InvokeTransaction(actions) {
        const { prover, paymaster, poolContractAddress, signer, userAddress } = this.config;
        const poolAddress = String(poolContractAddress);
        // A deposit needs a user-signed `approve`, so switch to the regular (invoke_and_apply_action)
        // flow; otherwise the private apply_action flow suffices.
        const approveCalls = actions
            .filter((action) => action.type === "deposit")
            .map((deposit) => approveCall(poolAddress, deposit.token, deposit.amount));
        const build = approveCalls.length
            ? {
                kind: "invokeAndApplyAction",
                poolAddress,
                userAddress: String(userAddress),
                calls: approveCalls,
            }
            : { kind: "applyAction", poolAddress };
        // Quote the fee. TODO: once AVNU exposes it, run a simulate pass to get an exact quote instead
        // of this up-front estimate.
        const { feeAction, typedData } = await paymaster.buildTransaction(build);
        // The fee is always paid as a `withdraw` of the fee token to the paymaster — never an in-pool
        // `transfer`, even in the invoke_and_apply_action case — because pool fees are settled by
        // withdrawing out of the pool. Folding it into the proven action set makes the proof cover it.
        const feeWithdraw = {
            type: "withdraw",
            token: feeAction.token,
            amount: feeAction.amount,
            recipient: feeAction.recipient,
        };
        const { call, proof } = await prover.prove([...actions, feeWithdraw]);
        const base = {
            applyActionsCall: toPaymasterCall(toStarknetCall(call)),
            proof: proof.data,
            proofFacts: proof.proof_facts,
        };
        // A deposit rides the invoke_and_apply_action flow — the user signs the paymaster's outside
        // execution (the approve) via signMessage; everything else is a plain apply_action.
        const execute = approveCalls.length && typedData
            ? {
                kind: "invokeAndApplyAction",
                ...base,
                userAddress: String(userAddress),
                typedData,
                signature: normalizeSignature(await signer.signMessage(typedData, String(userAddress))),
            }
            : { kind: "applyAction", ...base };
        const { transactionHash } = await paymaster.executeTransaction(execute);
        return { transaction_hash: transactionHash };
    }
    executeWithProof(_calls, _proof) {
        return Promise.reject(new Error("SdkWallet: submitting a pre-proved call with surrounding calls is not supported; deposits " +
            "are handled automatically by strk20InvokeTransaction"));
    }
    estimateInvokeFee() {
        return Promise.reject(new Error("SdkWallet: fee estimation via the paymaster is not yet implemented"));
    }
}
/** The `approve(pool, amount)` a deposit needs, in the paymaster wire shape. */
function approveCall(poolAddress, token, amount) {
    const value = cairo.uint256(num.toBigInt(amount));
    const call = {
        contractAddress: token,
        entrypoint: "approve",
        calldata: [poolAddress, num.toHex(value.low), num.toHex(value.high)],
    };
    return toPaymasterCall(call);
}
//# sourceMappingURL=sdk-wallet.js.map