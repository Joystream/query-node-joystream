import { Codec } from "@polkadot/types/types"

export function MustStringCodec(codec: Codec | undefined): string {
    if (typeof codec !== "undefined") {
        return codec.toString()
    }
    throw new Error("Undefined codec string")
}

export function TrimString(str: string, ch0: string, ch1: string) {
    let start = 0
    let end = str.length

    while (start < end && str[start] === ch0) {
        ++start
    }

    while (end > start && str[end - 1] === ch1) {
        --end
    }

    return (start > 0 || end < str.length) ? str.substring(start, end) : str
}
