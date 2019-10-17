import { Codec } from "@polkadot/types/types"
import { bool, GenericAccountId, H256, Null, u32, u64, u128 } from "@polkadot/types/primitive"
import { Text } from "@polkadot/types"
import { SDLSchema, SDLSchemaFragment } from "./SDLSchema"

export interface ICodecSDLClassifier<T extends Codec> {
    codecToSDL(root: ICodecSDLClassifier<T>, type: string, codec: T, schema: SDLSchema): SDLSchemaFragment
}

export interface ICodecSerialiser<T extends Codec> {
    serialiseCodec(root: ICodecSerialiser<T>, codec: T): any
}

class ICodecMapping {
    public codec: any
    public SDL?: string
    public customScalar?: boolean
    public typeClass?: any
}

export class CodecClassifier<T extends Codec = Codec> {
    public static readonly defaultClassifier: CodecClassifier = new CodecClassifier();
    protected mapping: ICodecMapping[] = [
        { codec: bool, SDL: "Boolean" },
        { codec: Date, SDL: "Int" },
        { codec: GenericAccountId, SDL: "String" },
        { codec: H256, SDL: "String" },
        { codec: Null, SDL: "Null", customScalar: true },
        { codec: u32, SDL: "Int" },
        { codec: u64, SDL: "BigInt", customScalar: true },
        { codec: u128, SDL: "BigInt", customScalar: true },
        { codec: Text, SDL: "String" },
        { codec: Uint8Array, SDL: "[Int]" },
    ]

    public classify(root: ICodecSDLClassifier<T>, 
					type: string, 
					codec: T, 
					schema: SDLSchema): SDLSchemaFragment {
        for (let i = 0; i < this.mapping.length; i++) {
            if (codec instanceof this.mapping[i].codec) {
                // Type classes handle all schema output
                if (typeof this.mapping[i].typeClass !== "undefined") {
                    const c = new this.mapping[i].typeClass()
                    return c.codecToSDL( root, type, codec, schema)
                }

                if (typeof this.mapping[i].SDL != "undefined") {
                    const scalar = this.mapping[i].SDL as string
                    if (typeof this.mapping[i].customScalar != "undefined") {
                        schema.requireScalar(scalar)
                    }
                    return scalar
                }
            }
        }

        // TODO: Run through codec types and process
        return "FixmeGenericType" + type
    }

    public serialise(root: ICodecSerialiser<T>, codec: T): any {
        for (let i = 0; i < this.mapping.length; i++) {
            if (codec instanceof this.mapping[i].codec &&
			    typeof this.mapping[i].typeClass !== "undefined") {
				const c = new this.mapping[i].typeClass()
			    return c.serialise(root, codec)
			}
		}
		return codec
	}

    public registerMapping(mapping: ICodecMapping) {
        this.mapping.push(mapping)
    }
}

export function DefaultCodecClassifier (): CodecClassifier {
    return CodecClassifier.defaultClassifier
}
