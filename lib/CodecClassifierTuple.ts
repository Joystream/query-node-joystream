import { Tuple } from "@polkadot/types"
import { Codec } from "@polkadot/types/types"
import { SDLSchema } from "./SDLSchema"
import { Type } from "./Type"
import { SDLSchemaFragment } from "./SDLSchema"
import { ICodecSDLClassifier, ICodecSerialiser } from "./CodecMapping"
import { stringLowerFirst } from "@polkadot/util"

export class TypeTuple<T extends Tuple = Tuple> extends Type<T> {
    public typeName(parts: string[]): string {
        return parts.join("") + "Tuple"
    }

    public codecToSDL(
        root: ICodecSDLClassifier<Codec>,
        type: string,
        codec: Tuple,
        schema: SDLSchema,
    ): SDLSchemaFragment {
        const name = this.typeName(codec.Types)
        if (schema.hasType(name)) {
            return name
        }

        const def = schema.type(name)
        const parent = this

        // tslint:disable-next-line
        for (const k in codec.Types) {
            const value = codec.Types[k]
            def.member(stringLowerFirst(value), this.stringTypeToSDL(schema, value))
        }

        return name
    }

    public serialise(root: ICodecSerialiser<Codec>, codec: T): any {
		const tupleEntries = codec.toArray()
        const entryOutput: any = {}

        // tslint:disable-next-line
        for (const i in codec.Types) {
            entryOutput[stringLowerFirst(codec.Types[i])] = root.serialiseCodec(root, tupleEntries[i])
        }

        return entryOutput

    }
}
