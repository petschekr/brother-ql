export declare type WidthLength = [number, number];
export interface Label {
    tapeSize: WidthLength;
    dots: WidthLength;
    dotsPrintable: WidthLength;
    rightMargin: number;
    feedMargin: number;
}
export declare const Labels: {
    [type: string]: Label;
};
export declare const USBProductIDs: number[];
