use primitives::{Pair, Public};
use joystream_node_runtime::{
    AccountId, BalancesConfig,  CouncilConfig,
    CouncilElectionConfig, DataObjectStorageRegistryConfig, DataObjectTypeRegistryConfig,
    DownloadSessionsConfig, GenesisConfig, GrandpaConfig, IndicesConfig, MembersConfig,
    ProposalsConfig, SessionConfig, StakerStatus, StakingConfig, SudoConfig, Perbill,
    ForumConfig, ImOnlineConfig, AuthorityDiscoveryConfig,
    ActorsConfig, SystemConfig, BabeConfig, WASM_BINARY,
    forum::InputValidationLengthConstraint,
    SessionKeys,
    QueryConfig,
};
use staking::Forcing;
use im_online::{sr25519::AuthorityId as ImOnlineId};
use babe_primitives::{AuthorityId as BabeId};
use grandpa_primitives::{AuthorityId as GrandpaId};
use substrate_service;

// Note this is the URL for the telemetry server
//const STAGING_TELEMETRY_URL: &str = "wss://telemetry.polkadot.io/submit/";

/// Specialized `ChainSpec`. This is a specialization of the general Substrate ChainSpec type.
pub type ChainSpec = substrate_service::ChainSpec<GenesisConfig>;

/// The chain specification option. This is expected to come in from the CLI and
/// is little more than one of a number of alternatives which can easily be converted
/// from a string (`--chain=...`) into a `ChainSpec`.
#[derive(Clone, Debug)]
pub enum Alternative {
	/// Whatever the current runtime is, with just Alice as an auth.
	Development,
	/// Whatever the current runtime is, with simple Alice/Bob auths.
	LocalTestnet,
}

/// Helper function to generate a crypto pair from seed
pub fn get_from_seed<TPublic: Public>(seed: &str) -> <TPublic::Pair as Pair>::Public {
	TPublic::Pair::from_string(&format!("//{}", seed), None)
		.expect("static values are valid; qed")
		.public()
}

/// Helper function to generate stash, controller and session key from seed
pub fn get_authority_keys_from_seed(seed: &str) -> (AccountId, AccountId, GrandpaId, BabeId, ImOnlineId) {
	(
		get_from_seed::<AccountId>(&format!("{}//stash", seed)),
		get_from_seed::<AccountId>(seed),
		get_from_seed::<GrandpaId>(seed),
		get_from_seed::<BabeId>(seed),
		get_from_seed::<ImOnlineId>(seed),
	)
}

fn get_wasm_file() -> Vec<u8> {
    match std::fs::read("../query-api/build/query.wasm") {
        Ok(bytes) => bytes,
        Err(_e) => {
            println!("Failed");
            vec![]
        },
    }
}

impl Alternative {
	/// Get an actual chain config from one of the alternatives.
	pub(crate) fn load(self) -> Result<ChainSpec, String> {
		Ok(match self {
			Alternative::Development => ChainSpec::from_genesis(
				"Development",
				"dev",
				|| testnet_genesis(vec![
					get_authority_keys_from_seed("Alice"),
				],
				get_from_seed::<AccountId>("Alice"),
				vec![
					get_from_seed::<AccountId>("Alice"),
					get_from_seed::<AccountId>("Bob"),
					get_from_seed::<AccountId>("Alice//stash"),
					get_from_seed::<AccountId>("Bob//stash"),
				],
				true),
				vec![],
				None,
				None,
				None,
				None
			),
			Alternative::LocalTestnet => ChainSpec::from_genesis(
				"Local Testnet",
				"local_testnet",
				|| testnet_genesis(vec![
					get_authority_keys_from_seed("Alice"),
					get_authority_keys_from_seed("Bob"),
				], 
				get_from_seed::<AccountId>("Alice"),
				vec![
					get_from_seed::<AccountId>("Alice"),
					get_from_seed::<AccountId>("Bob"),
					get_from_seed::<AccountId>("Charlie"),
					get_from_seed::<AccountId>("Dave"),
					get_from_seed::<AccountId>("Eve"),
					get_from_seed::<AccountId>("Ferdie"),
					get_from_seed::<AccountId>("Alice//stash"),
					get_from_seed::<AccountId>("Bob//stash"),
					get_from_seed::<AccountId>("Charlie//stash"),
					get_from_seed::<AccountId>("Dave//stash"),
					get_from_seed::<AccountId>("Eve//stash"),
					get_from_seed::<AccountId>("Ferdie//stash"),
				],
				true),
				vec![],
				None,
				None,
				None,
				None
			),
		})
	}

	pub(crate) fn from(s: &str) -> Option<Self> {
		match s {
			"dev" => Some(Alternative::Development),
			"" | "local" => Some(Alternative::LocalTestnet),
			_ => None,
		}
	}
}

fn new_validation(min: u16, max_min_diff: u16) -> InputValidationLengthConstraint {
    return InputValidationLengthConstraint { min, max_min_diff };
}

fn session_keys(grandpa: GrandpaId, babe: BabeId, im_online: ImOnlineId) -> SessionKeys {
    SessionKeys {
        grandpa,
        babe,
        im_online,
    }
}

const CENTS: u128 = 1;
const DOLLARS: u128 = 100 * CENTS;

const SECS_PER_BLOCK: u32 = 6;
const MINUTES: u32 = 60 / SECS_PER_BLOCK;
const HOURS: u32 = MINUTES * 60;
const DAYS: u32 = HOURS * 24;
const STASH: u128 = 50 * DOLLARS;
const ENDOWMENT: u128 = 100_000_000 * DOLLARS;

fn testnet_genesis(initial_authorities: Vec<(AccountId, AccountId, GrandpaId, BabeId, ImOnlineId)>,
	root_key: AccountId, 
	endowed_accounts: Vec<AccountId>,
	_enable_println: bool) -> GenesisConfig {

	GenesisConfig {
		system: Some(SystemConfig {
			code: WASM_BINARY.to_vec(),
			changes_trie_config: Default::default(),
		}),
		indices: Some(IndicesConfig {
			ids: endowed_accounts.clone(),
		}),
                balances: Some(BalancesConfig {
                    balances: endowed_accounts
                        .iter()
                        .cloned()
                        .map(|k| (k, ENDOWMENT))
                        .chain(initial_authorities.iter().map(|x| (x.0.clone(), STASH)))
                        .collect(),
                    vesting: vec![],
                }),
		sudo: Some(SudoConfig {
			key: root_key.clone(),
		}),
		babe: Some(BabeConfig {
			authorities: vec![],
		}),
		grandpa: Some(GrandpaConfig {
			authorities: vec![],
		}),
                actors: Some(ActorsConfig{
			enable_storage_role: true,
			request_life_time: 300,
		}),
                council: Some(CouncilConfig {
			active_council: vec![],
			term_ends_at: 1,
		}),
                data_object_type_registry: Some(DataObjectTypeRegistryConfig {
			first_data_object_type_id: 1,
		}),
		data_object_storage_registry: Some(DataObjectStorageRegistryConfig{
			first_relationship_id: 1,
		}),
                downloads: Some(DownloadSessionsConfig{
			first_download_session_id: 1,
		}),
                election: Some(CouncilElectionConfig {
			auto_start: true,
			announcing_period: 3 * DAYS,
			voting_period: 1 * DAYS,
			revealing_period: 1 * DAYS,
			council_size: 12,
			candidacy_limit: 25,
			min_council_stake: 10 * DOLLARS,
			new_term_duration: 14 * DAYS,
			min_voting_stake: 1 * DOLLARS,
		}),
                forum: Some(ForumConfig {
			category_by_id: vec![],
			thread_by_id: vec![],
			post_by_id: vec![],
			next_category_id: 1,
			next_thread_id: 1,
			next_post_id: 1,
			forum_sudo: root_key.clone(),
			category_title_constraint: new_validation(10, 90),
			category_description_constraint: new_validation(10, 490),
			thread_title_constraint: new_validation(10, 90),
			post_text_constraint: new_validation(10, 990),
			thread_moderation_rationale_constraint: new_validation(10, 290),
			post_moderation_rationale_constraint: new_validation(10, 290)
                }),
                im_online: Some(ImOnlineConfig {
			keys: vec![],
                }),
                members: Some(MembersConfig {
                        default_paid_membership_fee: 100u128,
			first_member_id: 1,
                        members: vec![],
                }),
                authority_discovery: Some(AuthorityDiscoveryConfig {
			keys: vec![],
                }),
                proposals: Some(ProposalsConfig {
			approval_quorum: 66,
			min_stake: 2 * DOLLARS,
			cancellation_fee: 10 * CENTS,
			rejection_fee: 1 * DOLLARS,
			voting_period: 2 * DAYS,
			name_max_len: 512,
			description_max_len: 10_000,
			wasm_code_max_len: 2_000_000,
		}),
                session: Some(SessionConfig {
                        keys: initial_authorities
                            .iter()
                            .map(|x| {
                                (
                                    x.0.clone(),
                                    session_keys(x.2.clone(), x.3.clone(), x.4.clone()),
                                )
                            })
                        .collect::<Vec<_>>(),
                }),
		staking: Some(StakingConfig {
			current_era: 0,
			validator_count: 20,
                        force_era: Forcing::NotForcing,
                        slash_reward_fraction: Perbill::from_millionths(10_000),
			minimum_validator_count: 1,
			stakers: initial_authorities.iter().map(|x| (x.0.clone(), x.1.clone(), STASH, StakerStatus::Validator)).collect(),
			invulnerables: initial_authorities.iter().map(|x| x.1.clone()).collect(),
		}), 
                query: Some(QueryConfig{
                    runtime: get_wasm_file(),
                }),
	}
}
