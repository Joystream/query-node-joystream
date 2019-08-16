import { SDLTypeDef } from "./SDLTypeDef"

const SDLTabSizeInSpaces = 4

export class SDLSchema {
    protected output: string = ""
    protected scalars: string[] = []

    public line(value: string, indent: number = 0) {
        this.output += " ".repeat(indent * SDLTabSizeInSpaces) + value + "\n"
    }

    public type(name: string): SDLTypeDef {
        return new SDLTypeDef(this, name)
    }

    public requireScalar(name: string) {
        const index = this.scalars.findIndex((x) => x === name)
        if (index === -1) {
            this.scalars.push(name)
        }
    }

    public end() {
        this.scalars.forEach((s) => {
            this.line(`scalar ${s}`)
        })
    }

    public get SDL(): string {
        return this.output.trimEnd()
    }
}
