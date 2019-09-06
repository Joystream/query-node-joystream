import { ApiPromiseInterface } from "@polkadot/api/promise/types"
import { ASUtil, instantiateBuffer } from "assemblyscript/lib/loader"
import { Codec } from "@polkadot/types/types"
import { stringLowerFirst } from "@polkadot/util"

type pointer<T = {}> = number
type stringPointer = number
type arrayPointer = number

interface EnvImport extends Record<string, any> {
    memory: WebAssembly.Memory,
    table: WebAssembly.Table,
    abort?: (msg: number, file: number, line: number, column: number) => void,
}

interface Imports extends Record<string, any> {
    env: EnvImport
}

interface wrapper<T> {
    wrap(object: any): pointer<T>
}

interface JSONResponse {
    kind: number
    value: pointer<any>
}

interface TypedMapEntry<K, V> extends wrapper<TypedMap<K, V>>{
  new(): TypedMapEntry<K, V>
  key: pointer<K>
  value: V
}

interface TypedMap<K, V> extends wrapper<TypedMap<K, V>> {
    new(): TypedMap<K, V>
	entries: pointer<Array<TypedMapEntry<K, V>>>
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
const JSONStringMapClassName = "TypedMap<~lib/string/String,api/JSON>"
const JSONStringMapEntryClassName = "TypedMapEntry<~lib/string/String,api/JSON>"

interface IModuleGlue {
	NewStringJsonMap: () => pointer<JSONResponse>
	SetTypedMapEntry(map: pointer<TypedMap<string,JSON>>, key:pointer<string>, value: pointer<JSONResponse>): void 
	NewJson(kind: number, value: pointer<any>): pointer<JSONResponse>
}

interface IQueryModule extends ASUtil {
    // Required exported classes
	ID_STRINGJSONMAP: number
    JSON: JSONResponse
    JSONValueKind: any
	glue: IModuleGlue
	"TypedMap<~lib/string/String,api/JSON>": TypedMap<string, pointer<JSONResponse>>
	"TypedMapEntry<~lib/string/String,api/JSON>": TypedMapEntry<string, pointer<JSONResponse>>
}

interface IPromiseResolver {
    (value:any): void
}

export class WASMInstance<T extends {}> {
    public module: IQueryModule
    protected api: ApiPromiseInterface
    protected importsObject: Imports
    protected execDepth:number = 0
    protected execResolve?:IPromiseResolver
    protected execContext:any = [] // FIXME! Should be JSON builder
	protected execReference:any = this.execContext
	protected execReferenceStack:any = [this.execContext]

    constructor(src: Buffer, api: ApiPromiseInterface) {
        const typedArray = new Uint8Array(src)
        this.importsObject = this.imports()
        const lib = instantiateBuffer<T>(typedArray, this.importsObject)
        this.module = lib as unknown as IQueryModule
        this.api = api

        // FIXME! Assert module sanity by checking for required types
    }

    // Question: should we call the function, or object instances?
    // Which is better for memory?
    public async exec(name:string): Promise<any> {
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
    }

    protected envModule(): EnvImport {
        return {
            memoryBase: 0,
            tableBase: 0,
            memory: new WebAssembly.Memory({
                initial: 256,
            }),
            table: new WebAssembly.Table({
                initial: 256,
                element: "anyfunc",
            }),
            abort(msg: any, file: any, line: any, column: any) {
                console.error("abort called at main.ts:" + line + ":" + column)
            },
        }
    }

    protected apiCall(module: string, storage: string, key?: any): Promise<Codec>{
		if (typeof key !== "undefined") {
			const fn = this.api.query[module][storage] as (key:string) => Promise<Codec>
			return fn(key)
		}
        return this.api.query[module][storage]() 
    }

    protected parseJson(input: any): pointer<JSONResponse> {
        const output:JSONResponse = { kind: JSONValueKind.NULL, value: 0 }

        switch(typeof input) {
            case "number":	
				output.kind = JSONValueKind.NUMBER
				output.value = input
				break

			case "object":
				// Make a new JSONObject
				const raw = this.module.glue.NewStringJsonMap()

				// FIXME! This doesn't work. Instantiate in WASM instead, and pass values directly
			    for (const key of Object.keys(input)) {
					this.module.glue.SetTypedMapEntry(raw, this.module.__allocString(key), this.parseJson(input[key]))
				}

			    output.kind = JSONValueKind.OBJECT	
				output.value = raw
			    break

			case "string":
			    output.kind = JSONValueKind.STRING
				output.value = this.module.__retain(this.module.__allocString(input))
				break

			case "boolean":
			    output.kind = JSONValueKind.BOOL
				output.value = input ? 1 : 0
				break

			default:
				console.log("Unknown:",typeof input)
        } 

        return this.module.glue.NewJson(output.kind, output.value)
    }

    protected handleApiRequestPromise(promise: Promise<Codec>, callback: pointer<() => void>) {
       promise.then( (codec) => {
            const fn = this.importsObject.env.table.get(callback)
            if (fn !== null) {
                fn(this.parseJson(codec.toJSON()))
            }
            this.execDepth--
                if (this.execDepth == 0) {
                this.resolveExecution()
            }
        }).catch((err) => {
            // FIXME! Signal error
			console.log(err)
            this.resolveExecution()
        })
    }

    protected apiModule(): any {
        return {
            // FIXME! Replace with APICall struct
            call: async (modulePtr: pointer<string>, storagePtr: pointer<string>, callback: pointer<() => void>) =>{
                this.execDepth++
                const module = this.module.__getString(modulePtr)   
                const storage = stringLowerFirst(this.module.__getString(storagePtr))
                this.handleApiRequestPromise(this.apiCall(module,storage), callback)
            },
			callWithArgNumber: async (modulePtr: pointer<string>, storagePtr: pointer<string>, key: number, callback: pointer<() => void>) =>{
                this.execDepth++
                const module = this.module.__getString(modulePtr)   
                const storage = stringLowerFirst(this.module.__getString(storagePtr))
                this.handleApiRequestPromise(this.apiCall(module,storage, key), callback)
            },

        }
    }

	// FIXME! This needs to be smarter and type safe
    protected responseModule(): any {
        return {
			stringField: (keyPtr: pointer<string>, valuePtr: pointer<string>) => {
				const key = this.module.__getString(keyPtr)
				const value = this.module.__getString(valuePtr)
				this.execReference[key] = value
			},
			numberField: (keyPtr: pointer<string>, value: number) => {
				const key = this.module.__getString(keyPtr)
				this.execReference[key] = value
			},
			pushObject: () => {
				const object = {}
				this.execReference = object
				this.execReferenceStack.push(object)
				this.execContext.push(object)
			},
			popObject: () => {
				this.execReferenceStack.pop()
				this.execReference = this.execReferenceStack[this.execReferenceStack.length-1]
			},
            pushString: (value: pointer<string>) => {
                this.execReference.push(this.module.__getString(value))
            },
        }
    }

    protected consoleModule(): any {
        return {
            logs: (value: stringPointer) => {
              console.log("console.log", this.module.__getString(value)) // FIXME! Allow console.log (lint)
            },
            log: (value: any) => {
                console.log(value)
            }
        }
    }

    protected imports(): Imports {
        return {
env: this.envModule(),
         api: this.apiModule(),
         console: this.consoleModule(),
         response: this.responseModule(),
        }
    }
}
