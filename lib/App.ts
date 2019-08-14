import { ApiPromiseInterface } from "@polkadot/api/promise/types"
import { getTypeRegistry } from "@polkadot/types"
import { TypeRegistry } from "@polkadot/types/codec/typeRegistry"
import { GraphQLServer } from "./GraphQLServer"

import { GraphQLServerMetadataConfig } from "./GraphQLServerMetadataConfig"

const log = require("npmlog")

export class App {

    protected api: ApiPromiseInterface
    protected typeRegistry: TypeRegistry

    constructor(api: ApiPromiseInterface) {
        this.api = api
        this.typeRegistry = getTypeRegistry()
    }

    public async start() {
        const config = new GraphQLServerMetadataConfig(
            this.api,
            this.typeRegistry,
            this.api.runtimeMetadata.asV3,
        )
        const server = new GraphQLServer(config)
        server.start(() => log.info("Server is running on localhost:4000"))
    }
}
