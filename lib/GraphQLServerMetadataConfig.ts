import { Codec } from "@polkadot/types/types"
import { Metadata } from "@polkadot/types"
import { MetadataInterface } from "@polkadot/types/Metadata/types"
import { default as MetadataV3,  ModuleMetadataV3 } from "@polkadot/types/Metadata/v3"
import { default as MetadataV7,  ModuleMetadataV7 } from "@polkadot/types/Metadata/v7"
import { StorageFunctionMetadata as StorageFunctionMetadataV3 } from "@polkadot/types/Metadata/v3/Storage"
import { StorageMetadata as StorageMetadataV7, StorageEntryMetadata as StorageEntryMetadataV7 } from "@polkadot/types/Metadata/v7/Storage"
import { stringLowerFirst } from "@polkadot/util"
import { IGraphQLServerConfigurer } from "./GraphQLServer"
import { ModuleDescriptor, ModuleDescriptorIndex } from "./ModuleDescriptor"
import { IResolverCallbackRecord } from "./QueryResolver"
import { SDLSchema } from "./SDLSchema"
import { StorageDescriptor, StorageType } from "./StorageDescriptor"
import { MustStringCodec } from "./util"
import { IResolverIndex } from "./WASMInstance"
import { config as AppConfig } from 'node-config-ts'

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
    implements IGraphQLServerConfigurer {

    protected typeClassifier: ITypeClassifier
    protected modules: ModuleDescriptorIndex
    protected queryResolver: IQueryResolver
    protected queryRuntime: IResolverSource
    protected moduleBlacklist: string[] = ["System", "Babe", "Grandpa"]

    constructor(queryResolver: IQueryResolver,
                typeClassifier: ITypeClassifier,
                metadata: Metadata,
                queryRuntime: IResolverSource) {

        this.queryResolver = queryResolver
        this.typeClassifier = typeClassifier
        this.queryRuntime = queryRuntime

        switch(AppConfig.ArchiveNode.metadataVersion) {
            case 3:
            this.modules = this.parseModulesV3(metadata.asV3)
                break

            case 7:
            this.modules = this.parseModulesV7(metadata.asV7)
                break

            default:
                throw new Error("Only V3 and V7 supported") 
        }
    }

    private parseModulesV3(input: MetadataV3): ModuleDescriptorIndex {
        const output = {}
        input.modules.forEach((module: ModuleMetadataV3) => this.parseModuleV3(module, output))
        return output
    }

    private parseModuleV3(input: ModuleMetadataV3, output: ModuleDescriptorIndex) {
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

    private parseModulesV7(input: MetadataV7): ModuleDescriptorIndex {
        const output = {}
        input.modules.forEach((module: ModuleMetadataV7) => this.parseModuleV7(module, output))
        return output
    }

    private parseModuleV7(input: ModuleMetadataV7, output: ModuleDescriptorIndex) {
        const desc = new ModuleDescriptor()

        if (input.storage.isNone) {
            return
        }

        if (this.moduleBlacklist.indexOf(MustStringCodec(input.name)) !== -1) {
            return
        }

        const storageMetadata = input.storage.value as StorageMetadataV7
        storageMetadata.items.forEach( (item: StorageEntryMetadataV7) => {
            const variable = this.extractVariableStorageDescriptorV7(item)
            desc.storage[item.name.toString()] = variable
        })

        output[input.name.toString()] = desc 
    }

    private extractVariableStorageDescriptorV7(storage: StorageEntryMetadataV7): StorageDescriptor {
        const variable = new StorageDescriptor()
        
        switch (storage.type.type) {
            case StorageType.Plain:
            case "Type":
                variable.structure = StorageType.Plain
                variable.innerType = MustStringCodec(storage.type.asType)
                break

            case StorageType.Map:
            case "Map":
                variable.structure = StorageType.Map
                variable.mapKeyType = MustStringCodec(storage.type.asMap.get("key"))
                variable.innerType  = MustStringCodec(storage.type.asMap.get("value"))
                break

            case "DoubleMap":
                // FIXME! How?
                variable.structure = StorageType.Map
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
