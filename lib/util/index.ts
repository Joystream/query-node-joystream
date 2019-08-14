import { Codec } from "@polkadot/types/types"

export function MustStringCodec(codec: Codec | undefined): string {
    if (typeof codec !== "undefined") {
        return codec.toString()
    }
    throw new Error("Undefined codec string")
}
