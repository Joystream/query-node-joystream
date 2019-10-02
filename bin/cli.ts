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
import { WASMInstance } from "../lib/WASMInstance"
import { RuntimeFinder } from "../lib/RuntimeFinder"

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

    // FIXME! This will be loaded via an API request
    const queryBuffer = fs.readFileSync("../query-api/build/query.wasm")

    const finder = new RuntimeFinder({provider: new WsProvider(AppConfig.ArchiveNode.address)})
    await finder.isReady

    const api = await ApiPromise.create({
        provider: new WsProvider(AppConfig.ArchiveNode.address),
        types: {
            // FIXME! Why aren't these registered?
            Category: `{"id": "CategoryId", "title": "Text", "description": "Text", "deleted": "bool", "archived": "bool"}`,
            CategoryId: "u64",
            IPNSIdentity: {},
            InputValidationLengthConstraint: "u64",
            Post: {},
            PostId: "u64",
            ThreadId: "u64",
            Thread: `{"id": "ThreadId", "title": "Text", "category_id": "CategoryId", "nr_in_category": "u32"}`,
            Url: {},
            Actor: {},
            ContentId: {},
            ContentMetadata: {},
            ContentMetadataUpdate: {},
            DataObject: {},
            DataObjectStorageRelationship: {},
            DataObjectStorageRelationshipId: {},
            DataObjectType: {},
            DataObjectTypeId: {},
            TypeId: {},
            DownloadSession: {},
            DownloadSessionId: {},
            ElectionStage: {},
            MemberId: {},
            PaidMembershipTerms: {},
            PaidTermId: {},
            Profile: {},
            ProposalStatus: {},
            Requests: {},
            Role: {},
            RoleParameters: {},
            RuntimeUpgradeProposal: {},
            SealedVote: {},
            Seats: {},
            Stake: {},
            TallyResult: {},
            TransferableStake: {},
            UserInfo: {},
            VoteKind: {},
        },
    })

    const runtime = new WASMInstance(queryBuffer, api, logger)

    await new App(api, logger, runtime).start()
})().catch((err) => {
    log.error("cli", err.stack)
    process.exit(1)
})
