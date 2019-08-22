import { ApiPromiseInterface } from "@polkadot/api/promise/types"
import { Hash, Header } from "@polkadot/types"
import {  Tuple, Vector } from "@polkadot/types"
import { Codec } from "@polkadot/types/types"
import { stringLowerFirst } from "@polkadot/util"
import { ModuleDescriptor, ModuleDescriptorIndex } from "./ModuleDescriptor"
import { StorageDescriptor } from "./StorageDescriptor"

interface IResolverCallbackArgs {
    block: number
}

type ResolverCallback = (root: any, args: IResolverCallbackArgs, ctx: any, info: any) => any

export type ResolverCallbackRecord = Record<string, ResolverCallback>

// FIXME! Move to shared tuple and struct classes
interface ITupleType<T = string> extends Array<T> {
    [index: number]: T
}

interface ITupleTypes<T = string> {
    Types: ITupleType<T>
}

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

        return this.serialiseCodec(value)
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

    protected serialiseCodec<T extends Codec>(codec: T): any {
        if (codec instanceof Tuple) {
            return this.serialiseTuple(codec)
        }

        if (codec instanceof Vector) {
            return this.serialiseVector(codec)
        }

        return codec
    }

    protected serialiseVector<T extends Vector<any>>(v: T): any {
        switch (v.Type) {
            case "Tuple":
                return this.serialiseVectorTuple(v)
        }

        return v
    }

    protected serialiseVectorTuple<T extends Vector<Tuple>>(vec: T): any {
        const output = []
        const entries = vec.toArray()

        // tslint:disable-next-line
        for (const k in entries) {
            output.push(this.serialiseTuple(entries[k]))
        }

        return output
    }

    protected serialiseTuple<T extends Tuple>(value: T): any {
        const tupleEntries = value.toArray()

        if (value.Types.length !== tupleEntries.length) {
            throw new Error("Mismatched tuple entries")
        }

        const entryOutput: any = {}

        // tslint:disable-next-line
        for (const i in value.Types) {
            entryOutput[stringLowerFirst(value.Types[i])] = this.serialiseCodec(tupleEntries[i])
        }

        return entryOutput
    }
}
