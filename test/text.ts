import * as BrotherQL from "../index";

(async () => {
	const printer = new BrotherQL.Printer();
	await printer.init();

	printer.useFont("Chicago", __dirname + "/Chicago.ttf");
	await printer.print(await printer.rasterizeText("Ryan Petschek", "Georgia Institute of Technology"));
	await printer.print(await printer.rasterizeText("Ryan Petschek"));
	await printer.print(await printer.rasterizeText("Jordan Harvey-Morgan", "HackGT"));

	process.exit(0);
})()
