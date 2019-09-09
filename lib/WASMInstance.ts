import { ApiPromiseInterface } from "@polkadot/api/promise/types"
import { Codec } from "@polkadot/types/types"
import { stringLowerFirst } from "@polkadot/util"
import { ASUtil, instantiateBuffer } from "assemblyscript/lib/loader"
import { ILogger } from "../lib/Logger"

type pointer<T= {}> = number

interface IEnvImport extends Record<string, any> {
    memory: WebAssembly.Memory,
    table: WebAssembly.Table,
    abort?: (msg: number, file: number, line: number, column: number) => void,
}

interface IImports extends Record<string, any> {
    env: IEnvImport
}

interface IWrapper<T> {
    wrap(object: any): pointer<T>
}

interface IJSONResponse {
    kind: number
    value: pointer<any>
}

interface ITypedMapEntry<K, V> extends IWrapper<ITypedMap<K, V>> {
    key: pointer<K>
    value: V
}

interface ITypedMap<K, V> extends IWrapper<ITypedMap<K, V>> {
    entries: pointer<Array<ITypedMapEntry<K, V>>>
    test: number
}

// FIXME! This should be read from the WASM blob, not mirrored like this
enum JSONValueKind {
    NULL = 0,
    BOOL = 1,
    NUMBER = 2,
    STRING = 3,
    ARRAY = 4,
    OBJECT = 5,
}

interface IModuleGlue {
    NewStringJsonMap: () => pointer<IJSONResponse>
    SetTypedMapEntry(map: pointer<ITypedMap<string, JSON>>, key: pointer<string>, value: pointer<IJSONResponse>): void
    NewJson(kind: number, value: pointer<any>): pointer<IJSONResponse>
}

interface IQueryModule extends ASUtil {
    // Required exported classes
    ID_STRINGJSONMAP: number
    JSON: IJSONResponse
    JSONValueKind: any
    glue: IModuleGlue
}

type PromiseResolver = (value: any) => void

export class WASMInstance<T extends {}> {
    public module: IQueryModule
    protected api: ApiPromiseInterface
    protected logger: ILogger
    protected importsObject: IImports
    protected execDepth: number = 0
    protected execResolve?: PromiseResolver
    protected execContext: any = []
    protected execReference: any = this.execContext
    protected execReferenceStack: any = [this.execContext]
    protected pointers = new Array<pointer<any>>()

    constructor(src: Buffer, api: ApiPromiseInterface, logger: ILogger) {
        const typedArray = new Uint8Array(src)
        this.importsObject = this.imports()
        const lib = instantiateBuffer<T>(typedArray, this.importsObject)
        this.module = lib as unknown as IQueryModule
        this.api = api
        this.logger = logger

        // FIXME! Assert module sanity by checking for required types
    }

    // Question: should we call the function, or object instances?
    // Which is better for memory?
    public async exec(name: string): Promise<any> {
        const parent = this
        return new Promise<any>( (resolve, reject) => {
            const obj = this.module as any
            parent.execResolve = resolve
            obj[name]()
        })
    }

    protected resolveExecution() {
        if (typeof this.execResolve !== "undefined") {
            this.execResolve(this.execContext)
            this.execResolve = void 0
        }

        while (this.pointers.length > 0) {
            const ptr = this.pointers.pop()
            this.module.__release(ptr as pointer<any>)
        }
    }

    protected envModule(): IEnvImport {
        return {
            abort(msg: any, file: any, line: any, column: any) {
                this.logger.error("abort called at main.ts:" + line + ":" + column)
            },
            memory: new WebAssembly.Memory({
                initial: 256,
            }),
            memoryBase: 0,
            table: new WebAssembly.Table({
                element: "anyfunc",
                initial: 256,
            }),
            tableBase: 0,
        }
    }

    protected apiCall(module: string, storage: string, key?: any): Promise<Codec> {
        if (typeof key !== "undefined") {
            const fn = this.api.query[module][storage] as (key: string) => Promise<Codec>
            return fn(key)
        }
        return this.api.query[module][storage]()
    }

    protected storePointer(ptr: pointer<any>): pointer<any> {
        this.pointers.push(ptr)
        return ptr
    }

    protected allocateStringJSONMap(): pointer<IJSONResponse> {
        const ptr = this.module.glue.NewStringJsonMap()
        return this.storePointer(ptr)
    }

    protected allocateString(value: string): pointer<string> {
        const ptr = this.module.__retain(this.module.__allocString(value))
        return this.storePointer(ptr)
    }

    protected parseJson(input: any): pointer<IJSONResponse> {
        const output: IJSONResponse = { kind: JSONValueKind.NULL, value: 0 }

        switch (typeof input) {
            case "number":
                output.kind = JSONValueKind.NUMBER
                output.value = input
                break

            case "object":
                // Make a new JSONObject
                const raw = this.allocateStringJSONMap()

                // FIXME! This doesn't work. Instantiate in WASM instead, and pass values directly
                for (const key of Object.keys(input)) {
                    this.module.glue.SetTypedMapEntry(raw, this.allocateString(key), this.parseJson(input[key]))
                }

                output.kind = JSONValueKind.OBJECT
                output.value = raw
                break

            case "string":
                output.kind = JSONValueKind.STRING
                output.value = this.allocateString(input)
                break

            case "boolean":
                output.kind = JSONValueKind.BOOL
                output.value = input ? 1 : 0
                break

            default:
                this.logger.error("Unknown:", typeof input)
        }

        return this.module.glue.NewJson(output.kind, output.value)
    }

    protected handleApiRequestPromise(promise: Promise<Codec>,
                                      callback: pointer<() => void>,
                                      callbackWrapper?: pointer<() => void>) {
        promise.then( (codec) => {
            const fn = this.importsObject.env.table.get(callback)
            if (fn !== null) {
                fn(this.parseJson(codec.toJSON()), callbackWrapper)
            }
            this.execDepth--
            if (this.execDepth === 0) {
                this.resolveExecution()
            }
        }).catch((err) => {
            // FIXME! Signal error
            this.logger.error(err)
            this.resolveExecution()
        })
    }

    protected apiModule(): any {
        return {
            call: async (modulePtr: pointer<string>,
                         storagePtr: pointer<string>,
                         callback: pointer<() => void>) => {
                this.execDepth++
                const module = this.module.__getString(modulePtr)
                const storage = stringLowerFirst(this.module.__getString(storagePtr))
                this.handleApiRequestPromise(this.apiCall(module, storage), callback)
            },

            // CallWrapper is like call(), only it accepts a second function callback,
            // which is then passed into the first callback pointer as an argument.
            // This is used to work around dynamic function restrictions in AssemblyScript.
            callWrapper: async (modulePtr: pointer<string>,
                                storagePtr: pointer<string>,
                                callback0: pointer<() => void>,
                                callback1: pointer<() => void>) => {
                this.execDepth++
                const module = this.module.__getString(modulePtr)
                const storage = stringLowerFirst(this.module.__getString(storagePtr))
                this.handleApiRequestPromise(this.apiCall(module, storage), callback0, callback1)
            },

            callWithArgNumber: async (modulePtr: pointer<string>,
                                      storagePtr: pointer<string>,
                                      key: number,
                                      callback: pointer<() => void>) => {
                this.execDepth++
                const module = this.module.__getString(modulePtr)
                const storage = stringLowerFirst(this.module.__getString(storagePtr))
                this.handleApiRequestPromise(this.apiCall(module, storage, key), callback)
            },

            // CallWithArgNumbeWrapper is like CallWrapper; it's used for getting around
            // restrictions in AssemblyScript.
            callWithArgNumberWrapper: async (modulePtr: pointer<string>,
                                             storagePtr: pointer<string>,
                                             key: number,
                                             callback0: pointer<() => void>,
                                             callback1: pointer<() => void>) => {
                this.execDepth++
                const module = this.module.__getString(modulePtr)
                const storage = stringLowerFirst(this.module.__getString(storagePtr))
                this.handleApiRequestPromise(this.apiCall(module, storage, key), callback0, callback1)
            },
        }
    }

    // FIXME! This needs to be smarter and type safe
    protected responseModule(): any {
        return {
            numberField: (keyPtr: pointer<string>, value: number) => {
                const key = this.module.__getString(keyPtr)
                this.execReference[key] = value
            },
            popObject: () => {
                this.execReferenceStack.pop()
                this.execReference = this.execReferenceStack[this.execReferenceStack.length - 1]
            },
            pushObject: () => {
                const object = {}
                this.execReference = object
                this.execReferenceStack.push(object)
                this.execContext.push(object)
            },
            pushString: (value: pointer<string>) => {
                this.execReference.push(this.module.__getString(value))
            },
            stringField: (keyPtr: pointer<string>, valuePtr: pointer<string>) => {
                const key = this.module.__getString(keyPtr)
                const value = this.module.__getString(valuePtr)
                this.execReference[key] = value
            },
        }
    }

    protected consoleModule(): any {
        return {
            log: (value: any) => {
                this.logger.info(value)
            },
            logs: (value: pointer<string>) => {
                this.logger.info("console.log", this.module.__getString(value)) // FIXME! Allow console.log (lint)
            },
        }
    }

    protected imports(): IImports {
        return {
            api: this.apiModule(),
            console: this.consoleModule(),
            env: this.envModule(),
            response: this.responseModule(),
        }
    }
}
