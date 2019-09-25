import { Enum} from "@polkadot/types"
import { Codec } from "@polkadot/types/types"
import { TypeEnum } from "./CodecClassifierEnum"
import { SDLSchema } from "./SDLSchema"

// FIXME! Mode to SDL package
export type SDLSchemaFragment = string

export interface ICodecSDLClassifier<T extends Codec> {
    codecToSDL(root: ICodecSDLClassifier<T>, type: string, codec: T, schema: SDLSchema): SDLSchemaFragment
}

export interface ICodecSerialiser<T extends Codec> {
    serialiseCodec(root: ICodecSerialiser<T>, codec: T): any
}

class ICodecMapping {
    public codec: any
    public SDL?: SDLSchemaFragment
    public customScalar?: boolean
    public typeClass?: any
}

// FIXME! Fill this out
const CodecMapping: ICodecMapping[] = [
    {
        codec: Enum,
        typeClass: TypeEnum,
    },
]

interface IType<T extends Codec = Codec>
    extends ICodecSDLClassifier<T>,
    ICodecSerialiser<T> {}

// tslint:disable-next-line:max-classes-per-file
export class Type<T extends Codec = Codec>
    implements IType<T> {

    public SDLName(): string {
        return ""
    }

    public codecToSDL(root: ICodecSDLClassifier<T>, type: string, codec: T, schema: SDLSchema): SDLSchemaFragment {
        for (let i = 0; i < CodecMapping.length; i++) {
            if (codec instanceof CodecMapping[i].codec) {
                // FIXME! Test this. Does it need to be wrapped in a function?
                const c = new CodecMapping[i].typeClass()
            }
        }

        // TODO: Run through codec types and process
        return "FixmeGenericType" + type
    }

    public serialiseCodec(root: ICodecSerialiser<T>, codec: T): any {
        return {}
    }
    }
