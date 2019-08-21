import { ApiPromiseInterface } from "@polkadot/api/promise/types"
import { Hash, Header } from "@polkadot/types"
import { Codec } from "@polkadot/types/types"
import { ModuleDescriptor, ModuleDescriptorIndex } from "./ModuleDescriptor"
import { StorageDescriptor } from "./StorageDescriptor"

import {  Tuple, Vector } from "@polkadot/types"

interface IResolverCallbackArgs {
    block: number
}

type ResolverCallback = (root: any, args: IResolverCallbackArgs, ctx: any, info: any) => any

export type ResolverCallbackRecord = Record<string, ResolverCallback>

export class QueryResolver {
    protected api: ApiPromiseInterface

    constructor(api: ApiPromiseInterface) {
        this.api = api
    }

    public typeValueToGraphQL(storage: StorageDescriptor, value: Codec): any {
        // Basic types
        switch (storage.innerType) {
            case "bool":
                return value.toJSON()
        }

        if (value instanceof Date) {
            return value.toJSON()
        }

        if (storage.APIName == "recentlyOffline") {
            if (value instanceof Vector) {

				const vec = value as Vector<any> as any
				// TODO: extract info for tuples (and vectors of tuples) and fill in any any-type object
				console.log(new vec._Type)
                return [
                    {
                        accountId: "hello"
                    }
                ]
            }
        }

        return value
    }

    public moduleResolvers(resolvers: ResolverCallbackRecord, modules: ModuleDescriptorIndex) {
        for (const key of Object.keys(modules)) {
            resolvers[key] = this.moduleResolver(key, modules[key])
        }
    }

    public moduleResolver(name: string, module: ModuleDescriptor): ResolverCallback {
        const parent = this
        const query = this.api.query[name]
        return async (root: any, args: IResolverCallbackArgs, ctx: any, info: any) => {
            const output: Record<string, any> = {}

            // Look through requested fields
            // FIXME! Is this safe?
            const selections = info.fieldNodes[0].selectionSet.selections as any[]
            const promises: Array<Promise<Codec>> = []
            const fieldNames: string[] = []
            let blockHash: Codec = new Hash()

            if (args.block !== 0) {
                let block = args.block

                if (block < 0) {
                    const head = (await parent.api.rpc.chain.getHeader()) as Header
                    block = head.number.toNumber() + block
                }

                blockHash = await parent.api.query.system.blockHash(block)
            }

            // tslint:disable-next-line:prefer-for-of
            for (let i = 0; i < selections.length; i++) {
                const fieldName = selections[i].name.value
                fieldNames.push(fieldName)

                if (args.block !== 0) {
                    promises.push(query[fieldName].at(blockHash.toString()))
                } else {
                    promises.push(query[fieldName]())
                }
            }

            const values = await Promise.all(promises)

            if (values.length !== fieldNames.length) {
                throw new Error("Fieldnames and returned values length mismatch")
            }

            for (let i = 0; i < fieldNames.length; i++) {
                const storage = module.storageByAPIName(fieldNames[i])
                output[fieldNames[i]] = parent.typeValueToGraphQL(storage, values[i])
            }

            return output
        }
    }
}
