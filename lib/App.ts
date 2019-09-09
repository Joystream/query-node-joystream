import { ApiPromiseInterface } from "@polkadot/api/promise/types"
import { getTypeRegistry } from "@polkadot/types"
import { TypeRegistry } from "@polkadot/types/codec/typeRegistry"
import { ILogger } from "../lib/Logger"
import { GraphQLServer } from "./GraphQLServer"
import { GraphQLServerMetadataConfig } from "./GraphQLServerMetadataConfig"
import { QueryResolver } from "./QueryResolver"
import { TypeClassifier } from "./TypeClassifier"

export class App {
    protected api: ApiPromiseInterface
    protected logger: ILogger
    protected typeRegistry: TypeRegistry
    protected queryBuffer: Buffer

    constructor(api: ApiPromiseInterface, logger: ILogger, qbuffer: Buffer) {
        this.api = api
        this.logger = logger
        this.typeRegistry = getTypeRegistry()
        this.queryBuffer = qbuffer
    }

    public async start() {
        const config = new GraphQLServerMetadataConfig(
            new QueryResolver(this.api, this.logger, this.queryBuffer),
            new TypeClassifier(this.typeRegistry),
            this.api.runtimeMetadata.asV3,
            this.queryBuffer,
        )
        const server = new GraphQLServer(config)
        server.start(() => this.logger.info("server", "Running on localhost:4000"))
    }
}
