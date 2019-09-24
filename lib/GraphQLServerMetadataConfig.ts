import { MetadataInterface } from "@polkadot/types/Metadata/types"
import { default as MetadataV3,  MetadataModuleV3 } from "@polkadot/types/Metadata/v3"
import { default as MetadataV4,  MetadataModuleV4 } from "@polkadot/types/Metadata/v4"
import { StorageFunctionMetadata as StorageFunctionMetadataV3 } from "@polkadot/types/Metadata/v3/Storage"
import { StorageFunctionMetadata as StorageFunctionMetadataV4 } from "@polkadot/types/Metadata/v4/Storage"
import { stringLowerFirst } from "@polkadot/util"
import { IGraphQLServerConfigurer } from "./GraphQLServer"
import { ModuleDescriptor, ModuleDescriptorIndex } from "./ModuleDescriptor"
import { IResolverCallbackRecord } from "./QueryResolver"
import { SDLSchema } from "./SDLSchema"
import { StorageDescriptor, StorageType } from "./StorageDescriptor"
import { MustStringCodec } from "./util"
import { IResolverIndex } from "./WASMInstance"

interface ITypeClassifier {
    queryBlockSDL(schema: SDLSchema, resolvers: IResolverIndex, modules: ModuleDescriptorIndex): void
    moduleBlocksSDL(schema: SDLSchema, modules: ModuleDescriptorIndex): void
}

interface IQueryResolver {
    moduleResolvers(resolvers: IResolverCallbackRecord, modules: ModuleDescriptorIndex): void
    wasmResolvers(resolvers: IResolverCallbackRecord, runtimeResolvers: IResolverIndex): void
}

interface IResolverSource {
    resolvers(): IResolverIndex
}

export class GraphQLServerMetadataConfig
    <TMetadataVersion extends MetadataInterface = MetadataV3>
    implements IGraphQLServerConfigurer {

    protected typeClassifier: ITypeClassifier
    protected modules: ModuleDescriptorIndex
    protected queryResolver: IQueryResolver
    protected queryRuntime: IResolverSource
    protected moduleBlacklist: string[] = []

    constructor(queryResolver: IQueryResolver,
                typeClassifier: ITypeClassifier,
                metadata: TMetadataVersion,
                queryRuntime: IResolverSource) {

        this.queryResolver = queryResolver
        this.typeClassifier = typeClassifier
        this.queryRuntime = queryRuntime

        if (metadata instanceof MetadataV3) {
            this.modules = this.parseModulesV3(metadata)
        } else if (metadata instanceof MetadataV4) {
            this.modules = this.parseModulesV4(metadata)
        } else {
            // TODO: Support V4
            throw new Error("Only V3 supported")
        }
    }

    private parseModulesV3(input: MetadataV3): ModuleDescriptorIndex {
        const output = {}
        input.modules.forEach((module: MetadataModuleV3) => this.parseModuleV3(module, output))
        return output
    }

    private parseModuleV3(input: MetadataModuleV3, output: ModuleDescriptorIndex) {
        const desc = new ModuleDescriptor()

        if (input.storage.isNone) {
            return
        }

        if (this.moduleBlacklist.indexOf(MustStringCodec(input.name)) !== -1) {
            return
        }

        input.storage.unwrap().forEach( (storage: StorageFunctionMetadataV3) => {
            const variable = this.extractVariableStorageDescriptorV3(storage)
            desc.storage[storage.name.toString()] = variable
        })

        output[input.name.toString()] = desc
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

    private parseModulesV4(input: MetadataV4): ModuleDescriptorIndex {
        const output = {}
        input.modules.forEach((module: MetadataModuleV4) => this.parseModuleV4(module, output))
        return output
    }

    private parseModuleV4(input: MetadataModuleV4, output: ModuleDescriptorIndex) {
        const desc = new ModuleDescriptor()

        if (input.storage.isNone) {
            return
        }

        if (this.moduleBlacklist.indexOf(MustStringCodec(input.name)) !== -1) {
            return
        }

        input.storage.unwrap().forEach( (storage: StorageFunctionMetadataV4) => {
            const variable = this.extractVariableStorageDescriptorV4(storage)
            desc.storage[storage.name.toString()] = variable
        })

        output[input.name.toString()] = desc
    }

    private extractVariableStorageDescriptorV4(storage: StorageFunctionMetadataV4): StorageDescriptor {
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

        this.typeClassifier.queryBlockSDL(
            schema,
            this.queryRuntime.resolvers(),
            this.modules)

        this.typeClassifier.moduleBlocksSDL(schema, this.modules)
        schema.end()
        return schema.SDL
    }

    public get resolvers(): IResolverCallbackRecord {
        const resolvers: IResolverCallbackRecord = {}
        this.queryResolver.moduleResolvers(resolvers, this.modules)
        this.queryResolver.wasmResolvers(resolvers, this.queryRuntime.resolvers())
        return resolvers
    }
}
