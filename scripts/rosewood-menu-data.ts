/**
 * Rosewood Cafe by Mondy's: the menu from the October 2026 PDFs.
 * Edit here and re-run `npx tsx scripts/load-rosewood-menu.ts --apply`.
 *
 * Prices are NOT set here. Set them in the POS: staff menu → Prices.
 * A dish with no price stays off the register and online menu.
 */

export type GroupDef = {
  key: string; // stable id; never change once loaded
  name: string; // what staff and customers see
  min: number; // fewest choices allowed (1 = required)
  max: number; // most choices allowed
  options: string[];
};

export type ItemDef = {
  name: string;
  description?: string;
  number?: number; // number on the paper menu
  signature?: boolean; // ★ Rosewood Signature
  groups?: string[]; // GroupDef keys, in the order to ask
};

export type CategoryDef = { name: string; items: ItemDef[] };

const SIDES = [
  "Baked Mac & Cheese",
  "White Rice",
  "Rice & Beans",
  "Sweet Plantains",
  "Seasonal Vegetables",
  "Sauteed Spinach",
  "Pikliz",
];
const FRIES = ["Classic Fries", "Curly Fries", "Sweet Potato Fries", "Seasoned Tater Tots"];

export const GROUPS: GroupDef[] = [
  { key: "rw-breakfast-meat", name: "Meat", min: 1, max: 1, options: ["Bacon", "Turkey Bacon", "Sausage"] },
  { key: "rw-bowl-protein", name: "Protein", min: 1, max: 1, options: ["Grilled Chicken", "Crispy Chicken", "Shrimp", "Beef"] },
  { key: "rw-bowl-base", name: "Base", min: 1, max: 1, options: ["White Rice", "Rice & Beans", "Fresh Greens"] },
  {
    key: "rw-bowl-finish",
    name: "Finish",
    min: 0,
    max: 6,
    options: ["Sweet Plantains", "Pikliz", "Seasonal Vegetables", "Peppers & Onions", "Spinach", "Tomato"],
  },
  { key: "rw-bowl-sauce", name: "Sauce", min: 1, max: 1, options: ["House Sauce", "House BBQ", "Citrus-Herb"] },
  { key: "rw-two-sides", name: "Two sides", min: 2, max: 2, options: SIDES },
  { key: "rw-rice", name: "Rice", min: 1, max: 1, options: ["White Rice", "Rice & Beans"] },
  { key: "rw-chicken-style", name: "Chicken", min: 1, max: 1, options: ["Grilled", "Crispy"] },
  { key: "rw-chick-sauce", name: "Sauce", min: 1, max: 1, options: ["House", "Buffalo", "Chipotle", "BBQ", "Honey Mustard"] },
  { key: "rw-sub-or-wrap", name: "Sub or wrap", min: 1, max: 1, options: ["Sub", "Wrap"] },
  {
    key: "rw-wrap-dressing",
    name: "Dressing",
    min: 1,
    max: 1,
    options: ["Ranch", "Caesar", "Buffalo", "Chipotle", "BBQ", "Honey Mustard"],
  },
  { key: "rw-deli-salad", name: "Salad", min: 1, max: 1, options: ["Chicken Salad", "Tuna Salad"] },
  { key: "rw-burger-size", name: "Size", min: 1, max: 1, options: ["Single", "Double"] },
  { key: "rw-burger-extra", name: "Add", min: 0, max: 1, options: ["Bacon"] },
  { key: "rw-fries-choice", name: "Fries", min: 1, max: 1, options: FRIES },
  { key: "rw-wings-sauce", name: "Sauce", min: 1, max: 1, options: ["Buffalo", "Honey BBQ", "House BBQ", "Island Sweet Chili"] },
  { key: "rw-pasta-shape", name: "Pasta", min: 1, max: 1, options: ["Penne", "Fettuccine"] },
  { key: "rw-pasta-sauce", name: "Sauce", min: 1, max: 1, options: ["Red Sauce", "Alfredo"] },
  {
    key: "rw-pasta-protein",
    name: "Protein",
    min: 1,
    max: 1,
    options: ["Shrimp", "Grilled Chicken", "Crispy Chicken", "Sausage", "Meatballs"],
  },
  { key: "rw-hot-iced", name: "Hot or iced", min: 1, max: 1, options: ["Hot", "Iced"] },
  { key: "rw-espresso-shot", name: "Shot", min: 1, max: 1, options: ["Single", "Double"] },
  {
    key: "rw-coffee-flavor",
    name: "Flavor",
    min: 0,
    max: 2,
    options: ["Vanilla", "Caramel", "Hazelnut", "Mocha", "Pumpkin", "Coconut"],
  },
  { key: "rw-coffee-milk", name: "Milk", min: 0, max: 1, options: ["Whole", "Low-Fat", "Oat", "Almond", "Coconut"] },
  {
    key: "rw-coffee-extras",
    name: "Extras",
    min: 0,
    max: 4,
    options: ["Extra Espresso Shot", "Whipped Cream", "Caramel Drizzle", "Cinnamon"],
  },
  {
    key: "rw-smoothie-base",
    name: "Base",
    min: 1,
    max: 1,
    options: ["Whole Milk", "Low-Fat Milk", "Coconut Milk", "Oat Milk", "Almond Milk", "Coconut Water"],
  },
  {
    key: "rw-smoothie-addins",
    name: "Add-ins",
    min: 0,
    max: 7,
    options: ["Vanilla Oats", "Peanut Butter", "Chia Seeds", "Flax Seeds", "Ginger", "Organic Cocoa", "Honey"],
  },
  {
    key: "rw-smoothie-toppings",
    name: "Toppings",
    min: 0,
    max: 6,
    options: ["Granola", "Coconut Flakes", "Chia Seeds", "Fresh Berries", "Cinnamon", "Honey Drizzle"],
  },
];

const COFFEE_EXTRAS = ["rw-coffee-flavor", "rw-coffee-milk", "rw-coffee-extras"];
const SMOOTHIE = ["rw-smoothie-base", "rw-smoothie-addins", "rw-smoothie-toppings"];

export const MENU: CategoryDef[] = [
  {
    name: "Breakfast",
    items: [
      { number: 1, name: "The New Englander", description: "Two eggs, breakfast potatoes & toast", groups: ["rw-breakfast-meat"] },
      { number: 2, name: "Garden Scramble", description: "Eggs, spinach, peppers, onions & tomato, served with breakfast potatoes" },
      {
        number: 3,
        name: "Morning Rush",
        description: "Eggs, breakfast potatoes, peppers & cheese wrapped in a warm tortilla",
        groups: ["rw-breakfast-meat"],
      },
      { number: 4, name: "Honey Bird", signature: true, description: "Crispy chicken, Belgian waffle & spiced honey drizzle" },
    ],
  },
  {
    name: "Bowls",
    items: [
      {
        number: 5,
        name: "Island Fresh Bowl",
        description: "Build it your way",
        groups: ["rw-bowl-protein", "rw-bowl-base", "rw-bowl-finish", "rw-bowl-sauce"],
      },
    ],
  },
  {
    name: "Grill & Favorites",
    items: [
      {
        number: 6,
        name: "Smoke & Sizzle",
        signature: true,
        description: "Grilled chicken finished with smoky BBQ sauce & two sides",
        groups: ["rw-two-sides"],
      },
      { number: 7, name: "Fritay", signature: true, description: "Griot, fried plantains, akra & pikliz" },
      {
        number: 8,
        name: "Island Conch Bites",
        description: "Crispy conch fritters with peppers, onions & herbs, served with house dipping sauce",
      },
      { number: 9, name: "Harbor Shrimp & Rice", description: "Seasoned shrimp with peppers & onions, served over white rice" },
      { number: 10, name: "Savory Beef & Rice", description: "Seasoned beef with peppers & onions", groups: ["rw-rice"] },
    ],
  },
  {
    name: "Passport Special",
    items: [
      {
        name: "PS: Passport Special",
        description: "A little taste of somewhere different. A rotating chef-inspired dish featuring flavors from around the world. Ask about today's PS.",
      },
    ],
  },
  {
    name: "Sandwiches, Wraps & Rolls",
    items: [
      {
        number: 11,
        name: "Mondy's Chick",
        signature: true,
        description: "Grilled or crispy chicken, lettuce & tomato on toasted brioche",
        groups: ["rw-chicken-style", "rw-chick-sauce"],
      },
      { number: 12, name: "Boston Steak & Cheese", description: "Shaved steak, melted cheese, peppers & onions", groups: ["rw-sub-or-wrap"] },
      {
        number: 13,
        name: "Wrap It Up",
        description: "Grilled or crispy chicken, lettuce, tomato & cheese in a warm tortilla",
        groups: ["rw-chicken-style", "rw-wrap-dressing"],
      },
      { number: 14, name: "Turkey Club", description: "Roasted turkey, bacon, lettuce, tomato & mayo on toasted bread" },
      { number: 15, name: "Garden Press", description: "Grilled chicken, spinach, tomato, cheese & house spread, pressed warm" },
      { number: 16, name: "Deli Duo", description: "Chicken salad or tuna salad with lettuce & tomato on a fresh roll", groups: ["rw-deli-salad"] },
    ],
  },
  {
    name: "Cafe Favorites",
    items: [
      {
        number: 17,
        name: "The Double Take",
        description: "Single or double cheeseburger with lettuce, tomato, pickles & house sauce on toasted brioche, served with fries",
        groups: ["rw-burger-size", "rw-burger-extra"],
      },
      { number: 18, name: "Golden Tenders", description: "Crispy chicken tenders with dipping sauce & choice of fries", groups: ["rw-fries-choice"] },
      { number: 19, name: "Mondy's Wings", signature: true, description: "Choose your sauce", groups: ["rw-wings-sauce"] },
      { number: 20, name: "Classic Dog & Fries", description: "Grilled beef hot dog on a toasted bun, served with fries" },
    ],
  },
  {
    name: "Pasta",
    items: [
      {
        number: 21,
        name: "Pasta Your Way",
        description: "Choose your pasta, sauce & protein",
        groups: ["rw-pasta-shape", "rw-pasta-sauce", "rw-pasta-protein"],
      },
    ],
  },
  {
    name: "Sides",
    items: [
      ...["Eggs", "Breakfast Potatoes", "Bacon", "Turkey Bacon", "Sausage", "Toast", "Fresh Fruit"].map((name) => ({ name })),
      ...SIDES.map((name) => ({ name })),
    ],
  },
  { name: "Fries & Tots", items: FRIES.map((name) => ({ name })) },
  {
    name: "Coffee",
    items: [
      { name: "Fresh Brewed Coffee", groups: ["rw-hot-iced", ...COFFEE_EXTRAS] },
      { name: "Espresso", groups: ["rw-espresso-shot", "rw-coffee-flavor", "rw-coffee-extras"] },
      { name: "Macchiato", groups: ["rw-hot-iced", ...COFFEE_EXTRAS] },
      { name: "Latte", groups: ["rw-hot-iced", ...COFFEE_EXTRAS] },
    ],
  },
  {
    name: "Smoothies",
    items: [
      { number: 1, name: "Island Silk", description: "Mango & passion fruit", groups: SMOOTHIE },
      { number: 2, name: "Guava Glow", description: "Guava & strawberry", groups: SMOOTHIE },
      { number: 3, name: "Pineapple Passion", description: "Pineapple & passion fruit", groups: SMOOTHIE },
      { number: 4, name: "Peach Paradise", description: "Peach & pineapple", groups: SMOOTHIE },
      { number: 5, name: "Cherry Cocoa", description: "Dark cherry & organic cocoa", groups: SMOOTHIE },
      { number: 6, name: "Berry Velvet", description: "Strawberry & blueberry", groups: SMOOTHIE },
      { number: 7, name: "Passion Sunset", description: "Passion fruit, pineapple & guava", groups: SMOOTHIE },
      { number: 8, name: "Green Island", description: "Spinach & pineapple", groups: SMOOTHIE },
      { number: 9, name: "S.B.", signature: true, description: "Soursop & banana", groups: SMOOTHIE },
      { number: 10, name: "New England Harvest", description: "Cranberry, banana, vanilla & cinnamon", groups: SMOOTHIE },
    ],
  },
];

export const RESTAURANT_NAME = "Rosewood Cafe by Mondy's";
export const RECEIPT_FOOTER = "Thank you for visiting Rosewood Cafe by Mondy's!";
