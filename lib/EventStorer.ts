import { ApiRx } from "@polkadot/api";
import { EventRecord } from "@polkadot/types";
import { switchMap } from "rxjs/operators";
const log = require("npmlog");

export class EventStorer {

    public onEvent: any;

    constructor(onEvent: any) {
        this.onEvent = onEvent;
    }

    public async subscribe() {
        log.info("event", "Subscribing to substrate events");
        ApiRx.create()
            .pipe(
                switchMap((api) =>
                    api.query.system.events(),
                ))
            .subscribe(async (events: any) => {
                events.forEach(async (record: EventRecord) => {
                    const { event, phase } = record;
                    const eventEntry = {
                        data: event.data.toString(),
                        meta: event.meta.documentation.toString(),
                        method: event.method,
                        section: event.section,
                    };
                    log.verbose("event", "obj %s", JSON.stringify(eventEntry));
                    this.onEvent(eventEntry);
                });
            });
    }
}
