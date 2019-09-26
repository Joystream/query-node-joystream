NODE_BINARY ?= e2e/joystream-node/target/release/joystream-node
WASM_SCRIPT ?= e2e/joystream-node/scripts/init.sh

.PHONY: install
install: node_modules regenerate-config git-submodules init-wasm $(NODE_BINARY)

.PHONY: init-wasm
init-wasm: 
	@$(WASM_SCRIPT)

.PHONY: query-node
query-node: node_modules
	@yarn run start

.PHONY: query-node-dev
query-node-dev: node_modules
	@yarn run dev

.PHONY: regnerate-config
regenerate-config: 
	@yarn install
	@yarn run regnerate-config

.PHONY: git-submodules
git-submodules:
	@git submodule init

node_modules:
	@yarn install

$(NODE_BINARY):
	@cd e2e/joystream-node; cargo build --release

.PHONY: testnet
testnet: $(NODE_BINARY)
	@$(NODE_BINARY) --ws-port 9944 --pruning archive --dev

.PHONY: purge-testnet-chain
purge-testnet-chain:
	@$(NODE_BINARY) purge-chain --dev

.PHONY: clean
clean: purge-testnet-chain clean-rust-assets

.PHONY: clean-rust-assets
clean-rust-assets:
	@echo -n "Do you want to delete Rust build assets (takes a long time to recompile? [y/N] " && read ans && [ $${ans:-N} = y ]
	@rm $(NODE_BINARY)
