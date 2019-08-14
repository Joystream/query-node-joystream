import { ApiPromiseInterface } from "@polkadot/api/promise/types"
import { GraphQLServer } from 'graphql-yoga'
import { BigIntResolver } from 'graphql-scalars'
import { getTypeRegistry } from '@polkadot/types'
import { MetadataInterface } from '@polkadot/types/Metadata/types'
import { default as MetadataV3,  MetadataModuleV3 } from '@polkadot/types/Metadata/v3'
import { StorageFunctionMetadata as StorageFunctionMetadataV3 } from '@polkadot/types/Metadata/v3/Storage'
import { Codec } from '@polkadot/types/types'
import { TypeRegistry } from '@polkadot/types/codec/typeRegistry'
import { stringLowerFirst, stringUpperFirst } from '@polkadot/util'

import { default as U128 } from '@polkadot/types/primitive/U128';

enum StorageType {
	Plain     = 'PlainType',
	Map       = 'MapType',
	DoubleMap = 'DoubleMapType',
}

class StorageDescriptor {
	public APIName:string = ""
	public structure?:StorageType
	public innerType:string = ""
	public mapKeyType?:string
}

class ModuleDescriptor {
	public storage:Record<string, StorageDescriptor>

	constructor() {
		this.storage = {}
	}

	public storageByAPIName(apiName:string):StorageDescriptor {
		for (let k in this.storage) {
			if (this.storage[k].APIName == apiName) {
				return this.storage[k]
			}
		}

		throw new Error(`APIName ${apiName} not found`)
	}
}

type ModuleDescriptorIndex = Record<string,ModuleDescriptor>

// TODO: Move to util package
function String(codec:Codec | undefined):string {
	if (typeof codec !== 'undefined') {
		return codec.toString()
	}
	throw new Error('Undefined codec string')
}

const SDLTabSizeInSpaces = 4

class SDLTypeDef {
	protected schema:SDLSchema
	
	constructor(schema:SDLSchema, name:string) {
		this.schema = schema
		this.schema.line(`type ${name} {`)
	}

	declaration(content:string):SDLTypeDef {
		this.schema.line(content, 1)
		return this
	}

	public end() {
		this.schema.line(`}`)
	}
}

class SDLSchema {
	protected output:string = ''
	protected scalars:Array<string> = new Array<string>()

	public line(value:string, indent:number = 0) {
		this.output += ' '.repeat(indent*SDLTabSizeInSpaces) + value + '\n'
	}

	public type(name:string):SDLTypeDef {
		return new SDLTypeDef(this,name)
	}

	public requireScalar(name:string) {
		let index = this.scalars.findIndex(x => x == name)
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

// TODO: implement a class that informs an extension of GraphQLServer
class GraphQLServerSchemaBuilder<TMetadataVersion extends MetadataInterface = MetadataV3> {

    protected typeRegistry: TypeRegistry
	protected modules: ModuleDescriptorIndex
	protected codecs: Record<string,Codec>
    protected api: ApiPromiseInterface

    constructor(api: ApiPromiseInterface, typeRegistry: TypeRegistry, metadata: TMetadataVersion) {
		this.api = api
        this.typeRegistry = typeRegistry
		this.modules = {}
		this.codecs = {}

		if (metadata instanceof MetadataV3) {
			this.parseModulesV3(metadata)
		} else { 
			// TODO: Support V4
			throw new Error("Only V3 supported")
		}
    }

    private parseModulesV3(input:MetadataV3) {
		input.modules.forEach((module:MetadataModuleV3) => this.parseModuleV3(module))
    }

	private parseModuleV3(input: MetadataModuleV3) {
		let desc = new ModuleDescriptor()

		if (input.storage.isNone) {
			return
		}

		// FIXME! Remove this
		if (String(input.name) != 'balances' && String(input.name) != 'timestamp') {
			return
		}

		input.storage.unwrap().forEach( (storage: StorageFunctionMetadataV3) => {
			let variable = this.extractVariableStorageDescriptorV3(storage)

			this.assertCodec(variable.innerType)

			desc.storage[storage.name.toString()] = variable
		})

		this.modules[input.name.toString()] = desc
	}

	private extractVariableStorageDescriptorV3(storage: StorageFunctionMetadataV3):StorageDescriptor {
		let variable = new StorageDescriptor()

		switch (storage.type.type) {
			case StorageType.Plain:
				variable.structure = StorageType.Plain
				variable.innerType = String(storage.type.asType)
				break

			case StorageType.Map:
				variable.structure = StorageType.Map
				variable.mapKeyType = String(storage.type.asMap.get('key'))
				variable.innerType  = String(storage.type.asMap.get('value'))
				break

			default:
				throw new Error('Unhandled: ' + storage.type.type.toString())
		}

		variable.APIName = stringLowerFirst(String(storage.name))

		return variable
	}

	private assertCodec(typeName:string) {
		if (typeof this.codecs[typeName] !== 'undefined') {
			return
		}

		let reg = this.typeRegistry.get(typeName)

        if (typeof reg !== 'undefined') {
           this.codecs[typeName] = new reg;
        }
	}

	private moduleSDLName(moduleName:string):string {
		return stringUpperFirst(moduleName) + 'Module'
	}

	private typeToSDL(schema: SDLSchema, type:string):string {
		// Basic types
		switch (type) {
			case 'bool':
				return 'Boolean';
		}

		let codec = this.codecs[type]

		// FIXME: Make this a lookup table
		if (codec instanceof Date) {
			return 'String'
		}

		if (codec instanceof U128) {
			schema.requireScalar('BigInt')
			return 'BigInt'
		}

		throw new Error(`Unknown type: ${type}`)
	}

	private typeValueToGraphQL(storage:StorageDescriptor, value:Codec):any {
		// Basic types
		switch (storage.innerType) {
			case 'bool':
				return value.toJSON()
		}

		let codec = this.codecs[storage.innerType]

		if (codec instanceof Date) {
			return value.toString()
		}

		return value
	}

	private queryBlockSDL(schema:SDLSchema) {
		let q = schema.type('Query')

		for (let key in this.modules) {
			let module = this.moduleSDLName(key)
			q.declaration(`${key}(block: Int = 0): ${module}`)
		}

		q.end()
	}

	private moduleBlocksSDL(schema:SDLSchema) {
		for (let key in this.modules) {
			this.moduleBlockSDL(schema,key,this.modules[key])
		}
	}
	
	private moduleBlockSDL(schema:SDLSchema, name: string, module:ModuleDescriptor) {
		let m = schema.type(this.moduleSDLName(name))

		for (let key in module.storage) {
			let variable = module.storage[key]

			// FIXME! Remove this
			if (variable.structure != StorageType.Plain) {
				continue
			}

			m.declaration(variable.APIName + ': ' + this.typeToSDL(schema, variable.innerType))
		}
		m.end()
	}

	private moduleResolvers(resolvers:resolverRecord) {
		for (let key in this.modules) {
			resolvers[key] = this.moduleResolver(key, this.modules[key])
		}
	}

	private moduleResolver(name: string, module:ModuleDescriptor):resolverCallback {
		let parent = this
		let query = this.api.query[name]
		return async function(root:any, args:any, ctx:any, info:any) { 
			let output:Record<string, any> = {}

			// Look through requested fields
			// FIXME! Is this safe?
			let selections = info.fieldNodes[0].selectionSet.selections as Array<any>
			let promises:Array<Promise<Codec>> = []
			let fieldNames:Array<string> = []
			for (let i = 0; i < selections.length; i++) {
				let fieldName = selections[i].name.value
				fieldNames.push(fieldName)
				promises.push(query[fieldName]())
			}

			let values = await Promise.all(promises)

			if (values.length != fieldNames.length) {
				throw new Error('Fieldnames and returned values length mismatch')
			}

			for (let i = 0; i < fieldNames.length; i++) {
				let storage = module.storageByAPIName(fieldNames[i])
				output[fieldNames[i]] = parent.typeValueToGraphQL(storage, values[i])
			}

			return output
		}
	}

    public get SDL():string {
		let schema = new SDLSchema()
		this.queryBlockSDL(schema)
		this.moduleBlocksSDL(schema)
		schema.end()
		return schema.SDL
    }

    public get resolvers():resolverRecord{
		let resolvers:resolverRecord = {}
		this.moduleResolvers(resolvers)
		return resolvers	
    }
}

// FIXME! Move these up
interface resolverCallback {
	(root:any, args:any, ctx: any, info:any):any
}

type resolverRecord = Record<string, resolverCallback>

export class App {

    protected api: ApiPromiseInterface
    protected typeRegistry: TypeRegistry

    constructor(api: ApiPromiseInterface) {
        this.api = api
        this.typeRegistry = getTypeRegistry()
    }

    public async start() {
        let builder = new GraphQLServerSchemaBuilder<MetadataV3>(this.api, this.typeRegistry, this.api.runtimeMetadata.asV3)
		console.log(builder.resolvers)
        this.startGraphQLServer(builder.SDL, builder.resolvers)
    }

    public startGraphQLServer(SDL:string, callbacks: resolverRecord) {
        const typeDefs = SDL
        let api = this.api

        const resolvers = {
            BigInt: BigIntResolver,
			Query: callbacks,
		}

        const server = new GraphQLServer({ typeDefs, resolvers })
        server.start(() => console.log('Server is running on localhost:4000'))
    }
}
