import type { Call, SignerInterface, STRK20_CALL_AND_PROOF, STRK20_PROOF } from "starknet";
import type { StarknetAddress } from "@starkware-libs/starknet-privacy-sdk";
import type { Paymaster } from "./paymaster.js";
import type { PrivacyWallet, Strk20Action, Strk20Prover } from "./interfaces.js";
/**
 * Dependencies for an {@link SdkWallet}: the {@link Strk20Prover} that proves actions (and owns the
 * viewing key), the {@link Paymaster} that sponsors + broadcasts the fee, the privacy pool address
 * the paymaster applies actions against, and the user's `signer` + `userAddress` used to authorize
 * the public `approve` a deposit needs (the "regular" paymaster flow).
 */
export interface SdkWalletConfig {
    prover: Strk20Prover;
    paymaster: Paymaster;
    poolContractAddress: StarknetAddress;
    signer: SignerInterface;
    userAddress: StarknetAddress;
}
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
export declare class SdkWallet implements PrivacyWallet {
    private readonly config;
    constructor(config: SdkWalletConfig);
    partialCommitment(dappName: string): Promise<bigint>;
    strk20PrepareInvoke(actions: Strk20Action[], simulate?: boolean): Promise<STRK20_CALL_AND_PROOF>;
    strk20InvokeTransaction(actions: Strk20Action[]): Promise<{
        transaction_hash: string;
    }>;
    executeWithProof(_calls: Call[], _proof?: STRK20_PROOF): Promise<{
        transaction_hash: string;
    }>;
    estimateInvokeFee(): Promise<never>;
}
//# sourceMappingURL=sdk-wallet.d.ts.map