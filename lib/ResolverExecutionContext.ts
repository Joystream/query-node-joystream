import { pointer, WASMInstance } from "./WASMInstance"

type PromiseResolver = (value: any) => void

export class ResolverExecutionContext {
    protected parent: WASMInstance
    protected contexPtr: pointer<ResolverExecutionContext>
    protected resolveFunc: PromiseResolver
    protected depth: number = 0
    protected response: any = []
    protected reference: any = this.response
    protected referenceStack: any = [this.response]
    protected pointers = new Array<pointer<any>>()

    constructor(parent: WASMInstance,
                ptr: pointer<ResolverExecutionContext>,
                execResolve: PromiseResolver) {
        this.parent = parent
        this.contexPtr = ptr
        this.resolveFunc = execResolve
    }

    public toPointer(): pointer<ResolverExecutionContext> {
        return this.contexPtr
    }

    public numberField(keyPtr: pointer<string>, value: number) {
        const key = this.parent.module.__getString(keyPtr)
        this.reference[key] = value
    }

    public popObject() {
        this.referenceStack.pop()
        this.reference = this.referenceStack[this.referenceStack.length - 1]
    }

    public pushObject() {
        const object = {}
        this.reference = object
        this.referenceStack.push(object)
        this.response.push(object)
    }

    public pushString(value: pointer<string>) {
        this.reference.push(this.parent.module.__getString(value))
    }

    public stringField(keyPtr: pointer<string>, valuePtr: pointer<string>) {
        const key = this.parent.module.__getString(keyPtr)
        const value = this.parent.module.__getString(valuePtr)
        this.reference[key] = value
    }

    public storePointer(ptr: pointer<any>): pointer<any> {
        this.pointers.push(ptr)
        return ptr
    }

    public resolveExecution() {
        if (typeof this.resolveFunc !== "undefined") {
            this.resolveFunc(this.response)
        }

        while (this.pointers.length > 0) {
            const ptr = this.pointers.pop()
            this.parent.module.__release(ptr as pointer<any>)
        }

        this.parent.deleteContext(this.contexPtr)
    }

    public increaseExecDepth(depth: number = 1) {
        this.depth += depth
    }

    public decreaseExecDepth(depth: number = 1) {
        this.depth -= depth
        if (this.depth === 0) {
            this.resolveExecution()
        }
    }
}
