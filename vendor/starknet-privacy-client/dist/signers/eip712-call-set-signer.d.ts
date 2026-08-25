/**
 * EIP-712 `CallSet` signers (EVM wallets, for an `Eth712Account`).
 *
 * Two `SignerInterface` implementations, one per signature source, selected explicitly (by the factory
 * or the dapp) rather than by a runtime `sign` / `signTypedData` toggle:
 *   - {@link Eip712TypedDataSigner} — a browser wallet (MetaMask …) via `eth_signTypedData_v4`; the
 *     wallet is handed the EIP-712 typed data and returns a 65-byte `(r‖s‖v)` signature.
 *   - {@link Eip712HashSigner} — a raw secp256k1 key (server-side / tests) signing the message hash.
 *
 * Both authorize the account's invocation (any operation — deposit / transfer / withdraw / setup …) by
 * signing the EIP-712 `CallSet` message the Eth712Account verifies in `is_custom_signature_valid`
 * (earn-contracts eth_712_utils.cairo `get_call_set_hash`) — which the privacy pool calls for a capable
 * account. Both return the account's 6-felt signature `[r_high, r_low, s_high, s_low, v, evm_chain_id]`.
 *
 * Keccak-based and byte-compatible with browser wallets' `eth_signTypedData_v4`. The hashing and typed
 * data live in shared free functions ({@link computeCallSet712Hash}, {@link callSetTypedData}); the type
 * hashes + domain layout mirror earn-contracts exactly.
 *
 *   msg = keccak256( 0x19 0x01 || domainSeparator || hashStruct(CallSet) )
 *   domainSeparator = keccak256(EIP712_DOMAIN_TYPE_HASH, keccak256(snChainName), keccak256("2"),
 *                               evmChainId, account & 2^128-1)
 *   hashStruct(CallSet) = keccak256(CALL_SET_TYPE_HASH, hashCallArray(calls), hashFeltArray(additional_data))
 *   hashCall(call) = keccak256(CALL_TYPE_HASH, to, selector, keccak256(calldata felts))
 */
import type { BigNumberish, Call, DeclareSignerDetails, DeployAccountSignerDetails, InvocationsSignerDetails, Signature, SignerInterface, TypedData } from "starknet";
/**
 * EIP-712 type definitions for `eth_signTypedData_v4`. A wallet derives the type hashes from these
 * the same way, so `keccak(encodeType)` of each equals the pinned constants above — meaning the
 * wallet's v4 digest equals {@link computeCallSet712Hash}.
 */
export declare const CALL_SET_EIP712_TYPES: {
    readonly EIP712Domain: readonly [{
        readonly name: "name";
        readonly type: "string";
    }, {
        readonly name: "version";
        readonly type: "string";
    }, {
        readonly name: "chainId";
        readonly type: "uint256";
    }, {
        readonly name: "verifyingContract";
        readonly type: "address";
    }];
    readonly CallSet: readonly [{
        readonly name: "calls";
        readonly type: "Call[]";
    }, {
        readonly name: "additional_data";
        readonly type: "uint256[]";
    }];
    readonly Call: readonly [{
        readonly name: "address";
        readonly type: "uint256";
    }, {
        readonly name: "selector";
        readonly type: "uint256";
    }, {
        readonly name: "data";
        readonly type: "uint256[]";
    }];
};
/**
 * Recompute the EIP-712 `CallSet` message hash the Eth712Account verifies, for `calls` authorized by
 * `accountAddress` on `snChainName` (the Starknet chain name, e.g. "SN_SEPOLIA") with EIP-712 domain
 * `chainId = evmChainId`. `additionalData` is opaque extra data bound into the message (the privacy
 * pool passes it empty). The off-chain oracle — must equal
 * `starkware_accounts::eth_712_utils::get_call_set_hash`.
 */
export declare function computeCallSet712Hash(accountAddress: BigNumberish, calls: Call[], snChainName: string, evmChainId: BigNumberish, additionalData?: BigNumberish[]): bigint;
/** A SNIP-9 call as it appears in an OutsideExecution message: the selector is already hashed. */
export interface OutsideExecutionCall {
    address: BigNumberish;
    selector: BigNumberish;
    data: BigNumberish[];
}
/** The EIP-712 domain of an `OutsideExecution`, as carried in the typed data (fields used as given). */
export interface OutsideExecution712Domain {
    name: string;
    version: string;
    chainId: BigNumberish;
    verifyingContract: BigNumberish;
}
/**
 * Inputs to {@link computeOutsideExecution712Hash}. A struct rather than positional args because most
 * fields are same-typed felts, so an ordering mistake would silently produce a valid-but-wrong hash.
 */
export interface OutsideExecution712Input {
    domain: OutsideExecution712Domain;
    calls: OutsideExecutionCall[];
    caller: BigNumberish;
    nonce: BigNumberish;
    executeAfter: BigNumberish;
    executeBefore: BigNumberish;
}
/**
 * Recompute the EIP-712 `OutsideExecution` message hash the Eth712Account verifies in
 * `execute_from_outside_v2` — `starkware_accounts::eth_712_utils::get_outside_execution_hash`. The
 * domain is taken from the supplied `domain` (the caller/paymaster's typed data), not re-derived here:
 * the account re-derives and verifies it on-chain, so a wrong domain only yields a rejected signature.
 * `calls` carry raw (already-hashed) selectors, matching the SNIP-9 OutsideExecution the paymaster relays.
 */
export declare function computeOutsideExecution712Hash(input: OutsideExecution712Input): bigint;
/** The EIP-712 typed data of a `CallSet`; its `eth_signTypedData_v4` digest equals {@link computeCallSet712Hash}. */
export type CallSetTypedData = ReturnType<typeof callSetTypedData>;
/**
 * Builds the EIP-712 typed-data object for `eth_signTypedData_v4`. `verifyingContract` is the
 * account's low 128 bits (per earn-contracts); `chainId` is the source EVM chain id.
 */
export declare function callSetTypedData(accountAddress: BigNumberish, calls: Call[], snChainName: string, evmChainId: BigNumberish, additionalData?: BigNumberish[]): {
    types: {
        readonly EIP712Domain: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "version";
            readonly type: "string";
        }, {
            readonly name: "chainId";
            readonly type: "uint256";
        }, {
            readonly name: "verifyingContract";
            readonly type: "address";
        }];
        readonly CallSet: readonly [{
            readonly name: "calls";
            readonly type: "Call[]";
        }, {
            readonly name: "additional_data";
            readonly type: "uint256[]";
        }];
        readonly Call: readonly [{
            readonly name: "address";
            readonly type: "uint256";
        }, {
            readonly name: "selector";
            readonly type: "uint256";
        }, {
            readonly name: "data";
            readonly type: "uint256[]";
        }];
    };
    primaryType: "CallSet";
    domain: {
        name: string;
        version: string;
        chainId: string;
        verifyingContract: string;
    };
    message: {
        calls: {
            address: string;
            selector: string;
            data: string[];
        }[];
        additional_data: string[];
    };
};
/**
 * EIP-712 type definitions for an `OutsideExecution` typed data (`eth_signTypedData_v4`). The paymaster
 * builds this so both the wallet and {@link computeOutsideExecution712Hash} hash the same OutsideExecution.
 */
export declare const OUTSIDE_EXECUTION_EIP712_TYPES: {
    readonly EIP712Domain: readonly [{
        readonly name: "name";
        readonly type: "string";
    }, {
        readonly name: "version";
        readonly type: "string";
    }, {
        readonly name: "chainId";
        readonly type: "uint256";
    }, {
        readonly name: "verifyingContract";
        readonly type: "address";
    }];
    readonly OutsideExecution: readonly [{
        readonly name: "calls";
        readonly type: "Call[]";
    }, {
        readonly name: "caller";
        readonly type: "uint256";
    }, {
        readonly name: "nonce";
        readonly type: "uint256";
    }, {
        readonly name: "execute_after";
        readonly type: "uint256";
    }, {
        readonly name: "execute_before";
        readonly type: "uint256";
    }];
    readonly Call: readonly [{
        readonly name: "address";
        readonly type: "uint256";
    }, {
        readonly name: "selector";
        readonly type: "uint256";
    }, {
        readonly name: "data";
        readonly type: "uint256[]";
    }];
};
/**
 * Builds the EIP-712 `OutsideExecution` typed data the paymaster hands the signer. The domain mirrors
 * the account's on-chain domain (name = Starknet chain, version "2", `verifyingContract` = account low
 * 128 bits, `chainId` = source EVM chain); the account re-derives and verifies it on-chain, so a wrong
 * domain only yields a rejected signature. `calls` carry raw (already-hashed) selectors.
 */
export declare function outsideExecutionTypedData(input: {
    accountAddress: BigNumberish;
    snChainName: string;
    evmChainId: BigNumberish;
    calls: OutsideExecutionCall[];
    caller: BigNumberish;
    nonce: BigNumberish;
    executeAfter: BigNumberish;
    executeBefore: BigNumberish;
}): {
    types: {
        readonly EIP712Domain: readonly [{
            readonly name: "name";
            readonly type: "string";
        }, {
            readonly name: "version";
            readonly type: "string";
        }, {
            readonly name: "chainId";
            readonly type: "uint256";
        }, {
            readonly name: "verifyingContract";
            readonly type: "address";
        }];
        readonly OutsideExecution: readonly [{
            readonly name: "calls";
            readonly type: "Call[]";
        }, {
            readonly name: "caller";
            readonly type: "uint256";
        }, {
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly name: "execute_after";
            readonly type: "uint256";
        }, {
            readonly name: "execute_before";
            readonly type: "uint256";
        }];
        readonly Call: readonly [{
            readonly name: "address";
            readonly type: "uint256";
        }, {
            readonly name: "selector";
            readonly type: "uint256";
        }, {
            readonly name: "data";
            readonly type: "uint256[]";
        }];
    };
    primaryType: "OutsideExecution";
    domain: {
        name: string;
        version: string;
        chainId: string;
        verifyingContract: string;
    };
    message: {
        calls: {
            address: string;
            selector: string;
            data: string[];
        }[];
        caller: string;
        nonce: string;
        execute_after: string;
        execute_before: string;
    };
};
/** secp256k1 signature components of the EIP-712 message hash. `v` is 27/28 (yParity + 27). */
export interface EthSignatureParts {
    r: bigint;
    s: bigint;
    v: number;
}
/** Signs the EIP-712 message hash and yields its secp256k1 components (e.g. a raw server key). */
export type Eip712SignFn = (messageHash: bigint) => EthSignatureParts | Promise<EthSignatureParts>;
/** Convenience transport for a raw EVM private key (server-side / tests). */
export declare function secp256k1SignFn(privateKey: BigNumberish): Eip712SignFn;
/**
 * Signs the EIP-712 typed data via a browser wallet's `eth_signTypedData_v4`, returning the
 * 0x-prefixed 65-byte `(r ‖ s ‖ v)` hex signature. E.g. with ethers:
 * `(td) => signer.signTypedData(td.domain, { CallSet: td.types.CallSet, Call: td.types.Call }, td.message)`.
 */
export type Eip712SignTypedDataFn = (typedData: CallSetTypedData) => string | Promise<string>;
/** Common configuration shared by both EIP-712 `CallSet` signers. */
export interface Eip712SignerOptions {
    /** The Eth712Account address — its low 128 bits are the EIP-712 `verifyingContract`. */
    accountAddress: BigNumberish;
    /** Starknet chain name string, e.g. "SN_SEPOLIA" — keccak'd into the EIP-712 domain `name`. */
    snChainName: string;
    /** EIP-712 domain `chainId` (the source EVM chain id); also rides as felt[5] of the signature. */
    evmChainId: BigNumberish;
    /** Opaque extra data bound into the signed `CallSet` message. Defaults to empty, matching the pool. */
    additionalData?: BigNumberish[];
}
/**
 * Shared base for the EIP-712 `CallSet` signers. Plugs into
 * `createPrivateTransfers({ account: { address, signer } })` for an Eth712Account depositor: only
 * `signTransaction` is exercised (it derives the 6-felt account signature from the subclass's
 * secp256k1 components); the other `SignerInterface` methods are unsupported.
 */
declare abstract class Eip712CallSetSignerBase<TOptions extends Eip712SignerOptions> implements SignerInterface {
    protected readonly options: TOptions;
    protected constructor(options: TOptions);
    /** Produce the secp256k1 components over this `CallSet` — the signature-source-specific step. */
    protected abstract signParts(calls: Call[]): Promise<EthSignatureParts>;
    signTransaction(calls: Call[], _details: InvocationsSignerDetails): Promise<Signature>;
    getPubKey(): Promise<string>;
    /** Produce the secp256k1 components over an `OutsideExecution` message — source-specific. */
    protected abstract signOutsideExecution(typedData: TypedData): Promise<EthSignatureParts>;
    /**
     * Signs the SNIP-9 `OutsideExecution` EIP-712 message the Eth712Account verifies in
     * `execute_from_outside_v2` — the envelope the privacy paymaster relays for a deposit's `approve`.
     * Returns the account's 6-felt signature.
     */
    signMessage(typedData: TypedData, _accountAddress: string): Promise<Signature>;
    /** The EIP-712 `OutsideExecution` message hash from the typed data's domain + message fields. */
    protected outsideExecutionHash(typedData: TypedData): bigint;
    signDeclareTransaction(_details: DeclareSignerDetails): Promise<Signature>;
    signDeployAccountTransaction(_details: DeployAccountSignerDetails): Promise<Signature>;
}
export interface Eip712HashSignerOptions extends Eip712SignerOptions {
    /** Raw signer over the EIP-712 message hash (e.g. `secp256k1SignFn` for a server key). */
    sign: Eip712SignFn;
}
/**
 * Signs the EIP-712 `CallSet` message hash with a raw secp256k1 key (server-side / tests). Computes the
 * digest itself and calls {@link Eip712HashSignerOptions.sign} — unsuitable for browser wallets, which
 * will not sign an arbitrary 32-byte hash (use {@link Eip712TypedDataSigner} there).
 */
export declare class Eip712HashSigner extends Eip712CallSetSignerBase<Eip712HashSignerOptions> {
    constructor(options: Eip712HashSignerOptions);
    protected signParts(calls: Call[]): Promise<EthSignatureParts>;
    protected signOutsideExecution(typedData: TypedData): Promise<EthSignatureParts>;
}
export interface Eip712TypedDataSignerOptions extends Eip712SignerOptions {
    /** Browser-wallet signer via `eth_signTypedData_v4` (receives the typed data, returns 65-byte hex). */
    signTypedData: Eip712SignTypedDataFn;
}
/**
 * Signs the EIP-712 `CallSet` via a browser wallet's `eth_signTypedData_v4`: hands the wallet the typed
 * data (so it derives and displays the digest itself) and parses the returned 65-byte `(r‖s‖v)`
 * signature. The wallet's v4 digest equals {@link computeCallSet712Hash} for these types.
 */
export declare class Eip712TypedDataSigner extends Eip712CallSetSignerBase<Eip712TypedDataSignerOptions> {
    constructor(options: Eip712TypedDataSignerOptions);
    protected signParts(calls: Call[]): Promise<EthSignatureParts>;
    protected signOutsideExecution(typedData: TypedData): Promise<EthSignatureParts>;
}
export {};
//# sourceMappingURL=eip712-call-set-signer.d.ts.map