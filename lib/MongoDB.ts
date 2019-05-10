const log = require("npmlog");
const mongoose = require("mongoose");

const SubstrateEvent = mongoose.model("event", {
    data: String,
    meta: String,
    method: String,
    section: String,
});

export class MongoDBConnection {
    public eventModel: any;
    constructor(uri: string) {

        mongoose.connect(uri, { useNewUrlParser: true });
        const c = mongoose.connection;
        c.on("error", (err: any) => {
            log.error("db", err);
            log.error("db", "Failed to connect to database %s", uri);
            process.exit(1);
        });
        c.once("open", () => {
            log.info("db", "Connected to database %s", uri);
        });
    }

    public async insert(eventEntry: any) {
        const event = new SubstrateEvent(eventEntry);
        event.save().then(() => log.verbose("db", "inserted event %s", eventEntry));
    }
}
