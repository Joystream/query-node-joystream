import { SDLSchema } from "./SDLSchema"

export class SDLTypeDef {
    protected schema: SDLSchema

    constructor(schema: SDLSchema, name: string) {
        this.schema = schema
        this.schema.line(`type ${name} {`)
    }

    public declaration(content: string): SDLTypeDef {
        this.schema.line(content, 1)
        return this
    }

    public end() {
        this.schema.line(`}`)
    }
}
