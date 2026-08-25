// @starkware-libs/starknet-privacy-client — dapp client for Starknet privacy.
//
// Resolves shadow accounts, bridges Starknet/EVM wallet signing, and builds privacy operations
// over @starkware-libs/starknet-privacy-sdk. More of the public API is added in later changesets.
export { createPrivacyClient } from "./client.js";
export { resolveShadowAccounts, DEFAULT_ADDRESS_RANGE_END } from "./shadow-accounts.js";
export { SdkWallet } from "./sdk-wallet.js";
export { CorePrivateTransfersProver } from "./strk20-prover.js";
export { deriveViewingKey, passphraseViewingKeyProvider } from "./viewing-key.js";
export { AvnuPaymaster, toPaymasterCall, normalizeSignature } from "./paymaster.js";
//# sourceMappingURL=index.js.map