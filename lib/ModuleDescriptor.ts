import { StorageDescriptor } from "./StorageDescriptor"

export class ModuleDescriptor {
    public storage: Record<string, StorageDescriptor> = {}

    public storageByAPIName(apiName: string): StorageDescriptor {
        for (const k of Object.keys(this.storage)) {
            if (this.storage[k].APIName === apiName) {
                return this.storage[k]
            }
        }

        throw new Error(`APIName ${apiName} not found`)
    }
}

export type ModuleDescriptorIndex = Record<string, ModuleDescriptor>
