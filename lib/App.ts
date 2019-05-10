import { EventStorer } from "./EventStorer";
import { MongoDBConnection } from "./MongoDB";

export class App {

    public db: MongoDBConnection;
    public eventstorer: EventStorer;

    constructor(dbURI: string) {
        this.db = new MongoDBConnection(dbURI);
        const onEvent = (async (entry: any) => {
            await this.db.insert(entry);
        });
        this.eventstorer = new EventStorer(onEvent);
    }

    public async start() {
        // TODO: Verify our state is consistent with the blockchain. Catch up
        // or force reindex if not.
        // TODO: Start serving GraphQL
        this.eventstorer.subscribe();
    }
}
