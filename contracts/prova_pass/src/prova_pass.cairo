// Prova Pass — capability/claim contract.
//
// A campaign owner locks a reward and a predicate hash (e.g. hash of
// "held >= X of asset Y for >= N days"). Off-chain, Prova's attester
// evaluates that predicate against a user's STRK20 private note history
// (via their viewing key) and, if it holds, signs a one-time capability
// over (campaign_id, nullifier, recipient). Anyone holding that signed
// pass can redeem it from ANY wallet — the recipient here need not be,
// and is never provably linked to, the wallet that satisfied the
// predicate inside the privacy pool. The nullifier registry guarantees
// each pass is consumable exactly once.
#[starknet::interface]
pub trait IProvaPass<TContractState> {
    fn create_campaign(
        ref self: TContractState,
        campaign_id: felt252,
        predicate_hash: felt252,
        expiry: u64,
        reward_token: starknet::ContractAddress,
        reward_amount: u256,
    );
    fn claim_with_prova_pass(
        ref self: TContractState,
        campaign_id: felt252,
        nullifier: felt252,
        recipient: starknet::ContractAddress,
        signature_r: felt252,
        signature_s: felt252,
    );
    fn is_nullifier_consumed(self: @TContractState, nullifier: felt252) -> bool;
    fn get_campaign(self: @TContractState, campaign_id: felt252) -> (felt252, u64, starknet::ContractAddress, u256, bool);
    fn set_attester(ref self: TContractState, new_attester: felt252);
    fn get_attester(self: @TContractState) -> felt252;
}

#[starknet::contract]
mod ProvaPass {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use core::ecdsa::check_ecdsa_signature;
    use core::pedersen::pedersen;

    #[starknet::interface]
    trait IERC20<TContractState> {
        fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
    }

    #[storage]
    struct Storage {
        owner: ContractAddress,
        // Prova backend's STARK pubkey used to sign predicate attestations.
        attester_pubkey: felt252,
        // campaign_id -> predicate_hash
        campaign_predicate: Map<felt252, felt252>,
        // campaign_id -> expiry (unix ts)
        campaign_expiry: Map<felt252, u64>,
        // campaign_id -> creator
        campaign_owner: Map<felt252, ContractAddress>,
        // campaign_id -> reward token
        campaign_reward_token: Map<felt252, ContractAddress>,
        // campaign_id -> reward amount per claim
        campaign_reward_amount: Map<felt252, u256>,
        // campaign_id -> exists
        campaign_active: Map<felt252, bool>,
        // nullifier -> consumed
        nullifiers: Map<felt252, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        CampaignCreated: CampaignCreated,
        PassClaimed: PassClaimed,
    }

    #[derive(Drop, starknet::Event)]
    struct CampaignCreated {
        #[key]
        campaign_id: felt252,
        predicate_hash: felt252,
        expiry: u64,
        reward_token: ContractAddress,
        reward_amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct PassClaimed {
        #[key]
        campaign_id: felt252,
        #[key]
        nullifier: felt252,
        recipient: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, attester_pubkey: felt252) {
        self.owner.write(owner);
        self.attester_pubkey.write(attester_pubkey);
    }

    #[abi(embed_v0)]
    impl ProvaPassImpl of super::IProvaPass<ContractState> {
        fn create_campaign(
            ref self: ContractState,
            campaign_id: felt252,
            predicate_hash: felt252,
            expiry: u64,
            reward_token: ContractAddress,
            reward_amount: u256,
        ) {
            let caller = get_caller_address();
            assert(!self.campaign_active.read(campaign_id), 'campaign exists');
            self.campaign_predicate.write(campaign_id, predicate_hash);
            self.campaign_expiry.write(campaign_id, expiry);
            self.campaign_owner.write(campaign_id, caller);
            self.campaign_reward_token.write(campaign_id, reward_token);
            self.campaign_reward_amount.write(campaign_id, reward_amount);
            self.campaign_active.write(campaign_id, true);
            self.emit(CampaignCreated { campaign_id, predicate_hash, expiry, reward_token, reward_amount });
        }

        fn claim_with_prova_pass(
            ref self: ContractState,
            campaign_id: felt252,
            nullifier: felt252,
            recipient: ContractAddress,
            signature_r: felt252,
            signature_s: felt252,
        ) {
            assert(self.campaign_active.read(campaign_id), 'no such campaign');
            let expiry = self.campaign_expiry.read(campaign_id);
            assert(get_block_timestamp() <= expiry, 'campaign expired');
            assert(!self.nullifiers.read(nullifier), 'nullifier consumed');

            // Message = pedersen(pedersen(campaign_id, nullifier), recipient)
            // This binds the pass to exactly one campaign, one nullifier
            // (derived by the attester from the private note being proven),
            // and one payout address — but that address is chosen freely by
            // whoever redeems the pass, at redemption time, from any wallet.
            let inner = pedersen(campaign_id, nullifier);
            let message_hash = pedersen(inner, recipient.into());

            let attester = self.attester_pubkey.read();
            let valid = check_ecdsa_signature(message_hash, attester, signature_r, signature_s);
            assert(valid, 'bad attestation');

            self.nullifiers.write(nullifier, true);

            let reward_token = self.campaign_reward_token.read(campaign_id);
            let reward_amount = self.campaign_reward_amount.read(campaign_id);
            if reward_amount > 0 {
                let token = IERC20Dispatcher { contract_address: reward_token };
                token.transfer(recipient, reward_amount);
            }

            self.emit(PassClaimed { campaign_id, nullifier, recipient });
        }

        fn is_nullifier_consumed(self: @ContractState, nullifier: felt252) -> bool {
            self.nullifiers.read(nullifier)
        }

        fn get_campaign(self: @ContractState, campaign_id: felt252) -> (felt252, u64, ContractAddress, u256, bool) {
            (
                self.campaign_predicate.read(campaign_id),
                self.campaign_expiry.read(campaign_id),
                self.campaign_reward_token.read(campaign_id),
                self.campaign_reward_amount.read(campaign_id),
                self.campaign_active.read(campaign_id),
            )
        }

        fn set_attester(ref self: ContractState, new_attester: felt252) {
            assert(get_caller_address() == self.owner.read(), 'not owner');
            self.attester_pubkey.write(new_attester);
        }

        fn get_attester(self: @ContractState) -> felt252 {
            self.attester_pubkey.read()
        }
    }
}
