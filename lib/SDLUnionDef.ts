import { ISDLSchemaLineWriter } from "./SDLSchema"

export class SDLUnionDef {
    protected name: string
    protected members: string[] = []

    constructor(name: string) {
        this.name = name
    }

    public member(name: string) {
        this.members.push(name)
    }

    public write(schema: ISDLSchemaLineWriter) {
        schema.line("union " + this.name + " = " + this.members.join(" | "), 0)
    }
}
