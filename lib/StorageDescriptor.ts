export enum StorageType {
    Plain     = "PlainType",
    Map       = "MapType",
    DoubleMap = "DoubleMapType",
}

export class StorageDescriptor {
    public APIName: string = ""
    public structure?: StorageType
    public innerType: string = ""
    public mapKeyType?: string
}
