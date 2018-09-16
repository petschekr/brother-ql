"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const usb = require("usb");
const constants = require("./constants");
const Canvas = require("canvas");
var MediaType;
(function (MediaType) {
    MediaType[MediaType["None"] = 0] = "None";
    MediaType[MediaType["ContinuousTape"] = 1] = "ContinuousTape";
    MediaType[MediaType["DieCutLabels"] = 2] = "DieCutLabels";
})(MediaType = exports.MediaType || (exports.MediaType = {}));
var Status;
(function (Status) {
    let Type;
    (function (Type) {
        Type[Type["ReplyToStatusRequest"] = 0] = "ReplyToStatusRequest";
        Type[Type["PrintingCompleted"] = 1] = "PrintingCompleted";
        Type[Type["ErrorOccurred"] = 2] = "ErrorOccurred";
        Type[Type["Notification"] = 3] = "Notification";
        Type[Type["PhaseChange"] = 4] = "PhaseChange";
    })(Type = Status.Type || (Status.Type = {}));
})(Status = exports.Status || (exports.Status = {}));
class Printer {
    constructor(debugMode = false) {
        this.debugMode = debugMode;
        this.input = null;
        this.output = null;
        this.statusHandlers = [];
        this.font = "Arial";
        const VendorID = 0x04F9;
        let printer;
        if (usb.findByIds(VendorID, 0x2049)) {
            throw new Error("You must disable Editor Lite mode on your QL-700 before you can use this module");
        }
        for (let id of constants.USBProductIDs) {
            let device = usb.findByIds(VendorID, id);
            if (device) {
                printer = device;
                break;
            }
        }
        if (!printer)
            throw new Error("Couldn't find a compatible printer");
        printer.open();
        this.printerInterface = printer.interface(0);
        if (this.printerInterface.isKernelDriverActive()) {
            this.printerInterface.detachKernelDriver();
        }
        this.printerInterface.claim();
        for (let endpoint of this.printerInterface.endpoints) {
            if (endpoint.direction === "in") {
                this.input = endpoint;
            }
            else if (endpoint.direction === "out") {
                this.output = endpoint;
            }
        }
        if (!this.input || !this.output)
            throw new Error("Input/output endpoints not found");
        this.input.startPoll(1, 32);
        this.input.on("data", (data) => {
            if (data.length === 0)
                return;
            if (debugMode) {
                console.log("Received:", data);
            }
            if (data[0] === 0x80) {
                for (let handler of this.statusHandlers) {
                    handler(this.parseStatusResponse(data));
                }
            }
        });
    }
    removeStatusHandler(handler) {
        let index = this.statusHandlers.indexOf(handler);
        if (index === -1) {
            console.warn("Tried to remove invalid status handler");
        }
        else {
            this.statusHandlers.splice(index, 1);
        }
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            let clearCommand = Buffer.alloc(200);
            yield this.transfer(clearCommand);
            let initializeCommand = Buffer.from([0x1B, 0x40]);
            yield this.transfer(initializeCommand);
        });
    }
    parseStatusResponse(response) {
        if (response.length !== 32 || response[0] !== 0x80) {
            console.error(response);
            throw new Error("Invalid response received");
        }
        let model = "Unknown";
        switch (response[4]) {
            case 0x4F:
                model = "QL-500/550";
                break;
            case 0x31:
                model = "QL-560";
                break;
            case 0x32:
                model = "QL-570";
                break;
            case 0x33:
                model = "QL-580N";
                break;
            case 0x51:
                model = "QL-650TD";
                break;
            case 0x35:
                model = "QL-700";
                break;
            case 0x50:
                model = "QL-1050";
                break;
            case 0x34:
                model = "QL-1060N";
                break;
        }
        let error = [];
        switch (response[8]) {
            case 0x01:
                error.push("No media when printing");
                break;
            case 0x02:
                error.push("End of media");
                break;
            case 0x04:
                error.push("Tape cutter jam");
                break;
            case 0x10:
                error.push("Main unit in use");
                break;
            case 0x80:
                error.push("Fan doesn't work");
                break;
        }
        switch (response[9]) {
            case 0x04:
                error.push("Transmission error");
                break;
            case 0x10:
                error.push("Cover open");
                break;
            case 0x40:
                error.push("Cannot feed");
                break;
            case 0x80:
                error.push("System error");
        }
        let width = response[10];
        let mediaType = MediaType.None;
        if (response[11] === 0x0A)
            mediaType = MediaType.ContinuousTape;
        if (response[11] === 0x0B)
            mediaType = MediaType.DieCutLabels;
        let length = response[17];
        let statusType = Status.Type.ReplyToStatusRequest;
        switch (response[18]) {
            case 0x01:
                statusType = Status.Type.PrintingCompleted;
                break;
            case 0x02:
                statusType = Status.Type.ErrorOccurred;
                break;
            case 0x05:
                statusType = Status.Type.Notification;
                break;
            case 0x06:
                statusType = Status.Type.PhaseChange;
                break;
        }
        return {
            model,
            statusType,
            error,
            media: {
                type: mediaType,
                width,
                length
            }
        };
    }
    transfer(command) {
        return new Promise((resolve, reject) => {
            if (this.debugMode) {
                console.log("Sending:", command);
            }
            this.output.transfer(command, err => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    getStatus() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const command = Buffer.from([0x1B, 0x69, 0x53]);
                this.transfer(command);
                this.statusHandlers.push(response => {
                    resolve(response);
                });
            });
        });
    }
    print(rasterLines, status) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                if (!status) {
                    status = yield this.getStatus();
                }
                const modeCommand = Buffer.from([0x1B, 0x69, 0x61, 1]);
                yield this.transfer(modeCommand);
                const validFlag = 0x80 | 0x02 | 0x04 | 0x08 | 0x40; // Everything enabled
                const mediaTypeByte = status.media.type === MediaType.DieCutLabels ? 0x0B : 0x0A;
                const mediaCommand = Buffer.from([0x1B, 0x69, 0x7A, validFlag, mediaTypeByte, status.media.width, status.media.length, 0, 0, 0, 0, 0x01, 0]);
                mediaCommand.writeUInt32LE(rasterLines.length, 7);
                yield this.transfer(mediaCommand);
                yield this.transfer(Buffer.from([0x1B, 0x69, 0x4D, 1 << 6])); // Enable auto-cut
                yield this.transfer(Buffer.from([0x1B, 0x69, 0x4B, 1 << 3 | 0 << 6])); // Enable cut-at-end and disable high res printing
                let mediaInfo = constants.Labels[status.media.width.toString() + (status.media.type === MediaType.DieCutLabels ? "x" + status.media.length.toString() : "")];
                if (!mediaInfo)
                    throw new Error(`Unknown media: ${status.media.width}x${status.media.length}`);
                const marginsCommand = Buffer.from([0x1B, 0x69, 0x64, mediaInfo.feedMargin, 0]);
                yield this.transfer(marginsCommand);
                for (let line of rasterLines) {
                    const rasterCommand = Buffer.from([0x67, 0x00, 90, ...line]);
                    yield this.transfer(rasterCommand);
                }
                const printCommand = Buffer.from([0x1A]);
                yield this.transfer(printCommand);
                const statusHandler = (response) => __awaiter(this, void 0, void 0, function* () {
                    if (response.statusType === Status.Type.PrintingCompleted) {
                        resolve(response);
                        this.removeStatusHandler(statusHandler);
                    }
                    if (response.statusType === Status.Type.ErrorOccurred) {
                        reject(response);
                        this.removeStatusHandler(statusHandler);
                    }
                });
                this.statusHandlers.push(statusHandler);
            }));
        });
    }
    printRawImageBuffer(render, width) {
        return __awaiter(this, void 0, void 0, function* () {
            const stride = width * 4;
            let renderLineCount = render.length / stride;
            // We need to sidescan this generated image
            let lines = [];
            for (let c = 0; c < width; c++) {
                let line = Buffer.alloc(90); // Always 90 for regular sized printers like the QL-700 (with a 0x00 byte to start)
                let lineByte = 1;
                let lineBitIndex = 3; // First nibble in second byte is blank
                for (let r = 0; r < renderLineCount; r++, lineBitIndex--) {
                    if (lineBitIndex < 0) {
                        lineByte++;
                        lineBitIndex += 8;
                    }
                    let value = render[r * stride + c * 4 + 3];
                    if (value > 0xFF / 2) {
                        value = 1;
                    }
                    else {
                        value = 0;
                    }
                    line[lineByte] |= value << lineBitIndex;
                }
                lines.push(line);
            }
            return this.print(lines);
        });
    }
    useFont(name, path) {
        if (path) {
            Canvas.registerFont(path, { family: name });
        }
        this.font = name;
    }
    printText(primary, secondary) {
        return __awaiter(this, void 0, void 0, function* () {
            let status = yield this.getStatus();
            let width = 0;
            let length = 750; // Default
            if (status.media.type === MediaType.ContinuousTape) {
                let mediaInfo = constants.Labels[status.media.width.toString()];
                if (!mediaInfo)
                    throw new Error(`Unknown media: ${status.media.width}x${status.media.length}`);
                width = mediaInfo.dotsPrintable[0] + mediaInfo.rightMargin;
                if (status.media.width === 12) {
                    // 12mm label seems to need this for some reason
                    width += 10;
                }
            }
            if (status.media.type == MediaType.DieCutLabels) {
                let mediaInfo = constants.Labels[`${status.media.width.toString()}x${status.media.length.toString()}`];
                if (!mediaInfo)
                    throw new Error(`Unknown media: ${status.media.width}x${status.media.length}`);
                width = mediaInfo.dotsPrintable[0] + mediaInfo.rightMargin;
                length = mediaInfo.dotsPrintable[1];
            }
            const canvas = Canvas.createCanvas(length, width);
            const ctx = canvas.getContext("2d");
            ctx.globalCompositeOperation = "luminosity";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            let primaryFontSize = 100;
            while (true) {
                ctx.font = `${primaryFontSize}px "${this.font}"`;
                if (ctx.measureText(primary).width < length) {
                    break;
                }
                primaryFontSize--;
            }
            if (secondary) {
                const maxPrimarySize = 72;
                if (primaryFontSize > maxPrimarySize) {
                    primaryFontSize = maxPrimarySize;
                }
                let secondaryFontSize = 30;
                while (true) {
                    ctx.font = `${secondaryFontSize}px "${this.font}"`;
                    if (ctx.measureText(secondary).width < length) {
                        break;
                    }
                    secondaryFontSize--;
                }
                ctx.font = `${primaryFontSize}px "${this.font}"`;
                ctx.fillText(primary, length / 2, width / 2 - 25);
                ctx.font = `${secondaryFontSize}px "${this.font}"`;
                ctx.fillText(secondary, length / 2, width - 20);
            }
            else {
                ctx.font = `${primaryFontSize}px "${this.font}"`;
                ctx.fillText(primary, length / 2, width / 2);
            }
            if (this.debugMode) {
                try {
                    yield fs.promises.unlink("debug.png");
                }
                catch (_a) { }
                yield fs.promises.writeFile("debug.png", canvas.toBuffer());
                return this.getStatus();
            }
            return this.printRawImageBuffer(canvas.toBuffer("raw"), canvas.width);
        });
    }
}
exports.Printer = Printer;
