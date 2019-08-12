import { ApiPromise, WsProvider } from "@polkadot/api";
import { GraphQLServer } from 'graphql-yoga'
import { BigIntResolver } from 'graphql-scalars';

export class App {

    public MemberA: number;

    constructor() {
        this.MemberA = 1;
    }

    public async start() {
        const api = await ApiPromise.create({
            provider: new WsProvider("ws://127.0.0.1:9944"),
            types: {
                Category: {},
                CategoryId: {},
                IPNSIdentity: {},
                InputValidationLengthConstraint: {},
                Post: {},
                PostId: {},
                Thread: {},
                ThreadId: {},
                Url: {},
            },
        });

        // ... or using `require()`
        // const { GraphQLServer } = require('graphql-yoga')

        const typeDefs = `
scalar BigInt

type Query {
  balances(block: Int = 0): Balances
  timestamp (block: Int = 0): Timestamp
  system (block: Int = 0): System
}

type Balances {
  totalIssuance: BigInt
  transactionBaseFee: BigInt
}

type Timestamp {
  now: String
}

type System {
  number: String
}
        `

        const resolvers = {
            BigInt: BigIntResolver,
            Query: {
                balances: async function(root:any, args:any, ctx:any, info:any) {
                   let q = api.query.balances.totalIssuance()
                   let b = await q

                   // fields requested
                   console.log(info.fieldNodes[0].selectionSet.selections[0])
                   console.log(info.fieldNodes[0].selectionSet.selections[1])
                    return {
                       totalIssuance: b.toString(),
                       transactionBaseFee:  await api.query.balances.transactionBaseFee()
                    }
                },
                timestamp: async function(context:any, {name}: { name:any }){
                   let b = await api.query.timestamp.now()
                    return {
                        now: b.toString()
                    }
                },
                system: async function(context:any, {name}: { name:any }){
                   let b = await api.query.system.number()
                    return {
                        number: b.toString()
                    }
                }
            },
        }

        const server = new GraphQLServer({ typeDefs, resolvers })
        server.start(() => console.log('Server is running on localhost:4000'))
    }
}
