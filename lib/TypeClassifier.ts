import { TypeRegistry } from "@polkadot/types/codec/create/registry"
import { stringLowerFirst, stringUpperFirst } from "@polkadot/util"
import { ModuleDescriptor, ModuleDescriptorIndex } from "./ModuleDescriptor"
import { SDLSchema } from "./SDLSchema"
import { SDLTypeDef } from "./SDLTypeDef"
import { StorageType } from "./StorageDescriptor"
import { TrimString } from "./util"
import { IResolver, IResolverIndex, isIResolver } from "./WASMInstance"
import { SDLSchemaFragment } from "./SDLSchema"
import { Type } from "./Type"

export class TypeClassifier {
	protected rootType: Type

    constructor(rootType: Type) {
		this.rootType = rootType
    }
    
    public moduleSDLName(moduleName: string): SDLSchemaFragment {
        return stringUpperFirst(moduleName) + "Module"
    }

    public queryBlockSDL(schema: SDLSchema,
                         resolvers: IResolverIndex,
                         modules: ModuleDescriptorIndex) {

        const q = schema.type("Query")

        for (const key of Object.keys(modules)) {
            const module = this.moduleSDLName(key)
            q.declaration(`${stringLowerFirst(key)}(block: BigInt = 0): ${module}`)
        }

        this.resolversSDL(schema, resolvers)
    }

    public moduleBlocksSDL(schema: SDLSchema, modules: ModuleDescriptorIndex) {
        for (const key of Object.keys(modules)) {
            this.moduleBlockSDL(schema, key, modules[key])
        }
    }

    public moduleBlockSDL(schema: SDLSchema, name: string, module: ModuleDescriptor) {
        const m = schema.type(this.moduleSDLName(name))

        for (const key of Object.keys(module.storage)) {
            const variable = module.storage[key]

            // FIXME! Remove this
            if (variable.structure !== StorageType.Plain) {
                continue
            }

            m.declaration(variable.APIName + 
						  ": " + 
						  this.rootType.stringTypeToSDL(schema, variable.innerType))
        }
        m.end()
    }

    // Given an SDL string, like "Type" or "[Type]", make sure it has
    // a matching, parsed SDL definition.
    protected assertCodecFromSDL(schema: SDLSchema, sdlName: string) {
        const sdl = TrimString(sdlName, "[", "]")
        const codec = this.rootType.assertCodec(sdl)
        if (codec !== null) {
            this.rootType.codecToSDL(this.rootType, sdl, codec, schema)
        }
    }

    // FIXME! tap into
    protected resolversSDL(schema: SDLSchema,
                           resolvers: IResolverIndex,
                           parent: string = "Query") {
        for (const key of Object.keys(resolvers)) {
            if (isIResolver(resolvers[key])) {
                const q = schema.type(parent)
                this.resolverSDL(schema, q, key, resolvers[key] as IResolver)
            } else {
                this.resolversSDL(schema, resolvers[key] as IResolverIndex, key)
            }
        }
    }

    protected resolverSDL(schema: SDLSchema,
                          q: SDLTypeDef,
                          name: string,
                          resolver: IResolver) {
        this.assertCodecFromSDL(schema, resolver.returnTypeSDL)

        let args = ""

        if (resolver.filters.length > 0) {
            args = "(" + resolver.filters.join(", ") + ")"
        }

        // FIXME! Filters
        q.declaration(name + args + ": " + resolver.returnTypeSDL)
    }
}
