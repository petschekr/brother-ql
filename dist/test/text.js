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
const BrotherQL = require("../index");
(() => __awaiter(this, void 0, void 0, function* () {
    const printer = new BrotherQL.Printer(false);
    yield printer.init();
    printer.useFont("Chicago", __dirname + "/Chicago.ttf");
    const lines = yield printer.rasterizeText("Ryan Petschek", "Georgia Institute of Technology", __dirname + "/HackGT.png");
    yield printer.print(lines);
    yield printer.print(yield printer.rasterizeText("Ryan Petschek"));
    yield printer.print(yield printer.rasterizeText("Jordan Harvey-Morgan", "HackGT"));
    process.exit(0);
}))();
