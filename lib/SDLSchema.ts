import { SDLTypeDef } from "./SDLTypeDef"

const SDLTabSizeInSpaces = 4

export interface ISDLSchemaLine {
    indent: number
    value: string
}

export interface ISDLSchemaLineWriter {
    line(value: string, indent: number): void
}

export class SDLSchema implements ISDLSchemaLineWriter {
    protected output: string = ""
    protected scalars: string[] = []
    protected types: Map<string, SDLTypeDef> = new Map()

    public line(value: string, indent: number = 0) {
        this.output += " ".repeat(indent * SDLTabSizeInSpaces) + value + "\n"
    }

    public type(name: string): SDLTypeDef {
        const typeDec = new SDLTypeDef(name)
        this.types.set(name, typeDec)
        return typeDec
    }

    public hasType(name: string): boolean {
        return this.types.has(name)
    }

    public requireScalar(name: string) {
        const index = this.scalars.findIndex((x) => x === name)
        if (index === -1) {
            this.scalars.push(name)
        }
    }

    public end() {
        this.types.forEach((t) => {
            t.write(this)
        })

        this.scalars.forEach((s) => {
            this.line(`scalar ${s}`)
        })
    }

    public get SDL(): string {
        return this.output.trimEnd()
    }
}
