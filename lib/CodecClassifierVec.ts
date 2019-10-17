import { Vec } from "@polkadot/types"
import { Codec } from "@polkadot/types/types"
import { SDLSchema } from "./SDLSchema"
import { Type } from "./Type"
import { SDLSchemaFragment } from "./SDLSchema"
import { ICodecSDLClassifier, ICodecSerialiser } from "./CodecMapping"

export class TypeVec<T extends Vec<any> = Vec<any>> extends Type<T> {
    public codecToSDL(
        root: ICodecSDLClassifier<Codec>,
        type: string,
        codec: Vec<any>,
        schema: SDLSchema,
    ): SDLSchemaFragment {
		return "[" + this.stringTypeToSDL(schema, codec.Type) + "]"
    }

    public serialise(root: ICodecSerialiser<Codec>, codec: T): any {
        const output = []
        const entries = codec.toArray()

        // tslint:disable-next-line
        for (const k in entries) {
            output.push(root.serialiseCodec(root, entries[k]))
        }

        return output

    }
}
