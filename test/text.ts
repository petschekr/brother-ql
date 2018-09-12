import * as BrotherQL from "../index";

(async () => {
	const printer = new BrotherQL.Printer();
	await printer.init();

	printer.useFont("Chicago", __dirname + "/Chicago.ttf");
	console.log(await printer.printText("Ryan Petschek", "Georgia Institute of Technology"));

	process.exit(0);
})()
