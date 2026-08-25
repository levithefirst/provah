import type { StarknetAddress } from "@starkware-libs/starknet-privacy-sdk";
import type { AddressRange, PrivacyBuilder, PrivacyClient, ShadowAccountInfo } from "./interfaces.js";
/** Resolves a dapp's shadow account addresses — supplied by the client (anonymizer view + partial commitment). */
export type ResolveAddresses = (dappName: string, range?: AddressRange) => Promise<ShadowAccountInfo[]>;
/** Create the fluent operation builder for {@link PrivacyClient.build}. */
export declare function createPrivacyBuilder(userAddress: StarknetAddress, submit: PrivacyClient["submit"], resolveAddresses: ResolveAddresses): PrivacyBuilder;
//# sourceMappingURL=builder.d.ts.map