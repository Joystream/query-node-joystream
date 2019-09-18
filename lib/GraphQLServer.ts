import { BigIntResolver } from "graphql-scalars"
import { GraphQLServer as BaseGraphQLServer } from "graphql-yoga"
import { IResolverCallbackRecord } from "./QueryResolver"

export interface IGraphQLServerConfigurer {
    SDL: string
    resolvers: IResolverCallbackRecord
}

export class GraphQLServer extends BaseGraphQLServer {
    constructor(config: IGraphQLServerConfigurer) {
        const typeDefs = config.SDL
        const resolvers = config.resolvers as any
        resolvers.BigInt = BigIntResolver

        super({ typeDefs, resolvers })
    }
}
