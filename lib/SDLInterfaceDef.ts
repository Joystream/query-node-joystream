import { SDLTypeDef } from "./SDLTypeDef"

export class SDLInterfaceDef extends SDLTypeDef {
    constructor(name: string) {
        super(name)
    }

    protected typeName(): string {
        return "interface"
    }
}
