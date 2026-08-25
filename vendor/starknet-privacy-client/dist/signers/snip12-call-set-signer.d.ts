/**
 * SNIP-12 `CallSet` signer ("Legacy" SN wallets, e.g. Fordefi).
 *
 * A `SignerInterface` whose `signTransaction` authorizes the account's invocation (any operation —
 * deposit / transfer / withdraw / setup …) by signing the SNIP-12 (revision 1) `CallSet` message the
 * privacy pool verifies on-chain — NOT the synthetic proving transaction (a wallet won't sign that).
 * See the README "Account signers (native-wallet support)" section. The pool's OR-fallback checks
 * `is_valid_signature(compute_call_set_hash(account, calls), sig)`
 * (packages/privacy/src/snip12.cairo), so the hash here is byte-compatible with that Cairo function.
 *
 * The message hash is built with direct `poseidonHashMany` (like the screening signer), deliberately
 * NOT via starknet.js `typedData.getMessageHash`: the SNIP-12 domain `version` is the numeric felt
 * `1` (the on-chain verifier's convention), whereas typed-data encoding would treat the declared
 * `shortstring` field as ASCII. The type hashes below are pinned, so an encodeType edit can't
 * silently shift the digest — the cross-layer golden vector (test_snip12.cairo /
 * snip12-call-set-signer.test.ts) reproduces this exact value on both sides.
 *
 * SNIP-12 revision-1 message hash:
 *   poseidon([
 *     shortstring("StarkNet Message"),
 *     domain_hash,        // poseidon(STARKNET_DOMAIN_TYPE_HASH, "CallSet", 1, chain_id, 1)
 *     account_address,    // SNIP-12 "account" slot = the signing user account
 *     call_set_hash,      // poseidon(CALL_SET_TYPE_HASH, poseidon([hash(call) …]), poseidon(additional_data))
 *   ])
 * where hash(call) = poseidon(CALL_TYPE_HASH, to, selector, poseidon(calldata)).
 */
import type { BigNumberish, Call, DeclareSignerDetails, DeployAccountSignerDetails, InvocationsSignerDetails, Signature, SignerInterface, TypedData } from "starknet";
/**
 * Recompute the SNIP-12 `CallSet` message hash the privacy pool verifies, for `calls` authorized by
 * `accountAddress` on the given `chainId` (the Starknet chain id felt). The off-chain golden oracle —
 * must equal `privacy::snip12::compute_call_set_hash(accountAddress, calls, additionalData)` under
 * the same chain id. `additionalData` is opaque extra data bound into the message; the privacy pool
 * passes it empty.
 */
export declare function computeCallSetHash(accountAddress: BigNumberish, calls: Call[], chainId: BigNumberish, additionalData?: BigNumberish[]): bigint;
/** Signs a precomputed SNIP-12 message hash, yielding the depositor account's STARK signature. */
export type CallSetSignFn = (messageHash: bigint) => Signature | Promise<Signature>;
export interface Snip12CallSetSignerOptions {
    /** The signing user account address — the SNIP-12 "account" slot the message binds. */
    accountAddress: BigNumberish;
    /** Starknet chain id felt (e.g. `constants.StarknetChainId.SN_SEPOLIA`). */
    chainId: BigNumberish;
    /**
     * Produces the account's STARK signature over the SNIP-12 `CallSet` message hash. For a server key
     * this is `(h) => ec.starkCurve.sign(num.toHex(h), privateKey)`; for a wallet it wraps the wallet's
     * SNIP-12 typed-data signing. (The hash is provided pre-computed so all transports agree on it.)
     */
    sign: CallSetSignFn;
    /**
     * Opaque extra data bound into the signed `CallSet` message (e.g. a nonce). Defaults to empty,
     * matching the privacy pool, which passes no `additional_data`.
     */
    additionalData?: BigNumberish[];
}
/**
 * Plugs into `createPrivateTransfers({ account: { address, signer } })` and `SdkWallet`.
 * `signTransaction` authorizes the privacy operation (the SNIP-12 `CallSet`); `signMessage` signs
 * arbitrary SNIP-12 typed data with the same account key — the paymaster's deposit flow uses it to
 * authorize the `approve` that rides in the user-signed outside execution. The remaining
 * `SignerInterface` methods are unsupported.
 */
export declare class Snip12CallSetSigner implements SignerInterface {
    private readonly options;
    constructor(options: Snip12CallSetSignerOptions);
    signTransaction(calls: Call[], _details: InvocationsSignerDetails): Promise<Signature>;
    getPubKey(): Promise<string>;
    /**
     * Signs a SNIP-12 typed-data message (revision from the message's own domain) with the account key
     * — the legacy SN wallet's native `signMessage`. The privacy paymaster hands this the outside
     * execution wrapping a deposit's `approve` for the user to authorize.
     */
    signMessage(message: TypedData, accountAddress: string): Promise<Signature>;
    signDeclareTransaction(_details: DeclareSignerDetails): Promise<Signature>;
    signDeployAccountTransaction(_details: DeployAccountSignerDetails): Promise<Signature>;
}
//# sourceMappingURL=snip12-call-set-signer.d.ts.map