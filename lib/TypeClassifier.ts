import { AccountId, EnumType, Hash, Struct, Vector } from "@polkadot/types"
import { getTypeDef, TypeDef, TypeDefInfo } from "@polkadot/types/codec"
import { TypeRegistry } from "@polkadot/types/codec/typeRegistry"
import { default as Null } from "@polkadot/types/primitive/Null"
import { default as U128 } from "@polkadot/types/primitive/U128"
import { default as U32 } from "@polkadot/types/primitive/U32"
import { default as U64 } from "@polkadot/types/primitive/U64"
import { Codec } from "@polkadot/types/types"
import { stringUpperFirst } from "@polkadot/util"
import { ModuleDescriptor, ModuleDescriptorIndex } from "./ModuleDescriptor"
import { SDLSchema } from "./SDLSchema"
import { StorageType } from "./StorageDescriptor"

export interface ITypeClassifier {
    queryBlockSDL(schema: SDLSchema, modules: ModuleDescriptorIndex): void
    moduleBlocksSDL(schema: SDLSchema, modules: ModuleDescriptorIndex): void
}

type SDLSchemaFragment = string

interface IStructType<T = string> {
    [index: string]: T
}

interface IStructTypes<T = string> {
    _Types: IStructType<T>
}

interface ICodecCallback {
    (classifier: TypeClassifier, schema: SDLSchema, type: string, codec: Codec): SDLSchemaFragment
}

class ICodecMapping {
    codec: any
    SDL?: SDLSchemaFragment
    customScalar?: boolean 
    callback?: ICodecCallback
}

const CodecMapping:ICodecMapping[] = [
    { codec: AccountId, SDL: "String" },
    { codec: Date, SDL: "Int" },
    { codec: EnumType, SDL: "UnknownEnum", customScalar: true }, // FIXME! Handle this properly
    { codec: Hash, SDL: "String" },
    { codec: Null, SDL: "Null", customScalar: true },
    { codec: Struct, 
      callback: (classifier: TypeClassifier, schema: SDLSchema, type: string, codec: Codec): SDLSchemaFragment => {
          classifier.decodeStruct(type, codec as Struct, schema)
          return type
      },
    },
    { codec: U32, SDL: "Int" },
    { codec: U64, SDL: "BigInt", customScalar: true },
    { codec: U128, SDL: "BigInt", customScalar: true },
    { codec: Uint8Array, SDL: "[Int]" },
    { codec: Vector, 
      callback: (classifier: TypeClassifier, schema: SDLSchema, type: string, codec: Codec): SDLSchemaFragment => {
          const raw = codec as Vector<any>
          return "[" + classifier.stringTypeToSDL(schema, raw.Type) + "]"
      },
    },
]

export class TypeClassifier {
    protected codecs: Record<string, Codec> = {}
    protected typeRegistry: TypeRegistry

    constructor(typeRegistry: TypeRegistry) {
        this.typeRegistry = typeRegistry
    }

    public assertCodec(typeName: string) {
        if (typeof this.codecs[typeName] !== "undefined") {
            return
        }

        const reg = this.typeRegistry.get(typeName)

        if (typeof reg !== "undefined") {
           this.codecs[typeName] = new reg()
        }
    }

    public moduleSDLName(moduleName: string): SDLSchemaFragment {
        return stringUpperFirst(moduleName) + "Module"
    }

    public decodeStruct<T extends Struct>(name: string, s: T, schema: SDLSchema) {
        if (schema.hasType(name)) {
            return
        }

        const t = schema.type(name)
        const types = s as unknown as IStructTypes
        const raw = s as unknown as IStructType<Codec>

        for (const key of Object.keys(types._Types)) {
            t.member(key, this.codecToSDL(types._Types[key], raw[key], schema))
        }
    }

    public codecToSDL<T extends Codec = Codec>(type: string, codec: T, schema: SDLSchema): SDLSchemaFragment {
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
                // FIXME! handle tuples
                schema.requireScalar("UnknownTuple")
                return "UnknownTuple"

            case TypeDefInfo.Vector:
                let sub = typeDef.sub

                if (typeof sub === "undefined") {
                    break
                }

                if (Array.isArray(sub)) {
                    throw new Error("Unexpected multiple sub-types in array")
                }

                sub = sub as TypeDef
                return "[" + this.typeDefToSDL(sub, schema, sub.type) + "]"
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

    public queryBlockSDL(schema: SDLSchema, modules: ModuleDescriptorIndex) {
        const q = schema.type("Query")

        for (const key of Object.keys(modules)) {
            const module = this.moduleSDLName(key)
            q.declaration(`${key}(block: BigInt = 0): ${module}`)
        }
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
}
