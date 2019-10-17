import { ApiPromise } from "@polkadot/api"
import { Enum, Struct } from "@polkadot/types"
import { Tuple } from "@polkadot/types"
import { Vec } from "@polkadot/types/codec"
import { Hash, Header } from "@polkadot/types/interfaces/runtime"
import { H256 } from "@polkadot/types/primitive"
import { default as U32 } from "@polkadot/types/primitive/U32"
import { Codec } from "@polkadot/types/types"
import { stringLowerFirst } from "@polkadot/util"
import { ILogger } from "../lib/Logger"
import { ModuleDescriptor, ModuleDescriptorIndex } from "./ModuleDescriptor"
import { StorageDescriptor } from "./StorageDescriptor"
import { IStructTypes } from "./CodecClassifierStruct"
import { IResolver, IResolverIndex, isIResolver, WASMInstance } from "./WASMInstance"
import { Type } from "./Type"

interface IResolverCallbackArgs {
    block: number
}

type ResolverCallback = (root: any, args: IResolverCallbackArgs, ctx: any, info: any) => any

export interface IResolverCallbackRecord {
    [index: string]: ResolverCallback | IResolverCallbackRecord
}

export class QueryResolver {
    protected api: ApiPromise
    protected logger: ILogger
    protected executor: WASMInstance // FIXME! Map interace instead
	protected rootType: Type

    constructor(api: ApiPromise, 
				logger: ILogger, 
				queryRuntime: WASMInstance, 
				rootType: Type) {
        this.api = api
        this.logger = logger
        this.executor = queryRuntime
		this.rootType = rootType
    }

    public typeValueToGraphQL(storage: StorageDescriptor, value: Codec): any {
        switch (storage.innerType) {
            case "bool":
                return value.toJSON()
        }

        return this.serialiseCodec(value)
    }

    public moduleResolvers(resolvers: IResolverCallbackRecord, modules: ModuleDescriptorIndex) {
        let queryType: IResolverCallbackRecord = {}

        if (typeof resolvers.Query === "undefined") {
            resolvers.Query = {}
        }

        queryType = resolvers.Query as IResolverCallbackRecord

        for (const key of Object.keys(modules)) {
            const canonicalName = stringLowerFirst(key)
            queryType[canonicalName] = this.moduleResolver(canonicalName, modules[key])
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
            let blockHash: Codec = new H256()

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

    public wasmResolvers(resolvers: IResolverCallbackRecord,
                         moduleResolvers: IResolverIndex,
                         path?: string[]) {
        for (const key of Object.keys(moduleResolvers)) {
            const pth = (typeof path === "undefined") ? [] : path.slice(0)
            pth.push(key)

            if (isIResolver(moduleResolvers[key])) {
                resolvers[key] = this.wasmResolver(pth.slice(0), moduleResolvers[key] as IResolver)
            } else {
                if (typeof resolvers[key] === "undefined") {
                    resolvers[key] = {}
                }

                this.wasmResolvers(resolvers[key] as IResolverCallbackRecord,
                                   moduleResolvers[key] as IResolverIndex,
                                   pth)
            }
        }
    }

    protected wasmResolver(path: string[], resolver: IResolver): ResolverCallback {
        return async (root: any, args: IResolverCallbackArgs, ctx: any, info: any) => {
            return this.executor.exec(path.slice(0), args, root)
        }
    }

    protected serialiseCodec<T extends Codec>(codec: T): any {
        if (codec instanceof Date) {
            return codec.toJSON()
        }

        // FIXME! U64, 128
        if (codec instanceof U32) {
            return codec.toJSON()
        }

		return this.rootType.serialiseCodec(this.rootType, codec)
    }
}
