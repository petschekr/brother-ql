import * as BrotherQL from "../index";

(async () => {
	const printer = new BrotherQL.Printer(false);
	await printer.init();

	printer.useFont("Chicago", __dirname + "/Chicago.ttf");
	const lines = await printer.rasterizeText("Ryan Petschek", "Georgia Institute of Technology", __dirname + "/HackGT.png");
	await printer.print(lines);
	await printer.print(await printer.rasterizeText("Ryan Petschek"));
	await printer.print(await printer.rasterizeText("Jordan Harvey-Morgan", "HackGT"));

	process.exit(0);
})()
