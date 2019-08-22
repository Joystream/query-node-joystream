import { SDLTypeDef } from "./SDLTypeDef"
import { SDLUnionDef } from "./SDLUnionDef"

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
    protected unions: Map<string, SDLUnionDef> = new Map()

    public line(value: string, indent: number = 0) {
        this.output += " ".repeat(indent * SDLTabSizeInSpaces) + value + "\n"
    }

    public type(name: string): SDLTypeDef {
        const typeDec = new SDLTypeDef(name)
        this.types.set(name, typeDec)
        return typeDec
    }

    public union(name: string): SDLUnionDef {
        const union = new SDLUnionDef(name)
        this.unions.set(name, union)
        return union
    }

    public hasType(name: string): boolean {
        return this.types.has(name)
    }

    public hasUnion(name: string): boolean {
        return this.unions.has(name)
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

        this.unions.forEach((u) => {
            u.write(this)
        })
    }

    public get SDL(): string {
        return this.output.trimEnd()
    }
}
