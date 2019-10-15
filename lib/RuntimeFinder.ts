import { ApiPromise, WsProvider } from "@polkadot/api"
import { default as fromMetadata } from "@polkadot/api-metadata/storage/fromMetadata"
import { ApiOptions } from "@polkadot/api/types"
import { getTypeRegistry } from "@polkadot/types/codec"
import { getTypeDef } from "@polkadot/types/codec/create"
import { TypeDef, TypeDefExtVecFixed, TypeDefInfo } from "@polkadot/types/codec/types"
import { default as flattenUniq } from "@polkadot/types/Metadata/util/flattenUniq"
import { Codec } from "@polkadot/types/types"
import { config as AppConfig } from "node-config-ts"

// This is taken from @polkadot/types/Metadata/util/validateTypes.ts, where it's
// currently unexported. This may be a brittle dependency!
function extractTypes(types: string[]): any[] {
    return types.map((type): any => {
        const decoded = getTypeDef(type)

        switch (decoded.info) {
            case TypeDefInfo.Plain:
                return decoded.type

            case TypeDefInfo.Compact:
                case TypeDefInfo.Option:
                case TypeDefInfo.Vec:
                return extractTypes([(decoded.sub as TypeDef).type])

            case TypeDefInfo.VecFixed:
                return extractTypes([(decoded.ext as TypeDefExtVecFixed).type])

            case TypeDefInfo.Tuple:
                return extractTypes( (decoded.sub as TypeDef[]).map((sub): string => sub.type))

            default:
                throw new Error(`Uhandled: Unnable to create and validate type from ${type}`)
        }
    })
}

function unregisteredTypes(types: string[]): string[] {
    const typeRegistry = getTypeRegistry()
    return flattenUniq(
        extractTypes(types)).filter((type): boolean =>
        !typeRegistry.hasType(type),
    )
}

export class RuntimeFinder extends ApiPromise {
    public unregisteredTypes: string[] = []

    constructor(options: ApiOptions) {
        super(options)
    }

    public async static(options: ApiOptions): Promise<RuntimeFinder> {
        return new Promise<RuntimeFinder>((resolve) => {
            const instance = new RuntimeFinder(options)
            resolve(instance)
        })
    }

    public get runtime(): Promise<Codec> {
        return this.query[AppConfig.ArchiveNode.queryModuleName].runtime()
    }

    protected async loadMeta(): Promise<boolean> {
        const [genesisHash, runtimeVersion] = await Promise.all([
            this._rpcCore.chain.getBlockHash(0).toPromise(),
            this._rpcCore.state.getRuntimeVersion().toPromise(),
        ])
        this._runtimeMetadata = await this._rpcCore.state.getMetadata().toPromise()
        this._genesisHash = genesisHash
        this._runtimeVersion = runtimeVersion

        const storage = fromMetadata(this.runtimeMetadata)
        this._query = this.decorateStorage(storage, this.decorateMethod)

        this.unregisteredTypes = unregisteredTypes(this._runtimeMetadata.getUniqTypes(false))

        return new Promise<boolean>((resolve) => {
            resolve(true)
        })
    }
}
