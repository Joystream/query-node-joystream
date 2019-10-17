import { Struct } from "@polkadot/types"
import { Codec } from "@polkadot/types/types"
import { SDLSchema } from "./SDLSchema"
import { Type } from "./Type"
import { SDLSchemaFragment } from "./SDLSchema"
import { ICodecSDLClassifier, ICodecSerialiser } from "./CodecMapping"

export interface IStringIndex<T = string> {
    [index: string]: T
}

export interface IStructTypes<T = string> {
    _Types: IStringIndex<T>
}

export class TypeStruct<T extends Struct = Struct> extends Type<T> {
    public typeName(type: string): string {
        return type
    }

    public codecToSDL(
        root: ICodecSDLClassifier<Codec>,
        type: string,
        codec: Struct,
        schema: SDLSchema,
    ): SDLSchemaFragment {
        const name = this.typeName(type)
        if (schema.hasType(name)) {
            return name
        }

        const t = schema.type(name)
        const types = codec as unknown as IStructTypes
        const raw = codec as unknown as IStringIndex<Codec>

        for (const key of Object.keys(types._Types)) {
            t.member(key, root.codecToSDL(root, types._Types[key], raw[key], schema))
        }

        return name
    }

    public serialise(root: ICodecSerialiser<Codec>, codec: T): any {
        const output: any = {}
        const types = codec as unknown as IStructTypes

        for (const key of Object.keys(types._Types)) {
            const raw = codec.get(key)

            if (typeof raw !== "undefined") {
                output[key] = root.serialiseCodec(root, raw)
            }
        }

        return output
    }
}
