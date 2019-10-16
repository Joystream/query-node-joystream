import {  Text, Tuple } from "@polkadot/types"
import { Enum, Struct } from "@polkadot/types"
import { Vec } from "@polkadot/types/codec"
import { getTypeClass, getTypeDef } from "@polkadot/types/codec"
import { TypeRegistry } from "@polkadot/types/codec/create/registry"
import { TypeDef, TypeDefInfo } from "@polkadot/types/codec/create/types"
import { bool, GenericAccountId as AccountId } from "@polkadot/types/primitive"
import { H256 } from "@polkadot/types/primitive"
import { default as Null } from "@polkadot/types/primitive/Null"
import { default as U128 } from "@polkadot/types/primitive/U128"
import { default as U32 } from "@polkadot/types/primitive/U32"
import { default as U64 } from "@polkadot/types/primitive/U64"
import { Codec } from "@polkadot/types/types"
import { stringLowerFirst, stringUpperFirst } from "@polkadot/util"
import { ModuleDescriptor, ModuleDescriptorIndex } from "./ModuleDescriptor"
import { SDLSchema } from "./SDLSchema"
import { SDLTypeDef } from "./SDLTypeDef"
import { StorageType } from "./StorageDescriptor"
import { TrimString } from "./util"
import { IResolver, IResolverIndex, isIResolver } from "./WASMInstance"

// FIXME! Rename this
import { TypeEnum } from "./CodecClassifierEnum"
import { Type } from "./Type"

type SDLSchemaFragment = string

interface IStringIndex<T = string> {
    [index: string]: T
}

export interface IStructTypes<T = string> {
    _Types: IStringIndex<T>
}

interface IEnumTypes<T = any> {
    _def: IStringIndex<T>
}

type ICodecCallback = (classifier: TypeClassifier, schema: SDLSchema, type: string, codec: Codec) => SDLSchemaFragment

class ICodecMapping {
    public codec: any
    public SDL?: SDLSchemaFragment
    public customScalar?: boolean
    public callback?: ICodecCallback
}

const CodecMapping: ICodecMapping[] = [
    { codec: AccountId, SDL: "String" },
    { codec: bool, SDL: "Boolean" },
    { codec: Date, SDL: "Int" },
    { callback: (classifier: TypeClassifier, schema: SDLSchema, type: string, codec: Codec): SDLSchemaFragment => {
        // TODO! Create type which has optional values for each of the fields
        // Update: or a union? How to handle __typename?
        return classifier.decodeEnum(type, codec as Enum, schema)
      },
      codec: Enum,
    },
    { codec: H256, SDL: "String" },
    { codec: Null, SDL: "Null", customScalar: true },
    { callback: (classifier: TypeClassifier, schema: SDLSchema, type: string, codec: Codec): SDLSchemaFragment => {
            classifier.decodeStruct(type, codec as Struct, schema)
            return type
      },
      codec: Struct,
    },
    { callback: (classifier: TypeClassifier, schema: SDLSchema, type: string, codec: Codec): SDLSchemaFragment => {
            return classifier.decodeTuple(codec as Tuple, schema)
      },
      codec: Tuple,
    },
    { codec: Text, SDL: "String" },
    { codec: U32, SDL: "Int" },
    { codec: U64, SDL: "BigInt", customScalar: true },
    { codec: U128, SDL: "BigInt", customScalar: true },
    { codec: Uint8Array, SDL: "[Int]" },
    { callback: (classifier: TypeClassifier, schema: SDLSchema, type: string, codec: Codec): SDLSchemaFragment => {
            const raw = codec as Vec<any>
            return "[" + classifier.stringTypeToSDL(schema, raw.Type) + "]"
        },
      codec: Vec,
    },
]

// tslint:disable-next-line:max-classes-per-file
export class TypeClassifier {
    protected codecs: Record<string, Codec> = {}
    protected typeRegistry: TypeRegistry

    constructor(typeRegistry: TypeRegistry) {
        this.typeRegistry = typeRegistry
    }

    public assertCodec(typeName: string): Codec | null {
        if (typeof this.codecs[typeName] !== "undefined") {
            return this.codecs[typeName]
        }

        const reg = this.typeRegistry.get(typeName)

        if (typeof reg !== "undefined") {
            this.codecs[typeName] = new reg()
        }

        return this.codecs[typeName]
    }

    public moduleSDLName(moduleName: string): SDLSchemaFragment {
        return stringUpperFirst(moduleName) + "Module"
    }

    public enumName(type: string): string {
        return type
    }

    public decodeEnum<T extends EnumType<any>>(type: string, codec: T, schema: SDLSchema): string {
        const classifier = new TypeEnum()
        // FIXME! Classifier won't work here. 
        return classifier.codecToSDL(classifier, type, codec, schema)
    }

    public decodeStruct<T extends Struct>(name: string, s: T, schema: SDLSchema) {
        if (schema.hasType(name)) {
            return
        }

        const t = schema.type(name)
        const types = s as unknown as IStructTypes
        const raw = s as unknown as IStringIndex<Codec>

        for (const key of Object.keys(types._Types)) {
            t.member(key, this.codecToSDL(types._Types[key], raw[key], schema))
        }
    }

    public tupleName(parts: string[]): string {
        return parts.join("") + "Tuple"
    }

    public decodeTuple<T extends Tuple>(t: T, schema: SDLSchema): SDLSchemaFragment {
        const name = this.tupleName(t.Types)

        if (schema.hasType(name)) {
            return name
        }

        const def = schema.type(name)
        const parent = this

        // tslint:disable-next-line
        for (const k in t.Types) {
            const value = t.Types[k]
            def.member(stringLowerFirst(value), parent.stringTypeToSDL(schema, value))
        }

        return name
    }

    public codecToSDL<T extends Codec = Codec>(type: string, codec: T, schema: SDLSchema): SDLSchemaFragment {
        const t = new Type()
        return t.codecToSDL(t, type, codec, schema)
        // FIXME! Delete this
        /*
        for (let i = 0; i < CodecMapping.length; i++) {
            if (codec instanceof CodecMapping[i].codec) {
                let value = CodecMapping[i].SDL

                const callback = CodecMapping[i].callback
                if (typeof callback !== "undefined") {
                    value = callback(this, schema, type, codec)
                }

                if (typeof value === "undefined") {
                    return "UndefinedType" + type
                }

                if (CodecMapping[i].customScalar === true) {
                    schema.requireScalar(value)
                }

                return value
            }
        }

        return "CodecToSDLFailed" + type
        */
    }

    public stringTypeToSDL(schema: SDLSchema, type: string): SDLSchemaFragment {
        const decoded = getTypeDef(type)
        return this.typeDefToSDL(decoded, schema, type)
    }

    public typeDefToSDL(typeDef: TypeDef, schema: SDLSchema, type: string): SDLSchemaFragment {
        switch (typeDef.info) {
            case TypeDefInfo.Plain:
                return this.plainTypeToSDL(schema, type)

            case TypeDefInfo.Tuple:
                const constructor = getTypeClass(typeDef)
                const tuple = new constructor()
                return this.decodeTuple(tuple as Tuple, schema)

            case TypeDefInfo.Vec:
                let sub = typeDef.sub

                if (typeof sub === "undefined") {
                    break
                }

                if (Array.isArray(sub)) {
                    throw new Error("Unexpected multiple sub-types in array")
                }

                sub = sub as TypeDef
                return "[" + this.typeDefToSDL(sub, schema, sub.type) + "]"
                return "String"

           case TypeDefInfo.VecFixed:
                // FIXME! Is this always a string? It is for AccountId
                return "String"
        }

        throw new Error(`Unknown TypeDef type: ${type}`)
    }

    public plainTypeToSDL(schema: SDLSchema, type: string): SDLSchemaFragment {
        // Basic types
        switch (type) {
            case "bool":
                return "Boolean"

            case "u32":
                return "Int"
        }

        this.assertCodec(type)
        const codec = this.codecs[type]

        return this.codecToSDL(type, codec, schema)
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

            m.declaration(variable.APIName + ": " + this.stringTypeToSDL(schema, variable.innerType))
        }
        m.end()
    }

    // Given an SDL string, like "Type" or "[Type]", make sure it has
    // a matching, parsed SDL definition.
    protected assertCodecFromSDL(schema: SDLSchema, sdlName: string) {
        const sdl = TrimString(sdlName, "[", "]")
        const codec = this.assertCodec(sdl)
        if (codec !== null) {
            this.codecToSDL(sdl, this.codecs[sdl], schema)
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
