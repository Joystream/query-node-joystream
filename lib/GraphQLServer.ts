import { BigIntResolver } from "graphql-scalars"
import { GraphQLServer as BaseGraphQLServer } from "graphql-yoga"
import { ResolverCallbackRecord } from "./GraphQLServerMetadataConfig"

export interface IGraphQLServerConfigurer {
    SDL: string
    resolvers: ResolverCallbackRecord
}

export class GraphQLServer extends BaseGraphQLServer {
    constructor(config: IGraphQLServerConfigurer) {
        const typeDefs = config.SDL
        const resolvers = {
            BigInt: BigIntResolver,
            Query: config.resolvers,
        }

        super({ typeDefs, resolvers })
    }
}
