import { MetadataInterface } from "@polkadot/types/Metadata/types"
import { default as MetadataV3,  MetadataModuleV3 } from "@polkadot/types/Metadata/v3"
import { StorageFunctionMetadata as StorageFunctionMetadataV3 } from "@polkadot/types/Metadata/v3/Storage"
import { stringLowerFirst } from "@polkadot/util"
import { IGraphQLServerConfigurer } from "./GraphQLServer"
import { ModuleDescriptor, ModuleDescriptorIndex } from "./ModuleDescriptor"
import { ResolverCallbackRecord } from "./QueryResolver"
import { SDLSchema } from "./SDLSchema"
import { StorageDescriptor, StorageType } from "./StorageDescriptor"
import { MustStringCodec } from "./util"

interface ITypeClassifier {
    queryBlockSDL(schema: SDLSchema, modules: ModuleDescriptorIndex): void
    moduleBlocksSDL(schema: SDLSchema, modules: ModuleDescriptorIndex): void
}

interface IQueryResolver {
    moduleResolvers(resolvers: ResolverCallbackRecord, modules: ModuleDescriptorIndex): void
    wasmResolvers(resolvers: ResolverCallbackRecord): void
}

export class GraphQLServerMetadataConfig
    <TMetadataVersion extends MetadataInterface = MetadataV3>
    implements IGraphQLServerConfigurer {

    protected typeClassifier: ITypeClassifier
    protected modules: ModuleDescriptorIndex
    protected queryResolver: IQueryResolver
    protected queryWasmBuffer: Buffer

    constructor(queryResolver: IQueryResolver,
                typeClassifier: ITypeClassifier,
                metadata: TMetadataVersion,
                queryWasmBuffer: Buffer) {

        this.queryResolver = queryResolver
        this.typeClassifier = typeClassifier
        this.modules = {}
        this.queryWasmBuffer = queryWasmBuffer

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
        if (/*MustStringCodec(input.name) !== "balances" && */
            MustStringCodec(input.name) !== "timestamp") {
//            MustStringCodec(input.name) !== "session" &&
//            MustStringCodec(input.name) !== "staking" &&
 //           MustStringCodec(input.name) !== "system") {
            return
        }

        input.storage.unwrap().forEach( (storage: StorageFunctionMetadataV3) => {
            const variable = this.extractVariableStorageDescriptorV3(storage)
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

    public get SDL(): string {
        const schema = new SDLSchema()
        this.typeClassifier.queryBlockSDL(schema, this.modules)
        this.typeClassifier.moduleBlocksSDL(schema, this.modules)
        schema.end()
        return schema.SDL
    }

    public get resolvers(): ResolverCallbackRecord {
        const resolvers: ResolverCallbackRecord = {}
        this.queryResolver.moduleResolvers(resolvers, this.modules)
        this.queryResolver.wasmResolvers(resolvers)
        return resolvers
    }
}
