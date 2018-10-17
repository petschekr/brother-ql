/// <reference types="node" />
import * as usb from "usb";
export declare enum MediaType {
    None = 0,
    ContinuousTape = 1,
    DieCutLabels = 2
}
export declare namespace Status {
    interface Media {
        type: MediaType;
        width: number;
        length: number;
    }
    enum Type {
        ReplyToStatusRequest = 0,
        PrintingCompleted = 1,
        ErrorOccurred = 2,
        Notification = 3,
        PhaseChange = 4
    }
    interface Response {
        model: string;
        statusType: Type;
        error: string[];
        media: Media;
    }
}
export declare class Printer {
    readonly debugMode: boolean | "" | undefined;
    private readonly printerInterface;
    private readonly input;
    private readonly output;
    private statusHandlers;
    private removeStatusHandler;
    static getAvailable(): usb.Device[];
    constructor(deviceAddress?: number);
    private errorHandlers;
    attachErrorHandler(handler: (err: Error) => void): void;
    init(): Promise<void>;
    private parseStatusResponse;
    private transfer;
    getStatus(): Promise<Status.Response>;
    print(rasterLines: Buffer[], status?: Status.Response): Promise<Status.Response>;
    rawImageToRasterLines(render: Buffer, width: number): Promise<Buffer[]>;
    private font;
    useFont(name: string, path?: string): void;
    rasterizeText(primary: string, secondary?: string, secondRowImagePath?: string, defaultLength?: number): Promise<Buffer[]>;
}
