export interface ILogger  {
    error: (...values: any) => void
    info: (...values: any) => void
}

export class LoggerWrapper {
    protected logger: ILogger

    constructor(logger: ILogger) {
        this.logger = logger
    }

    public error(...values: any) {
        this.logger.error(...values)
    }

    public info(...values: any) {
        this.logger.info(...values)
    }
}
