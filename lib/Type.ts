import { Codec } from "@polkadot/types/types"
import { TypeDef, TypeDefInfo } from "@polkadot/types/codec/create/types"
import { TypeRegistry } from "@polkadot/types/codec/create/registry"
import { getTypeClass, getTypeDef } from "@polkadot/types/codec"
import { SDLSchema, SDLSchemaFragment } from "./SDLSchema"
import { DefaultCodecClassifier, ICodecSDLClassifier, ICodecSerialiser } from "./CodecMapping"

interface IType<T extends Codec = Codec>
    extends ICodecSDLClassifier<T>,
    ICodecSerialiser<T> {}

// tslint:disable-next-line:max-classes-per-file
export class Type<T extends Codec = Codec> implements IType<T> {
    protected codecs: Record<string, Codec> = {}
    protected typeRegistry: TypeRegistry

    constructor(reg: TypeRegistry) {
        this.typeRegistry = reg
    }

    public SDLName(): string {
        return ""
    }

    public codecToSDL(root: ICodecSDLClassifier<T>, 
                      type: string, 
                      codec: T, 
                      schema: SDLSchema): SDLSchemaFragment {
        return DefaultCodecClassifier().classify(root, type, codec, schema)
    }

    public serialiseCodec(root: ICodecSerialiser<T>, codec: T): any {
        return DefaultCodecClassifier().serialise(root, codec)
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
                return this.codecToSDL(this, type, tuple as T, schema)

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
        }

        this.assertCodec(type)
        const codec = this.codecs[type]

        return this.codecToSDL(this, type, codec as T, schema)
    }
}
