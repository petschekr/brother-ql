import * as fs from "fs";
import * as usb from "usb";
import * as constants from "./constants";

interface CustomCanvas {
	stride: number;
	toBuffer: (mimeType?: string) => Buffer;
}
const Canvas: {
	createCanvas(width: number, height: number): HTMLCanvasElement & CustomCanvas;
	registerFont(path: string, config: { family: string; weight?: string | number; style?: string }): void;
} = require("canvas");

export enum MediaType {
	None, ContinuousTape, DieCutLabels
}
export namespace Status {
	export interface Media {
		type: MediaType;
		width: number;
		length: number;
	}
	export enum Type {
		ReplyToStatusRequest, PrintingCompleted, ErrorOccurred, Notification, PhaseChange
	}
	export interface Response {
		model: string;
		statusType: Type;
		error: string[];
		media: Media;
	}
}

export class Printer {
	private readonly printerInterface: usb.Interface;
	private readonly input: usb.InEndpoint | null = null;
	private readonly output: usb.OutEndpoint | null = null;

	private statusHandlers: ((status: Status.Response) => void)[] = [];
	private removeStatusHandler(handler: (status: Status.Response) => void) {
		let index = this.statusHandlers.indexOf(handler);
		if (index === -1) {
			console.warn("Tried to remove invalid status handler");
		}
		else {
			this.statusHandlers.splice(index, 1);
		}
	}

	constructor(public readonly debugMode = false) {
		const VendorID = 0x04F9;
		let printer: usb.Device | undefined;
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
		if (!printer) throw new Error("Couldn't find a compatible printer");

		printer.open();
		this.printerInterface = printer.interface(0);
		if (["linux", "darwin"].includes(process.platform) && this.printerInterface.isKernelDriverActive()) {
			this.printerInterface.detachKernelDriver();
		}
		this.printerInterface.claim();
		for (let endpoint of this.printerInterface.endpoints) {
			if (endpoint.direction === "in") {
				this.input = endpoint as usb.InEndpoint;
			}
			else if (endpoint.direction === "out") {
				this.output = endpoint as usb.OutEndpoint;
			}
		}
		if (!this.input || !this.output) throw new Error("Input/output endpoints not found");

		this.input.startPoll(1, 32);
		this.input.on("data", (data: Buffer) => {
			if (data.length === 0) return;
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

	public async init() {
		let clearCommand = Buffer.alloc(200);
		await this.transfer(clearCommand);
		let initializeCommand = Buffer.from([0x1B, 0x40]);
		await this.transfer(initializeCommand);
	}

	private parseStatusResponse(response: Buffer): Status.Response {
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

		let error: string[] = [];
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
		if (response[11] === 0x0A) mediaType = MediaType.ContinuousTape;
		if (response[11] === 0x0B) mediaType = MediaType.DieCutLabels;

		let length = response[17];

		let statusType = Status.Type.ReplyToStatusRequest;
		switch(response[18]) {
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

	private transfer(command: Buffer): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.debugMode) {
				console.log("Sending:", command);
			}
			this.output!.transfer(command, err => {
				if (err) {
					reject(err);
				}
				else {
					resolve();
				}
			});
		});
	}

	async getStatus() {
		return new Promise<Status.Response>((resolve, reject) => {
			const command = Buffer.from([0x1B, 0x69, 0x53]);
			this.transfer(command);
			this.statusHandlers.push(response => {
				resolve(response);
			});
		});
	}

	async print(rasterLines: Buffer[], status?: Status.Response): Promise<Status.Response> {
		return new Promise<Status.Response>(async (resolve, reject) => {
			if (!status) {
				status = await this.getStatus();
			}

			const modeCommand = Buffer.from([0x1B, 0x69, 0x61, 1]);
			await this.transfer(modeCommand);

			const validFlag = 0x80 | 0x02 | 0x04 | 0x08 | 0x40; // Everything enabled
			const mediaTypeByte = status.media.type === MediaType.DieCutLabels ? 0x0B : 0x0A;

			const mediaCommand = Buffer.from([0x1B, 0x69, 0x7A, validFlag, mediaTypeByte, status.media.width, status.media.length, 0, 0, 0, 0, 0x01, 0]);
			mediaCommand.writeUInt32LE(rasterLines.length, 7);
			await this.transfer(mediaCommand);

			await this.transfer(Buffer.from([0x1B, 0x69, 0x4D, 1 << 6])); // Enable auto-cut
			await this.transfer(Buffer.from([0x1B, 0x69, 0x4B, 1 << 3 | 0 << 6])); // Enable cut-at-end and disable high res printing

			let mediaInfo = constants.Labels[status.media.width.toString() + (status.media.type === MediaType.DieCutLabels ? "x" + status.media.length.toString() : "")];
			if (!mediaInfo) throw new Error(`Unknown media: ${status.media.width}x${status.media.length}`);

			const marginsCommand = Buffer.from([0x1B, 0x69, 0x64, mediaInfo.feedMargin, 0]);
			await this.transfer(marginsCommand);

			for (let line of rasterLines) {
				const rasterCommand = Buffer.from([0x67, 0x00, 90, ...line]);
				await this.transfer(rasterCommand);
			}

			const printCommand = Buffer.from([0x1A]);
			await this.transfer(printCommand);

			const statusHandler = async (response: Status.Response) => {
				if (response.statusType === Status.Type.PrintingCompleted) {
					resolve(response);
					this.removeStatusHandler(statusHandler);
				}
				if (response.statusType === Status.Type.ErrorOccurred) {
					reject(response);
					this.removeStatusHandler(statusHandler);
				}
			};
			this.statusHandlers.push(statusHandler);
		});
	}

	async rawImageToRasterLines(render: Buffer, width: number): Promise<Buffer[]> {
		const stride = width * 4;
		let renderLineCount = render.length / stride;

		// We need to sidescan this generated image
		let lines: Buffer[] = [];
		for (let c = 0; c < width; c++) {
			let line = Buffer.alloc(90); // Always 90 for regular sized printers like the QL-700 (with a 0x00 byte to start)
			let lineByte = 1;
			let lineBitIndex = 3; // First nibble in second byte is blank
			for (let r = 0; r < renderLineCount; r++ , lineBitIndex--) {
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

		return lines;
	}

	private font: string = "Arial";
	useFont(name: string, path?: string): void {
		if (path) {
			Canvas.registerFont(path, { family: name });
		}
		this.font = name;
	}

	async rasterizeText(primary: string, secondary?: string): Promise<Buffer[]> {
		let status = await this.getStatus();
		let width = 0;
		let length = 750; // Default

		if (status.media.type === MediaType.ContinuousTape) {
			let mediaInfo = constants.Labels[status.media.width.toString()];
			if (!mediaInfo) throw new Error(`Unknown media: ${status.media.width}x${status.media.length}`);

			width = mediaInfo.dotsPrintable[0] + mediaInfo.rightMargin;

			if (status.media.width === 12) {
				// 12mm label seems to need this for some reason
				width += 10;
			}
		}
		if (status.media.type == MediaType.DieCutLabels) {
			let mediaInfo = constants.Labels[`${status.media.width.toString()}x${status.media.length.toString()}`];
			if (!mediaInfo) throw new Error(`Unknown media: ${status.media.width}x${status.media.length}`);

			width = mediaInfo.dotsPrintable[0] + mediaInfo.rightMargin;
			length = mediaInfo.dotsPrintable[1];
		}
		const canvas = Canvas.createCanvas(length, width);
		const ctx = canvas.getContext("2d")!;
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
				await fs.promises.unlink("debug.png");
			} catch {}
			await fs.promises.writeFile("debug.png", canvas.toBuffer());
		}

		return this.rawImageToRasterLines(canvas.toBuffer("raw"), canvas.width);
	}
}
