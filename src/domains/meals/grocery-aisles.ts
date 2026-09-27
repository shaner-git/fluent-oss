/** Store-independent sections. Specific product forms take precedence over ingredients. */
export const groceryAisleOrder = ['Produce', 'Bakery', 'Meat & seafood', 'Dairy & eggs', 'Refrigerated', 'Pantry', 'Frozen', 'Drinks', 'Household', 'Other'];

const rules: Array<[string, string]> = [
  ['Household', 'toilet paper|paper towels?|tissues?|dish soap|dishwasher|laundry|detergent|cleaner|cleaning|trash bags?|garbage bags?|shampoo|toothpaste|deodorant|diapers?|nappies|cat litter|pet food|dog food|cat food'],
  ['Other', '(?:fresh or frozen|frozen or fresh)'],
  ['Frozen', 'frozen|ice cream|gelato|sorbet|ice cubes?'],
  ['Produce', '^(?:fresh |organic )*(?:(?:(?:red|green|yellow|orange)(?: bell)?|bell|sweet|chili|chilli) peppers?|green beans?|french beans?|runner beans?|sugar snap peas|snow peas)$'],
  ['Pantry', 'canned|tinned|dried|freeze dried|dehydrated|powder(?:ed)?|shelf stable|jam|jelly|preserves?|marmalade|peanut butter|almond butter|cashew butter|coconut milk|coconut cream|broth|stock|soup|sauces?|ketchup|mustard|mayonnaise|salsa|puree|paste|juice concentrate'],
  ['Refrigerated', 'oat milk|almond milk|soy milk|soya milk'],
  ['Pantry', 'cereal|granola|oats?|oatmeal|flour|rice|pasta|noodles?|spaghetti|penne|macaroni|couscous|quinoa|lentils?|chickpeas?|beans?|breadcrumbs?|crackers?|chips|crisps|popcorn|biscuits?|cookies?|chocolate|sugar|salt|pepper|paprika|cumin|cinnamon|turmeric|seasoning|spices?|oil|vinegar|honey|syrup|nuts?|almonds?|walnuts?|cashews?|peanuts?|seeds?|chia|coffee|tea'],
  ['Drinks', 'water|juice|smoothies?|soda|cola|lemonade|kombucha|beer|wine'],
  ['Bakery', 'bread|wraps?|tortillas?|bagels?|buns?|rolls?|pita|croissants?|muffins?'],
  ['Refrigerated', 'tofu|tempeh|seitan|hummus|kimchi|oat milk|almond milk|soy milk|soya milk'],
  ['Dairy & eggs', 'milk|yogurt|yoghurt|kefir|cheese|cheddar|parmesan|mozzarella|feta|ricotta|butter|cream|eggs?'],
  ['Meat & seafood', 'chicken|turkey|beef|pork|lamb|steak|bacon|sausage|sausages|meatballs?|salmon|tuna|cod|haddock|trout|tilapia|halibut|shrimp|prawns?|scallops?|mussels?|clams?|lobster|crab|fish'],
  ['Produce', 'strawberr(?:y|ies)|blueberr(?:y|ies)|raspberr(?:y|ies)|blackberr(?:y|ies)|cranberr(?:y|ies)|berr(?:y|ies)|apples?|pears?|bananas?|oranges?|mandarins?|clementines?|lemons?|limes?|grapes?|peaches?|nectarines?|plums?|kiwi|mango(?:es)?|pineapples?|melons?|watermelons?|avocados?|tomato(?:es)?|potato(?:es)?|carrots?|broccoli|cauliflower|spinach|kale|lettuce|romaine|arugula|rocket|cucumbers?|courgettes?|zucchini|aubergines?|eggplants?|mushrooms?|onions?|scallions?|garlic|ginger|celery|cabbage|bok choy|pak choi|asparagus|beets?|beetroot|squash|pumpkin|corn|peas|edamame|parsley|cilantro|coriander|basil|mint|dill|rosemary|thyme|oregano'],
];

// One executable implementation shared by the approved and legacy renderers.
// Word boundaries avoid e.g. "cod" in "avocado"; earlier forms win over flavours.
export const groceryAisleScript = `
var groceryAisleOrder=${JSON.stringify(groceryAisleOrder)};
var groceryAisleRules=${JSON.stringify(rules)}.map(function(rule){return [rule[0],new RegExp('\\\\b(?:'+rule[1]+')\\\\b','i')];});
function inferAisle(item){
  var label=String(item.displayName||'').normalize('NFKC').toLowerCase().replace(/[-–—_]/g,' ').replace(/\\s+/g,' ').trim();
  for(var i=0;i<groceryAisleRules.length;i++)if(groceryAisleRules[i][1].test(label))return groceryAisleRules[i][0];
  return 'Other';
}
`;
