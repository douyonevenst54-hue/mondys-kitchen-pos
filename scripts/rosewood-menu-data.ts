/**
 * Rosewood Cafe by Mondy's: the menu from the October 2026 PDFs.
 * Edit here and re-run `npx tsx scripts/load-rosewood-menu.ts --apply`.
 *
 * Prices come from the "Final Menu Pricing" sheets (Oct 2026). The loader
 * fills in any dish that has no price yet; run it with --set-prices to make
 * every price match this file again. After that, change prices in the POS
 * (staff menu → Prices). A dish with no price stays off both menus.
 */

export type OptionDef = string | { name: string; price: number }; // price = extra charge

export type GroupDef = {
  key: string; // stable id; never change once loaded
  name: string; // what staff and customers see
  min: number; // fewest choices allowed (1 = required)
  max: number; // most choices allowed
  free?: number; // picks included before charges apply ("2 flavors included")
  options: OptionDef[];
};

export type ItemDef = {
  name: string;
  price?: number; // base price (smallest size / hot / no extras); leave out = needs a price
  description?: string;
  number?: number; // number on the paper menu
  signature?: boolean; // ★ Rosewood Signature
  groups?: string[]; // GroupDef keys, in the order to ask
};

export type CategoryDef = { name: string; items: ItemDef[] };

const SIDE_LIST = [
  "Baked Mac & Cheese",
  "White Rice",
  "Rice & Beans",
  "Sweet Plantains",
  "Seasonal Vegetables",
  "Sauteed Spinach",
  "Pikliz",
];
const FRIES = ["Classic Fries", "Curly Fries", "Sweet Potato Fries", "Seasoned Tater Tots"];
const ADD_IN = 0.75;

export const GROUPS: GroupDef[] = [
  { key: "rw-breakfast-meat", name: "Meat", min: 1, max: 1, options: ["Bacon", "Turkey Bacon", "Sausage"] },
  {
    key: "rw-bowl-protein",
    name: "Protein",
    min: 1,
    max: 1,
    // Sheet: Chicken $11.99, Beef $13.99, Shrimp $14.99
    options: ["Grilled Chicken", "Crispy Chicken", { name: "Shrimp", price: 3.0 }, { name: "Beef", price: 2.0 }],
  },
  { key: "rw-bowl-base", name: "Base", min: 1, max: 1, options: ["White Rice", "Rice & Beans", "Fresh Greens"] },
  {
    key: "rw-bowl-finish",
    name: "Finish",
    min: 0,
    max: 6,
    options: ["Sweet Plantains", "Pikliz", "Seasonal Vegetables", "Peppers & Onions", "Spinach", "Tomato"],
  },
  { key: "rw-bowl-sauce", name: "Sauce", min: 1, max: 1, options: ["House Sauce", "House BBQ", "Citrus-Herb"] },
  { key: "rw-two-sides", name: "Two sides", min: 2, max: 2, options: SIDE_LIST },
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
    // Sheet: Chicken / Sausage / Meatball $12.99, Shrimp $14.99
    options: [{ name: "Shrimp", price: 2.0 }, "Grilled Chicken", "Crispy Chicken", "Sausage", "Meatballs"],
  },
  { key: "rw-side-size", name: "Size", min: 1, max: 1, options: ["Small", { name: "Large", price: 2.5 }] },

  // ── Coffee ── Sheet: brewed hot $2.99/$3.49, iced $3.49/$3.99;
  //    latte & macchiato hot $4.49/$5.49, iced $4.99/$5.99; espresso $2.49/$3.49
  { key: "rw-hot-iced", name: "Hot or iced", min: 1, max: 1, options: ["Hot", { name: "Iced", price: 0.5 }] },
  { key: "rw-coffee-size", name: "Size", min: 1, max: 1, options: ["Small", { name: "Large", price: 0.5 }] },
  { key: "rw-latte-size", name: "Size", min: 1, max: 1, options: ["Small", { name: "Large", price: 1.0 }] },
  { key: "rw-espresso-shot", name: "Shot", min: 1, max: 1, options: ["Single", { name: "Double", price: 1.0 }] },
  {
    key: "rw-coffee-flavor",
    name: "Flavor",
    min: 0,
    max: 6,
    free: 2, // "Choose up to 2 flavors. Additional flavors +$0.50 each"
    options: ["Vanilla", "Caramel", "Hazelnut", "Mocha", "Pumpkin", "Coconut"].map((name) => ({ name, price: 0.5 })),
  },
  {
    key: "rw-coffee-milk",
    name: "Milk",
    min: 0,
    max: 1,
    options: ["Whole", "Low-Fat", { name: "Oat", price: 0.5 }, { name: "Almond", price: 0.5 }],
  },
  {
    key: "rw-coffee-extras",
    name: "Extras",
    min: 0,
    max: 4,
    options: [
      { name: "Extra Espresso Shot", price: 1.0 },
      { name: "Whipped Cream", price: 0.5 },
      { name: "Caramel Drizzle", price: 0.5 },
      "Cinnamon",
    ],
  },

  // ── Smoothies ── Sheet: Small $9.99, Large $12.49
  { key: "rw-smoothie-size", name: "Size", min: 1, max: 1, options: ["Small", { name: "Large", price: 2.5 }] },
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
    max: 8,
    options: [
      { name: "Vanilla Oats", price: ADD_IN },
      { name: "Peanut Butter", price: 2.0 },
      { name: "Chia Seeds", price: ADD_IN },
      { name: "Flax Seeds", price: ADD_IN },
      { name: "Ginger", price: ADD_IN },
      { name: "Organic Cocoa", price: ADD_IN },
      { name: "Honey", price: ADD_IN },
      { name: "Protein", price: ADD_IN }, // handwritten on the sheet next to "+$0.75 each"
    ],
  },
  {
    key: "rw-smoothie-toppings",
    name: "Toppings",
    min: 0,
    max: 6,
    free: 1, // one topping included, "Extra topping $1.00"
    options: ["Granola", "Coconut Flakes", "Chia Seeds", "Fresh Berries", "Cinnamon", "Honey Drizzle"].map((name) => ({
      name,
      price: 1.0,
    })),
  },
];

const COFFEE = ["rw-hot-iced", "rw-coffee-size", "rw-coffee-flavor", "rw-coffee-milk", "rw-coffee-extras"];
const LATTE = ["rw-hot-iced", "rw-latte-size", "rw-coffee-flavor", "rw-coffee-milk", "rw-coffee-extras"];
const SMOOTHIE = ["rw-smoothie-size", "rw-smoothie-base", "rw-smoothie-addins", "rw-smoothie-toppings"];
const SMOOTHIE_PRICE = 9.99;

export const MENU: CategoryDef[] = [
  {
    name: "Breakfast",
    items: [
      { number: 1, name: "The New Englander", price: 8.99, description: "Two eggs, breakfast potatoes & toast", groups: ["rw-breakfast-meat"] },
      { number: 2, name: "Garden Scramble", price: 8.49, description: "Eggs, spinach, peppers, onions & tomato, served with breakfast potatoes" },
      {
        number: 3,
        name: "Morning Rush",
        price: 8.99,
        description: "Eggs, breakfast potatoes, peppers & cheese wrapped in a warm tortilla",
        groups: ["rw-breakfast-meat"],
      },
      { number: 4, name: "Honey Bird", price: 9.49, signature: true, description: "Crispy chicken, Belgian waffle & spiced honey drizzle" },
    ],
  },
  {
    name: "Bowls",
    items: [
      {
        number: 5,
        name: "Island Fresh Bowl",
        price: 11.99,
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
        price: 12.99,
        signature: true,
        description: "Grilled chicken finished with smoky BBQ sauce & two sides",
        groups: ["rw-two-sides"],
      },
      { number: 7, name: "Fritay", price: 13.99, signature: true, description: "Griot, fried plantains, akra & pikliz" },
      {
        number: 8,
        name: "Island Conch Bites",
        price: 15.99,
        description: "Crispy conch fritters with peppers, onions & herbs, served with house dipping sauce",
      },
      { number: 9, name: "Harbor Shrimp & Rice", price: 14.99, description: "Seasoned shrimp with peppers & onions, served over white rice" },
      { number: 10, name: "Savory Beef & Rice", price: 14.99, description: "Seasoned beef with peppers & onions", groups: ["rw-rice"] },
    ],
  },
  {
    name: "Passport Special",
    items: [
      {
        // Price changes with the dish: set it in Prices each time the PS changes.
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
        price: 11.99,
        signature: true,
        description: "Grilled or crispy chicken, lettuce & tomato on toasted brioche",
        groups: ["rw-chicken-style", "rw-chick-sauce"],
      },
      {
        number: 12,
        name: "Boston Steak & Cheese",
        price: 12.99,
        description: "Shaved steak, melted cheese, peppers & onions",
        groups: ["rw-sub-or-wrap"],
      },
      {
        number: 13,
        name: "Wrap It Up",
        price: 11.99,
        description: "Grilled or crispy chicken, lettuce, tomato & cheese in a warm tortilla",
        groups: ["rw-chicken-style", "rw-wrap-dressing"],
      },
      { number: 14, name: "Turkey Club", price: 12.99, description: "Roasted turkey, bacon, lettuce, tomato & mayo on toasted bread" },
      { number: 15, name: "Garden Press", price: 9.99, description: "Grilled chicken, spinach, tomato, cheese & house spread, pressed warm" },
      {
        number: 16,
        name: "Deli Duo",
        price: 10.99,
        description: "Chicken salad or tuna salad with lettuce & tomato on a fresh roll",
        groups: ["rw-deli-salad"],
      },
    ],
  },
  {
    name: "Cafe Favorites",
    items: [
      {
        number: 17,
        name: "The Double Take",
        price: 12.99,
        description: "Single or double cheeseburger with lettuce, tomato, pickles & house sauce on toasted brioche, served with fries",
        groups: ["rw-burger-size", "rw-burger-extra"],
      },
      {
        number: 18,
        name: "Golden Tenders",
        price: 11.99,
        description: "Crispy chicken tenders with dipping sauce & choice of fries",
        groups: ["rw-fries-choice"],
      },
      { number: 19, name: "Mondy's Wings", price: 12.99, signature: true, description: "Choose your sauce", groups: ["rw-wings-sauce"] },
      { number: 20, name: "Classic Dog & Fries", price: 8.99, description: "Grilled beef hot dog on a toasted bun, served with fries" },
    ],
  },
  {
    name: "Pasta",
    items: [
      {
        number: 21,
        name: "Pasta Your Way",
        price: 12.99,
        description: "Choose your pasta, sauce & protein",
        groups: ["rw-pasta-shape", "rw-pasta-sauce", "rw-pasta-protein"],
      },
    ],
  },
  {
    name: "Sides",
    items: [
      // Breakfast sides: not on the price sheet yet; set in Prices.
      ...["Eggs", "Breakfast Potatoes", "Bacon", "Turkey Bacon", "Sausage", "Toast", "Fresh Fruit"].map((name) => ({ name })),
      { name: "Baked Mac & Cheese", price: 4.99 },
      { name: "White Rice", price: 3.49 },
      { name: "Rice & Beans", price: 3.99 },
      { name: "Sweet Plantains", price: 4.49 },
      { name: "Seasonal Vegetables", price: 4.49, groups: ["rw-side-size"] },
      { name: "Sauteed Spinach", price: 4.49, groups: ["rw-side-size"] },
      { name: "Pikliz", price: 1.99 },
    ],
  },
  {
    name: "Fries & Tots",
    items: [
      { name: "Classic Fries", price: 3.99 },
      { name: "Curly Fries", price: 4.49, groups: ["rw-side-size"] },
      { name: "Sweet Potato Fries", price: 4.49, groups: ["rw-side-size"] },
      { name: "Seasoned Tater Tots", price: 4.49, groups: ["rw-side-size"] },
    ],
  },
  {
    name: "Coffee",
    items: [
      { name: "Fresh Brewed Coffee", price: 2.99, groups: COFFEE },
      { name: "Espresso", price: 2.49, groups: ["rw-espresso-shot", "rw-coffee-flavor", "rw-coffee-extras"] },
      { name: "Macchiato", price: 4.49, groups: LATTE },
      { name: "Latte", price: 4.49, groups: LATTE },
    ],
  },
  {
    name: "Smoothies",
    items: [
      { number: 1, name: "Island Silk", price: SMOOTHIE_PRICE, description: "Mango & passion fruit", groups: SMOOTHIE },
      { number: 2, name: "Guava Glow", price: SMOOTHIE_PRICE, description: "Guava & strawberry", groups: SMOOTHIE },
      { number: 3, name: "Pineapple Passion", price: SMOOTHIE_PRICE, description: "Pineapple & passion fruit", groups: SMOOTHIE },
      { number: 4, name: "Peach Paradise", price: SMOOTHIE_PRICE, description: "Peach & pineapple", groups: SMOOTHIE },
      { number: 5, name: "Cherry Cocoa", price: SMOOTHIE_PRICE, description: "Dark cherry & organic cocoa", groups: SMOOTHIE },
      { number: 6, name: "Berry Velvet", price: SMOOTHIE_PRICE, description: "Strawberry & blueberry", groups: SMOOTHIE },
      { number: 7, name: "Passion Sunset", price: SMOOTHIE_PRICE, description: "Passion fruit, pineapple & guava", groups: SMOOTHIE },
      { number: 8, name: "Green Island", price: SMOOTHIE_PRICE, description: "Spinach & pineapple", groups: SMOOTHIE },
      { number: 9, name: "S.B.", price: SMOOTHIE_PRICE, signature: true, description: "Soursop & banana", groups: SMOOTHIE },
      {
        number: 10,
        name: "New England Harvest",
        price: SMOOTHIE_PRICE,
        description: "Cranberry, banana, vanilla & cinnamon",
        groups: SMOOTHIE,
      },
    ],
  },
  {
    // From the handwritten grab-and-go list.
    name: "Grab & Go",
    items: [
      { name: "Soda", price: 1.5 },
      { name: "Iced Tea", price: 2.99 },
      { name: "Orange Juice", price: 2.99 },
      { name: "Water", price: 1.29 },
      { name: "Gatorade", price: 2.59 },
      { name: "Starbucks Coffee", price: 4.39 },
      { name: "Chobani Protein", price: 2.99 },
      { name: "Chobani Strawberry Yogurt", price: 1.99 },
      { name: "Chobani Yogurt", price: 1.59 },
      { name: "Chobani Flip", price: 1.99 },
      { name: "Coffee Cake", price: 2.59 },
      { name: "Corn Bread", price: 2.59 },
      { name: "Muffin", price: 1.09 },
      { name: "Chips", price: 1.5 },
      { name: "Candy Bar", price: 2.2 },
    ],
  },
];

export const RESTAURANT_NAME = "Rosewood Cafe by Mondy's";
export const RECEIPT_FOOTER = "Thank you for visiting Rosewood Cafe by Mondy's!";
