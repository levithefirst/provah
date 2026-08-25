import type { BigNumberish } from "starknet";
import type { ViewingKeyProvider } from "@starkware-libs/starknet-privacy-sdk";
/**
 * Derives a viewing key from a user passphrase. The passphrase is salted with the account `address`
 * — so the same passphrase yields a different key per account, defeating shared rainbow tables — and
 * folded through {@link KDF_ROUNDS} Poseidon rounds (each re-mixing the salt) to make brute-forcing
 * costly. The result is a canonical viewing key (a non-zero scalar below the Stark curve half-order),
 * which the privacy pool accepts directly.
 */
export declare function deriveViewingKey(passphrase: string, address: BigNumberish): bigint;
/**
 * A {@link ViewingKeyProvider} backed by {@link deriveViewingKey}. Derivation is lazy and memoized —
 * the (relatively costly) KDF runs on first use, not at construction, and the result is cached in
 * memory. This is the default viewing-key source for the SDK-backed prover: recoverable from the
 * passphrase, never written to disposable storage.
 */
export declare function passphraseViewingKeyProvider(passphrase: string, address: BigNumberish): ViewingKeyProvider;
//# sourceMappingURL=viewing-key.d.ts.map