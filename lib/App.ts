import { ApiPromiseInterface } from "@polkadot/api/promise/types"
import { getTypeRegistry } from "@polkadot/types"
import { TypeRegistry } from "@polkadot/types/codec/typeRegistry"
import { GraphQLServer } from "./GraphQLServer"
import { GraphQLServerMetadataConfig } from "./GraphQLServerMetadataConfig"
import { QueryResolver } from "./QueryResolver"
import { TypeClassifier } from "./TypeClassifier"
import { WASMInstance } from "./WASMInstance"

const log = require("npmlog")

export class App {
    protected api: ApiPromiseInterface
    protected typeRegistry: TypeRegistry
    protected queryBuffer: Buffer

    constructor(api: ApiPromiseInterface, qbuffer: Buffer) {
        this.api = api
        this.typeRegistry = getTypeRegistry()
        this.queryBuffer = qbuffer
    }

    public async start() {
		// FIXME! Should be on query request
		const wasmObject = new WASMInstance(this.queryBuffer, this.api)
        const config = new GraphQLServerMetadataConfig(
            new QueryResolver(this.api, wasmObject),
            new TypeClassifier(this.typeRegistry),
            this.api.runtimeMetadata.asV3,
			this.queryBuffer,
        )
        const server = new GraphQLServer(config)
        server.start(() => log.info("Server is running on localhost:4000"))
    }
}
