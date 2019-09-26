import { Enum } from "@polkadot/types"
import { Codec } from "@polkadot/types/types"
import { SDLSchema } from "./SDLSchema"
import { ICodecSDLClassifier, ICodecSerialiser, SDLSchemaFragment, Type } from "./Type"

interface IStringIndex<T = string> {
    [index: string]: T
}

interface IEnumTypes<T = any> {
    _def: IStringIndex<T>
}

export class TypeEnum<T extends Enum = Enum> extends Type<T> {
    public typeName(type: string): string {
        return type
    }

    public codecToSDL(
        root: ICodecSDLClassifier<Codec>,
        type: string,
        codec: Enum,
        schema: SDLSchema,
    ): SDLSchemaFragment {
        const name = this.typeName(type)
        if (schema.hasType(name)) {
            return name
        }

        this.assertEnumInterface(schema)

        const u = schema.type(name, "Enum")
        const raw = codec as unknown as IEnumTypes<any>

        for (const key of Object.keys(raw._def)) {
            u.member(key, root.codecToSDL(root, key, new raw._def[key](), schema))
        }

        u.member("_enumType", "String")

        return name
    }

    public serialise(root: ICodecSerialiser<Codec>, codec: T): any {
        const output: any = {}
        output[codec.type] = root.serialiseCodec(root, codec.value)
        output._enumType = codec.type
        return output
    }

    protected assertEnumInterface(schema: SDLSchema) {
        // FIXME! Const strings
        const ifaceName = "Enum"
        if (!schema.hasInterface(ifaceName)) {
            const iface = schema.interface(ifaceName)
            iface.member("_enumType", "String")
        }
    }
}
