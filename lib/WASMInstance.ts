import { ApiPromise } from "@polkadot/api"
import { Codec } from "@polkadot/types/types"
import { stringLowerFirst } from "@polkadot/util"
import { ASUtil, instantiateBuffer } from "assemblyscript/lib/loader"
import { ILogger } from "./Logger"
import { ResolverExecutionContext } from "./ResolverExecutionContext"
import { implementsTKeys } from "./util"

export type pointer<T= {}> = number

interface IEnvImport extends Record<string, any> {
    memory: WebAssembly.Memory,
    table: WebAssembly.Table,
    bort?: (msg: number, file: number, line: number, column: number) => void,
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

export interface IResolver {
    returnTypeSDL: string
    filters: string[]
}

export function isIResolver(value: any): value is IResolver {
    return implementsTKeys<IResolver>(value, ["returnTypeSDL", "filters"])
}

export interface IResolverIndex {
    [index: string]: IResolver | IResolverIndex
}

type IResolverWrapper = any

interface IResolverNamespace {
    [index: string]: pointer<IResolverWrapper> | IResolverNamespace
}

export interface IResolverArgs {
    [index: string]: any
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
    SetTypedMapEntry(map: pointer<ITypedMap<string, IJSONResponse>>, key: pointer<string>, value: pointer<IJSONResponse>): void
    NewJson(kind: number, value: pointer<any>): pointer<IJSONResponse>
    NewContext(params: pointer<ITypedMap<string, IJSONResponse>>): pointer<ResolverExecutionContext>
    ResolveQuery(queryPtr: pointer<IResolverWrapper>, ctx: pointer<ResolverExecutionContext>): void
    ResolverType(queryPtr: pointer<IResolverWrapper>): pointer<string>
    ResolverParams(queryPtr: pointer<IResolverWrapper>): pointer<string[]>
    SetContextParams(ctxPtr: pointer<ResolverExecutionContext>, paramsPtr: pointer<ITypedMap<string, IJSONResponse>>): void
    SetContextParent(ctxPtr: pointer<ResolverExecutionContext>, paramsPtr: pointer<ITypedMap<string, IJSONResponse>>): void
}

interface IQueryModule extends ASUtil {
    // Required exported classes
    JSON: IJSONResponse
    JSONValueKind: any
    glue: IModuleGlue
    resolvers: IResolverNamespace
}

export class WASMInstance<T extends {} = {}> {
    public module: IQueryModule
    protected api: ApiPromise
    protected logger: ILogger
    protected importsObject: IImports
    protected executionContexts = new Map<pointer<ResolverExecutionContext>, ResolverExecutionContext>()

    constructor(src: Buffer, api: ApiPromise, logger: ILogger) {
        const typedArray = new Uint8Array(src)
        this.importsObject = this.imports()
        const lib = instantiateBuffer<T>(typedArray, this.importsObject)
        this.module = lib as unknown as IQueryModule
        this.api = api
        this.logger = logger

        // FIXME! Assert module sanity by checking for required types
    }

    public async exec(path: string[], args: IResolverArgs, root?: any): Promise<any> {
        const parent = this
        return new Promise<any>( (resolve, reject) => {
            const ctxPointer = this.newContext()
            const ctxVirtual = new ResolverExecutionContext(
                this,
                ctxPointer,
                resolve,
            )
            const paramsPtr = this.argsToStringJSONMap(ctxVirtual, args)
            this.module.glue.SetContextParams(ctxPointer, paramsPtr)
            
            if (typeof root !== "undefined") {
                const parentPtr = this.argsToStringJSONMap(ctxVirtual, root)
                this.module.glue.SetContextParent(ctxPointer, parentPtr)
            }

            this.executionContexts.set(ctxPointer, ctxVirtual)

            this.module.glue.ResolveQuery(this.findResolverFromPath(path), ctxPointer)
        })
    }

    public resolvers(input?: IResolverNamespace): IResolverIndex {
        if (typeof input === "undefined") {
            input = this.module.resolvers
        }

        const output: IResolverIndex = {}

        for (const key of Object.keys(input)) {
            // Resolvers will be Globals
            if (input[key] instanceof WebAssembly.Global) {
                output[key] = {
                    returnTypeSDL: this.module.__getString(
                        this.module.glue.ResolverType(
                            input[key] as pointer<IResolverWrapper>,
                        ),
                    ),
                    filters: this.stringArrayFromPointer(
                        this.module.__getArray(
                            this.module.glue.ResolverParams(
                                input[key] as pointer<IResolverWrapper>,
                            ),
                        ),
                    ),
                }
            } else {
                const ns = this.resolvers(input[key] as IResolverNamespace)
                output[key] = ns as IResolverIndex
            }
        }

        return output
    }

    public deleteContext(ptr: pointer<ResolverExecutionContext>) {
        this.executionContexts.delete(ptr)
        this.module.__release(ptr)
    }

    protected findResolverFromPath(path: string[]): pointer<IResolverWrapper> {
        let ctx: any = this.module.resolvers
        while (path.length > 0) {
            const fragment = path[0]
            path.shift()
            ctx = ctx[fragment]
        }
        return ctx as pointer<IResolverWrapper>
    }

    protected getExecutionContext(ctx: pointer<ResolverExecutionContext>): ResolverExecutionContext {
        const c = this.executionContexts.get(ctx)
        if (typeof c !== "undefined") {
            return c
        }

        throw new Error("No execution context for pointer " + ctx)
    }

    protected newContext(): pointer<ResolverExecutionContext> {
        return this.module.glue.NewContext(0)
    }

    protected stringArrayFromPointer(input: Array<pointer<string>>): string[] {
        const output: string[] = []

        for (let i = 0; i < input.length; i++) {
            output.push(this.module.__getString(input[i]))
        }

        return output
    }

    protected envModule(): IEnvImport {
        const parent = this
        return {
            abort(msg: any, file: any, line: any, column: any) {
                parent.logger.error(parent.module.__getString(file) + ":" + line + "/" + column, parent.module.__getString(msg))
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

    protected argsToStringJSONMap(ctx: ResolverExecutionContext, args: IResolverArgs): pointer<IJSONResponse> {
        const output = this.allocateStringJSONMap(ctx)
        for (const key of Object.keys(args)) {
            const strPtr = this.allocateString(ctx, key)
            const jsonPtr = this.parseJson(ctx, args[key])
            this.module.glue.SetTypedMapEntry(output, strPtr, jsonPtr)
        }
        return output
    }

    protected allocateStringJSONMap(ctx: ResolverExecutionContext): pointer<IJSONResponse> {
        const ptr = this.module.glue.NewStringJsonMap()
        return ctx.storePointer(ptr)
    }

    protected allocateString(ctx: ResolverExecutionContext, value: string): pointer<string> {
        const ptr = this.module.__retain(this.module.__allocString(value))
        return ctx.storePointer(ptr)
    }

    protected parseJson(ctx: ResolverExecutionContext, input: any): pointer<IJSONResponse> {
        const output: IJSONResponse = { kind: JSONValueKind.NULL, value: 0 }

        switch (typeof input) {
            case "number":
                output.kind = JSONValueKind.NUMBER
                output.value = input
                break

            case "object":
                // Make a new JSONObject
                const raw = this.allocateStringJSONMap(ctx)

                // FIXME! This doesn't work. Instantiate in WASM instead, and pass values directly
                for (const key of Object.keys(input)) {
                    this.module.glue.SetTypedMapEntry(raw,
                                                      this.allocateString(ctx, key),
                                                      this.parseJson(ctx, input[key]))
                }

                output.kind = JSONValueKind.OBJECT
                output.value = raw
                break

            case "string":
                output.kind = JSONValueKind.STRING
                output.value = this.allocateString(ctx, input)
                break

            case "boolean":
                output.kind = JSONValueKind.BOOL
                output.value = input ? 1 : 0
                break

            default:
                this.logger.error("Unknown:", typeof input)
        }

        const ptr =  this.module.glue.NewJson(output.kind, output.value)
        ctx.storePointer(ptr)
        return ptr
    }

    protected dispatchApiReponse(ctx: ResolverExecutionContext,
                                 codec: Codec,
                                 callback: pointer<() => void>,
                                 callbackWrapper?: pointer<() => void>) {
        const fn = this.importsObject.env.table.get(callback)
        if (fn !== null) {
            fn(ctx.toPointer(), this.parseJson(ctx, codec.toJSON()), callbackWrapper)
        }
    }

    protected handleApiRequestPromise(ctx: ResolverExecutionContext,
                                      promise: Promise<Codec>,
                                      callback: pointer<() => void>,
                                      callbackWrapper?: pointer<() => void>) {
        promise.then( (codec) => {
            this.dispatchApiReponse(ctx, codec, callback, callbackWrapper)
            ctx.decreaseExecDepth()
        }).catch((err) => {
            this.logger.error(err)
            ctx.resolveExecution()
        })
    }

    protected handleApiRequestPromiseArray(ctx: ResolverExecutionContext,
                                           promises: Array<Promise<Codec>>,
                                           callback: pointer<() => void>,
                                           callbackWrapper?: pointer<() => void>) {
        Promise.all(promises).then( (values) => {
            for (let i = 0; i < values.length; i++) {
                this.dispatchApiReponse(ctx, values[i], callback, callbackWrapper)
            }
            ctx.decreaseExecDepth()
        }).catch((err) => {
            this.logger.error(err)
            ctx.resolveExecution()
        })
    }

    // FIXME! This is currently assuming all map keys are numbers!
    protected apiModule(): any {
        return {
            call: async (context: pointer<ResolverExecutionContext>,
                         modulePtr: pointer<string>,
                         storagePtr: pointer<string>,
                         callback: pointer<() => void>) => {
                const ec = this.getExecutionContext(context)
                ec.increaseExecDepth()
                const module = this.module.__getString(modulePtr)
                const storage = stringLowerFirst(this.module.__getString(storagePtr))
                this.handleApiRequestPromise(ec,
                                             this.apiCall(module, storage),
                                             callback)
            },

            // CallWrapper is like call(), only it accepts a second function callback,
            // which is then passed into the first callback pointer as an argument.
            // This is used to work around dynamic function restrictions in AssemblyScript.
            callWrapper: async (context: pointer<ResolverExecutionContext>,
                                modulePtr: pointer<string>,
                                storagePtr: pointer<string>,
                                callback0: pointer<() => void>,
                                callback1: pointer<() => void>) => {
                const ec = this.getExecutionContext(context)
                ec.increaseExecDepth()
                const module = this.module.__getString(modulePtr)
                const storage = stringLowerFirst(this.module.__getString(storagePtr))
                this.handleApiRequestPromise(ec,
                                             this.apiCall(module, storage),
                                             callback0, callback1)
            },

            callWithArgNumber: async (context: pointer<ResolverExecutionContext>,
                                      modulePtr: pointer<string>,
                                      storagePtr: pointer<string>,
                                      key: pointer<any>, // FIXME! Number assumed
                                      callback: pointer<() => void>) => {
                const ec = this.getExecutionContext(context)
                ec.increaseExecDepth()
                const module = this.module.__getString(modulePtr)
                const storage = stringLowerFirst(this.module.__getString(storagePtr))
                this.handleApiRequestPromise(ec,
                                             this.apiCall(module, storage, key),
                                             callback)
            },

            // CallWithArgNumbeWrapper is like CallWrapper; it's used for getting around
            // restrictions in AssemblyScript.
            callWithArgNumberWrapper: async (context: pointer<ResolverExecutionContext>,
                                             modulePtr: pointer<string>,
                                             storagePtr: pointer<string>,
                                             key: pointer<any>, // FIXME! Number assumed
                                             callback0: pointer<() => void>,
                                             callback1: pointer<() => void>) => {
                const ec = this.getExecutionContext(context)
                ec.increaseExecDepth()
                const module = this.module.__getString(modulePtr)
                const storage = stringLowerFirst(this.module.__getString(storagePtr))
                this.handleApiRequestPromise(ec,
                                             this.apiCall(module, storage, key),
                                             callback0, callback1)
            },

            // CallWithArgNumbeWrapperBatch is batching version of callWithArgNumberWrapper.
            // It runs all the queries then makes the callbacks.
            callWithArgNumberWrapperBatch: async (context: pointer<ResolverExecutionContext>,
                                                  modulePtr: pointer<string>,
                                                  storagePtr: pointer<string>,
                                                  keysPtr: pointer<any[]>,
                                                  callback0: pointer<() => void>,
                                                  callback1: pointer<() => void>) => {
                const ec = this.getExecutionContext(context)
                ec.increaseExecDepth()
                const module = this.module.__getString(modulePtr)
                const storage = stringLowerFirst(this.module.__getString(storagePtr))
                const promises: Array<Promise<Codec>> = []
                const keys = this.module.__getArray(keysPtr)

                for (let i = 0; i < keys.length; i++) {
                    promises.push(this.apiCall(module, storage, keys[i]))
                }

                this.handleApiRequestPromiseArray(ec, promises, callback0, callback1)
            },

        }
    }

    // FIXME! This needs to be smarter and type safe
    protected responseModule(): any {
        return {
            numberField: (context: pointer<ResolverExecutionContext>, keyPtr: pointer<string>, value: number) => {
                this.getExecutionContext(context).numberField(keyPtr, value)
            },

            popObject: (context: pointer<ResolverExecutionContext>) => {
                this.getExecutionContext(context).popObject()
            },

            pushObject: (context: pointer<ResolverExecutionContext>) => {
                this.getExecutionContext(context).pushObject()
            },

            pushString: (context: pointer<ResolverExecutionContext>, value: pointer<string>) => {
                this.getExecutionContext(context).pushString(value)
            },

            stringField: (context: pointer<ResolverExecutionContext>, keyPtr: pointer<string>, valuePtr: pointer<string>) => {
                this.getExecutionContext(context).stringField(keyPtr, valuePtr)
            },
        }
    }

    protected consoleModule(): any {
        return {
            log: (value: any) => {
                this.logger.info(value)
            },
            logs: (value: pointer<string>) => {
                this.logger.info("console.log", this.module.__getString(value)) 
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
