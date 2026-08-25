import { Contract, num } from "starknet";
import { ShadowAccountAnonymizerABI } from "@starkware-libs/starknet-privacy-sdk";
import { createPrivacyBuilder } from "./builder.js";
import { toStarknetCall } from "./calls.js";
import { resolveShadowAccounts } from "./shadow-accounts.js";
/**
 * The dapp client. Holds the injected wallet + read context (node + shadow account anonymizer) and
 * drives the wallet seam. A native get-starknet v6 wallet satisfies {@link PrivacyWallet} directly,
 * so `submit` passes straight through to its strk20 methods; an `SdkWallet` (upstack) makes the same
 * seam calls but proves + submits through the core SDK + paymaster. The operation builder is added
 * upstack over this low-level entry point.
 */
class PrivacyClientImpl {
    config;
    anonymizer;
    constructor(config) {
        this.config = config;
        this.anonymizer = new Contract({
            abi: ShadowAccountAnonymizerABI,
            address: num.toHex(config.shadowAccountAnonymizerAddress),
            providerOrAccount: config.node,
        }).typedv2(ShadowAccountAnonymizerABI);
    }
    async submit(actions, options = {}) {
        const { wallet } = this.config;
        const { preCalls = [], postCalls = [], simulate = false } = options;
        // Fast path: nothing wraps the invoke and we are broadcasting → the combined prepare+submit.
        if (preCalls.length === 0 && postCalls.length === 0 && !simulate) {
            return wallet.strk20InvokeTransaction(actions);
        }
        const { call, proof } = await wallet.strk20PrepareInvoke(actions, simulate);
        const calls = [...preCalls, toStarknetCall(call), ...postCalls];
        // simulate: estimate the assembled invoke on the node (empty proof) for a fee quote/preview.
        return simulate ? wallet.estimateInvokeFee(calls) : wallet.executeWithProof(calls, proof);
    }
    build() {
        return createPrivacyBuilder(this.config.userAddress, this.submit.bind(this), (dappName, range) => this.resolveShadowAccounts(dappName, range));
    }
    async resolveShadowAccounts(dappName, range = {}) {
        return resolveShadowAccounts({
            anonymizer: this.anonymizer,
            partialCommitment: await this.config.wallet.partialCommitment(dappName),
            range,
        });
    }
}
/**
 * Creates a dapp client for Starknet privacy from a {@link PrivacyWallet} the dapp constructs — a
 * get-starknet v6 wallet directly, or (upstack) an `SdkWallet` over a signer.
 */
export function createPrivacyClient(config) {
    return new PrivacyClientImpl(config);
}
//# sourceMappingURL=client.js.map