#!/usr/bin/env node
"use strict"

import { ApiPromise, WsProvider } from "@polkadot/api"
import * as figlet from "figlet"
import { config as AppConfig } from "node-config-ts"
import { ILogger, LoggerWrapper } from "../lib/Logger"

const chalk = require("chalk")
const log = require("npmlog")
const fs = require("fs")
import { App } from "../lib/App"
import { RuntimeFinder } from "../lib/RuntimeFinder"
import { WASMInstance } from "../lib/WASMInstance"

// tslint:disable-next-line
console.error = () => {}

////////////////

log.level = "verbose"

function banner(logger: ILogger) {
    logger.info("cli", chalk.blue(figlet.textSync("joystream", "Speed")))
}

(async () => {
    const logger = new LoggerWrapper(log)
    banner(logger)

    const finder = new RuntimeFinder({provider: new WsProvider(AppConfig.ArchiveNode.address)})
    await finder.isReady
    const queryBuffer = await finder.runtime
    const runtime = new WASMInstance(queryBuffer as unknown as  Uint8Array, finder, logger)
    finder.registerTypes(runtime.types())

    await new App(finder, logger, runtime).start()
})().catch((err) => {
    log.error("cli", err.stack)
    process.exit(1)
})
