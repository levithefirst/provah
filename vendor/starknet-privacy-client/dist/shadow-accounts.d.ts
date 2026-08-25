import type { TypedContractV2 } from "starknet";
import { ShadowAccountAnonymizerABI } from "@starkware-libs/starknet-privacy-sdk";
import type { AddressRange, ShadowAccountInfo } from "./interfaces.js";
/** The anonymizer contract typed against its generated ABI, as the client caches it. */
export type ShadowAccountAnonymizerContract = TypedContractV2<typeof ShadowAccountAnonymizerABI>;
/** Default upper bound (exclusive) for {@link AddressRange.end} when the caller gives none. */
export declare const DEFAULT_ADDRESS_RANGE_END = 100;
export interface ResolveShadowAccountsParams {
    /** The anonymizer contract (typed, created once by the client). */
    anonymizer: ShadowAccountAnonymizerContract;
    /** `hash(identity_key, dapp_name)`, from the identity source. */
    partialCommitment: bigint;
    range: AddressRange;
}
/**
 * Resolves the shadow accounts under `partialCommitment` via the anonymizer's `get_shadow_accounts` view
 * for `[start, end)`, paginated across `MAX_SCAN_RANGE` windows.
 *
 * The address is not recomputed client-side: the view returns the address stored on chain,
 * for deployed accounts, and calculated addresses for undeployed ones.
 *
 * With `untilUndeployed: true` the view stops at the first undeployed nonce and returns the
 * contiguous deployed prefix; a short window is the signal it stopped, so pagination ends there.
 */
export declare function resolveShadowAccounts(params: ResolveShadowAccountsParams): Promise<ShadowAccountInfo[]>;
//# sourceMappingURL=shadow-accounts.d.ts.map