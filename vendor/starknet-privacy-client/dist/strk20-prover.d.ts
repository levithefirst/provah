import type { SignerInterface, STRK20_CALL_AND_PROOF } from "starknet";
import type { DiscoveryProviderInterface, PrivateTransfersBuilder, ProofProviderInterface, StarknetAddress } from "@starkware-libs/starknet-privacy-sdk";
import type { PrivacyStorage, Strk20Action, Strk20Prover } from "./interfaces.js";
/**
 * The node `simulate` needs, taken from the builder's own signature so it matches the core SDK's
 * `starknet` version (which can differ from the client's, making a bare `ProviderInterface` import
 * incompatible).
 */
type NodeProvider = Parameters<PrivateTransfersBuilder["simulate"]>[0]["node"];
/**
 * Dependencies for a {@link CorePrivateTransfersProver}. The `passphrase` is the viewing-key source
 * the prover owns — it is derived (salted + iterated) into the viewing key internally, never surfaced
 * to the caller. The rest is what the core `PrivateTransfers` needs; `node` is what simulate reads
 * through for fee estimation, and `storage` persists the note registry across transactions.
 */
export interface CorePrivateTransfersProverConfig {
    signer: SignerInterface;
    address: StarknetAddress;
    passphrase: string;
    node: NodeProvider;
    discovery: DiscoveryProviderInterface;
    prover: ProofProviderInterface;
    poolContractAddress: StarknetAddress;
    shadowAccountAnonymizerAddress: StarknetAddress;
    storage: PrivacyStorage;
}
/**
 * The default {@link Strk20Prover}: it proves through a core `PrivateTransfers`, translating each
 * {@link Strk20Action} into the core builder's operations. The viewing key is derived from the
 * passphrase inside this class, so no caller ever handles it. Before proving, the stored note
 * registry is loaded (so spends see prior notes); after a real (non-simulate) proof it is saved back.
 */
export declare class CorePrivateTransfersProver implements Strk20Prover {
    private readonly transfers;
    private readonly node;
    private readonly storage;
    constructor(config: CorePrivateTransfersProverConfig);
    partialCommitment(dappName: string): Promise<bigint>;
    prove(actions: Strk20Action[], simulate?: boolean): Promise<STRK20_CALL_AND_PROOF>;
}
export {};
//# sourceMappingURL=strk20-prover.d.ts.map