import { ApiPromise } from "@polkadot/api"
import { getTypeRegistry } from "@polkadot/types"
import { TypeRegistry } from "@polkadot/types/codec/create/registry"
import { ILogger } from "../lib/Logger"
import { GraphQLServer } from "./GraphQLServer"
import { GraphQLServerMetadataConfig } from "./GraphQLServerMetadataConfig"
import { QueryResolver } from "./QueryResolver"
import { TypeClassifier } from "./TypeClassifier"
import { WASMInstance } from "./WASMInstance"
import { config as AppConfig } from 'node-config-ts'

export class App {
    protected api: ApiPromise
    protected logger: ILogger
    protected typeRegistry: TypeRegistry
    protected queryRuntime: WASMInstance

    constructor(api: ApiPromise, logger: ILogger, runtime: WASMInstance) {
        this.api = api
        this.logger = logger
        this.typeRegistry = getTypeRegistry()
        this.queryRuntime = runtime
    }

    public async start() {
        const config = new GraphQLServerMetadataConfig(
            new QueryResolver(this.api, this.logger, this.queryRuntime),
            new TypeClassifier(this.typeRegistry),
            this.api.runtimeMetadata,
            this.queryRuntime,
        )
        const server = new GraphQLServer(config)
		
        const http = await server.start({port: AppConfig.Server.port})
        this.logger.info("server", `Running on port ${AppConfig.Server.port} (${JSON.stringify(http.address())})`)
    }
}
