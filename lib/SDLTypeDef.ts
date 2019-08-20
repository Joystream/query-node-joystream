import { ISDLSchemaLine, ISDLSchemaLineWriter } from "./SDLSchema"

export class SDLTypeDef {
    protected buffer: ISDLSchemaLine[] = []
    protected ended: boolean = false

    constructor(name: string) {
        this.line(`type ${name} {`)
    }

    public member(name: string, value: string) {
        this.line(`${name}: ${value}`, 1)
    }

    public line(value: string, indent: number = 0) {
        this.buffer.push({
            indent,
            value,
        })
    }

    public declaration(content: string): SDLTypeDef {
        this.line(content, 1)
        return this
    }

    public end() {
        if (!this.ended) {
            this.line(`}`)
            this.ended = true
        }
    }

    public write(schema: ISDLSchemaLineWriter) {
        this.end()
        for (const buf of this.buffer) {
            schema.line(buf.value, buf.indent)
        }
    }
}
