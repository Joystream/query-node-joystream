import { ApiPromiseInterface } from "@polkadot/api/promise/types"
import { Hash, Header, Struct } from "@polkadot/types"
import { TypeRegistry } from "@polkadot/types/codec/typeRegistry"
import { MetadataInterface } from "@polkadot/types/Metadata/types"
import { default as MetadataV3,  MetadataModuleV3 } from "@polkadot/types/Metadata/v3"
import { StorageFunctionMetadata as StorageFunctionMetadataV3 } from "@polkadot/types/Metadata/v3/Storage"
import { default as U128 } from "@polkadot/types/primitive/U128"
import { default as U64 } from "@polkadot/types/primitive/U64"
import { Codec } from "@polkadot/types/types"
import { stringLowerFirst, stringUpperFirst } from "@polkadot/util"
import { IGraphQLServerConfigurer } from "./GraphQLServer"
import { ModuleDescriptor, ModuleDescriptorIndex } from "./ModuleDescriptor"
import { SDLSchema } from "./SDLSchema"
import { StorageDescriptor, StorageType } from "./StorageDescriptor"
import { MustStringCodec } from "./util"

interface IResolverCallbackArgs {
    block: number
}

type ResolverCallback = (root: any, args: IResolverCallbackArgs, ctx: any, info: any) => any

export type ResolverCallbackRecord = Record<string, ResolverCallback>

export class GraphQLServerMetadataConfig
    <TMetadataVersion extends MetadataInterface = MetadataV3>
    implements IGraphQLServerConfigurer {

    protected typeRegistry: TypeRegistry
    protected modules: ModuleDescriptorIndex
    protected codecs: Record<string, Codec>
    protected api: ApiPromiseInterface

    constructor(api: ApiPromiseInterface, typeRegistry: TypeRegistry, metadata: TMetadataVersion) {
        this.api = api
        this.typeRegistry = typeRegistry
        this.modules = {}
        this.codecs = {}

        if (metadata instanceof MetadataV3) {
            this.parseModulesV3(metadata)
        } else {
            // TODO: Support V4
            throw new Error("Only V3 supported")
        }
    }

    private parseModulesV3(input: MetadataV3) {
        input.modules.forEach((module: MetadataModuleV3) => this.parseModuleV3(module))
    }

    private parseModuleV3(input: MetadataModuleV3) {
        const desc = new ModuleDescriptor()

        if (input.storage.isNone) {
            return
        }

        // FIXME! Remove this
        if (MustStringCodec(input.name) !== "balances" &&
            MustStringCodec(input.name) !== "timestamp") {
            return
        }

        input.storage.unwrap().forEach( (storage: StorageFunctionMetadataV3) => {
            const variable = this.extractVariableStorageDescriptorV3(storage)

            this.assertCodec(variable.innerType)

            desc.storage[storage.name.toString()] = variable
        })

        this.modules[input.name.toString()] = desc
    }

    private extractVariableStorageDescriptorV3(storage: StorageFunctionMetadataV3): StorageDescriptor {
        const variable = new StorageDescriptor()

        switch (storage.type.type) {
            case StorageType.Plain:
                variable.structure = StorageType.Plain
                variable.innerType = MustStringCodec(storage.type.asType)
                break

            case StorageType.Map:
                variable.structure = StorageType.Map
                variable.mapKeyType = MustStringCodec(storage.type.asMap.get("key"))
                variable.innerType  = MustStringCodec(storage.type.asMap.get("value"))
                break

            default:
                throw new Error("Unhandled: " + storage.type.type.toString())
        }

        variable.APIName = stringLowerFirst(MustStringCodec(storage.name))

        return variable
    }

    private assertCodec(typeName: string) {
        if (typeof this.codecs[typeName] !== "undefined") {
            return
        }

        const reg = this.typeRegistry.get(typeName)

        if (typeof reg !== "undefined") {
           this.codecs[typeName] = new reg()
        }
    }

    private moduleSDLName(moduleName: string): string {
        return stringUpperFirst(moduleName) + "Module"
    }

    private typeToSDL(schema: SDLSchema, type: string): string {
        // Basic types
        switch (type) {
            case "bool":
                return "Boolean"

            case "u32":
                return "Int"
        }

        const codec = this.codecs[type]

        // FIXME: Make this a lookup table
        if (codec instanceof Date) {
            return "String"
        }

        if (codec instanceof Hash) {
            return "String"
        }

        if (codec instanceof Struct) {
            return "String" // FIXME!
        }

        if (codec instanceof U128 || codec instanceof U64) {
            return "BigInt"
        }

        throw new Error(`Unknown type: ${type}`)
    }

    private typeValueToGraphQL(storage: StorageDescriptor, value: Codec): any {
        // Basic types
        switch (storage.innerType) {
            case "bool":
                return value.toJSON()
        }

        const codec = this.codecs[storage.innerType]

        if (codec instanceof Date) {
            return MustStringCodec(value)
        }

        return value
    }

    private queryBlockSDL(schema: SDLSchema) {
        const q = schema.type("Query")

        for (const key of Object.keys(this.modules)) {
            const module = this.moduleSDLName(key)
            q.declaration(`${key}(block: BigInt = 0): ${module}`)
        }

        q.end()
    }

    private moduleBlocksSDL(schema: SDLSchema) {
        for (const key of Object.keys(this.modules)) {
            this.moduleBlockSDL(schema, key, this.modules[key])
        }
    }

    private moduleBlockSDL(schema: SDLSchema, name: string, module: ModuleDescriptor) {
        const m = schema.type(this.moduleSDLName(name))

        for (const key of Object.keys(module.storage)) {
            const variable = module.storage[key]

            // FIXME! Remove this
            if (variable.structure !== StorageType.Plain) {
                continue
            }

            m.declaration(variable.APIName + ": " + this.typeToSDL(schema, variable.innerType))
        }
        m.end()
    }

    private moduleResolvers(resolvers: ResolverCallbackRecord) {
        for (const key of Object.keys(this.modules)) {
            resolvers[key] = this.moduleResolver(key, this.modules[key])
        }
    }

    private moduleResolver(name: string, module: ModuleDescriptor): ResolverCallback {
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

    public get SDL(): string {
        const schema = new SDLSchema()
        schema.requireScalar("BigInt")
        this.queryBlockSDL(schema)
        this.moduleBlocksSDL(schema)
        schema.end()
        return schema.SDL
    }

    public get resolvers(): ResolverCallbackRecord {
        const resolvers: ResolverCallbackRecord = {}
        this.moduleResolvers(resolvers)
        return resolvers
    }
}
