import { ApiPromiseInterface } from "@polkadot/api/promise/types"
import { getTypeRegistry } from "@polkadot/types"
import { TypeRegistry } from "@polkadot/types/codec/typeRegistry"
import { ILogger } from "../lib/Logger"
import { GraphQLServer } from "./GraphQLServer"
import { GraphQLServerMetadataConfig } from "./GraphQLServerMetadataConfig"
import { QueryResolver } from "./QueryResolver"
import { TypeClassifier } from "./TypeClassifier"
import { WASMInstance } from "./WASMInstance"

export class App {
    protected api: ApiPromiseInterface
    protected logger: ILogger
    protected typeRegistry: TypeRegistry
    protected queryRuntime: WASMInstance

    constructor(api: ApiPromiseInterface, logger: ILogger, runtime: WASMInstance) {
        this.api = api
        this.logger = logger
        this.typeRegistry = getTypeRegistry()
        this.queryRuntime = runtime
    }

    public async start() {
        const config = new GraphQLServerMetadataConfig(
            new QueryResolver(this.api, this.logger, this.queryRuntime),
            new TypeClassifier(this.typeRegistry),
            this.api.runtimeMetadata.asV3,
			this.queryRuntime,
        )
        const server = new GraphQLServer(config)
        server.start(() => this.logger.info("server", "Running on localhost:4000"))
    }
}
