export function hostLayout(context={},chrome=240){
 const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:null;
 // Intrinsically sized ChatGPT cards report their current allocation through
 // containerDimensions.height. Feeding that back into the photos traps the
 // first loading frame at its own small height. Explicit maxima still apply;
 // a fixed-height MCP host without intrinsic sizing keeps its allocation.
 const budget=positive(context.containerDimensions?.maxHeight)||positive(context.maxHeight)||(!context.intrinsicSizing&&positive(context.containerDimensions?.height))||860;
 const insets=context.safeArea?.insets||context.safeArea||{};
 const safe={};for(const side of ['top','right','bottom','left'])safe[side]=Math.min(200,Math.max(0,positive(insets[side])||0));
 return {budget,safe,rows:budget-chrome>=320?2:1};
}

export function galleryCapacity(width){
 return {columns:width<=500?2:Math.max(3,Math.floor((width+14)/234)),rows:2};
}
