import { ISDLSchemaLine, ISDLSchemaLineWriter } from "./SDLSchema"

export class SDLTypeDef {
    protected buffer: ISDLSchemaLine[] = []
    protected ended: boolean = false
    protected name: string
    protected implements: string|undefined

    constructor(name: string, implementsInterface?: string) {
        this.name = name
        this.implements = implementsInterface
        this.start()
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

    protected typeName(): string {
        return "type"
    }

    protected start() {
        let ext: string = ""

        if (this.implements) {
            ext = `implements ${this.implements} `
        }

        this.line(`${this.typeName()} ${this.name} ${ext}{`)
    }
}
