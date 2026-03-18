import db from './db.js'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'

// Check if already seeded
const existing = db.prepare('SELECT COUNT(*) as count FROM brands').get() as { count: number }
if (existing.count > 0) {
  console.log('Database already seeded, skipping.')
  process.exit(0)
}

console.log('Seeding database...')

// ---- Categories ----
const categories = [
  { id: 'cat1',  name: 'Chips & Snacks',         slug: 'chips-snacks',         emoji: '🍿', sort_order: 1 },
  { id: 'cat2',  name: 'Cookies & Crackers',      slug: 'cookies-crackers',      emoji: '🍪', sort_order: 2 },
  { id: 'cat3',  name: 'Ice Cream & Frozen',       slug: 'ice-cream-frozen',      emoji: '🍦', sort_order: 3 },
  { id: 'cat4',  name: 'Candy & Chocolate',        slug: 'candy-chocolate',       emoji: '🍫', sort_order: 4 },
  { id: 'cat5',  name: 'Beverages',                slug: 'beverages',             emoji: '🥤', sort_order: 5 },
  { id: 'cat6',  name: 'Cereal & Breakfast',       slug: 'cereal-breakfast',      emoji: '🥣', sort_order: 6 },
  { id: 'cat7',  name: 'Cleaning & Household',     slug: 'cleaning-household',    emoji: '🧹', sort_order: 7 },
  { id: 'cat8',  name: 'Personal Care',            slug: 'personal-care',         emoji: '🧴', sort_order: 8 },
  { id: 'cat9',  name: 'Paper & Home',             slug: 'paper-home',            emoji: '🏠', sort_order: 9 },
  { id: 'cat10', name: 'Condiments & Sauces',      slug: 'condiments-sauces',     emoji: '🫙', sort_order: 10 },
]

const insertCategory = db.prepare('INSERT INTO categories (id, name, slug, emoji, sort_order) VALUES (?, ?, ?, ?, ?)')
for (const c of categories) {
  insertCategory.run(c.id, c.name, c.slug, c.emoji, c.sort_order)
}

// ---- Users ----
const demoPassword = bcrypt.hashSync('demo1234', 10)

const users = [
  { id: 'u1', email: 'snackqueen@biteclimb.com',    username: 'SnackQueen',       password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80', bio: 'Snack explorer and product tier-list queen. Always hunting for the next S-tier find!',     product_personality: 'Flavor Chaser' },
  { id: 'u2', email: 'chipfiend@biteclimb.com',      username: 'ChipFiend',        password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80', bio: 'Chips are life. All day, every day.',                                                       product_personality: 'Crunch Connoisseur' },
  { id: 'u3', email: 'cleanfreek@biteclimb.com',     username: 'CleanFreek',       password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=100&q=80', bio: 'Testing every cleaning product so you don\'t have to.',                                      product_personality: 'Clean Machine' },
  { id: 'u4', email: 'bargainhunter@biteclimb.com',  username: 'BargainHunter',    password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80', bio: 'Finding the best value in every aisle.',                                                    product_personality: 'Value Seeker' },
  { id: 'u5', email: 'sweettooth@biteclimb.com',     username: 'SweetTooth',       password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=100&q=80', bio: 'If it\'s sweet, I rate it.',                                                                product_personality: 'Sugar Rush' },
  { id: 'u6', email: 'healthnut@biteclimb.com',      username: 'HealthNut',        password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&q=80', bio: 'Clean eating advocate. Organic or bust.',                                                   product_personality: 'Wellness Warrior' },
  { id: 'u7', email: 'icecreamlover@biteclimb.com',  username: 'IceCreamLover',    password_hash: demoPassword, avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80', bio: 'Pint connoisseur. One pint at a time.',                                                     product_personality: 'Frozen Fanatic' },
]

const insertUser = db.prepare('INSERT INTO users (id, email, username, password_hash, avatar, bio, product_personality) VALUES (?, ?, ?, ?, ?, ?, ?)')
for (const u of users) {
  insertUser.run(u.id, u.email, u.username, u.password_hash, u.avatar, u.bio, u.product_personality)
}

// ---- Brands ----
const brands = [
  { id: 'b1',  name: "Lay's",            logo_url: '', description: 'Iconic potato chip brand with endless flavor varieties.' },
  { id: 'b2',  name: 'Oreo',             logo_url: '', description: 'The world\'s favorite sandwich cookie.' },
  { id: 'b3',  name: "Ben & Jerry's",    logo_url: '', description: 'Premium ice cream with creative flavors and chunks.' },
  { id: 'b4',  name: 'Tide',             logo_url: '', description: 'America\'s #1 laundry detergent brand.' },
  { id: 'b5',  name: 'Dove',             logo_url: '', description: 'Gentle personal care products for real beauty.' },
  { id: 'b6',  name: 'Bounty',           logo_url: '', description: 'The quicker picker-upper. Premium paper towels.' },
  { id: 'b7',  name: 'Coca-Cola',        logo_url: '', description: 'The world\'s most recognized beverage brand.' },
  { id: 'b8',  name: 'Cheerios',         logo_url: '', description: 'Heart-healthy whole grain oat cereal.' },
  { id: 'b9',  name: "Hershey's",        logo_url: '', description: 'America\'s classic chocolate brand.' },
  { id: 'b10', name: 'Heinz',            logo_url: '', description: 'The gold standard in ketchup and condiments.' },
  { id: 'b11', name: 'Doritos',          logo_url: '', description: 'Bold tortilla chips for bold snackers.' },
  { id: 'b12', name: 'Häagen-Dazs',      logo_url: '', description: 'Luxury ice cream made with the finest ingredients.' },
  { id: 'b13', name: 'Cascade',          logo_url: '', description: 'Powerful dishwasher detergent for sparkling clean dishes.' },
  { id: 'b14', name: 'Pepsi',            logo_url: '', description: 'Bold cola taste loved worldwide.' },
  { id: 'b15', name: 'Sriracha',         logo_url: '', description: 'The iconic rooster sauce that changed hot sauce forever.' },
]

const insertBrand = db.prepare('INSERT INTO brands (id, name, logo_url, description) VALUES (?, ?, ?, ?)')
const insertBrandFts = db.prepare('INSERT INTO brands_fts (rowid, name, description) VALUES (?, ?, ?)')
for (let i = 0; i < brands.length; i++) {
  const b = brands[i]
  insertBrand.run(b.id, b.name, b.logo_url, b.description)
  insertBrandFts.run(i + 1, b.name, b.description)
}

// ---- Products ----
const products = [
  // Chips & Snacks (cat1)
  { id: 'p1',  name: "Lay's Classic",                   image_url: '', brand_id: 'b1',  category_id: 'cat1', subcategory: 'Potato Chips',     description: 'The original salted potato chip. Crispy, salty perfection.',                          barcode: '028400443685', price_range: '$',  size: '8 oz',    seed_tier: 'A', seed_score: 4.5, seed_source: 'aggregate' },
  { id: 'p2',  name: "Lay's Sour Cream & Onion",        image_url: '', brand_id: 'b1',  category_id: 'cat1', subcategory: 'Potato Chips',     description: 'Tangy sour cream meets savory onion in every crispy chip.',                          barcode: '028400443692', price_range: '$',  size: '7.75 oz', seed_tier: 'A', seed_score: 4.6, seed_source: 'aggregate' },
  { id: 'p3',  name: 'Doritos Nacho Cheese',            image_url: '', brand_id: 'b11', category_id: 'cat1', subcategory: 'Tortilla Chips',   description: 'Bold nacho cheese flavored tortilla chips. The OG.',                                 barcode: '028400064545', price_range: '$',  size: '9.25 oz', seed_tier: 'S', seed_score: 5.2, seed_source: 'aggregate' },
  { id: 'p4',  name: 'Doritos Cool Ranch',              image_url: '', brand_id: 'b11', category_id: 'cat1', subcategory: 'Tortilla Chips',   description: 'Cool, tangy ranch seasoning on bold tortilla chips.',                                barcode: '028400064552', price_range: '$',  size: '9.25 oz', seed_tier: 'S', seed_score: 5.4, seed_source: 'aggregate' },
  { id: 'p5',  name: 'Doritos Spicy Sweet Chili',       image_url: '', brand_id: 'b11', category_id: 'cat1', subcategory: 'Tortilla Chips',   description: 'Sweet heat meets bold crunch.',                                                      barcode: '028400064569', price_range: '$',  size: '9.25 oz', seed_tier: 'A', seed_score: 4.7, seed_source: 'aggregate' },

  // Cookies & Crackers (cat2)
  { id: 'p6',  name: 'Oreo Original',                   image_url: '', brand_id: 'b2',  category_id: 'cat2', subcategory: 'Sandwich Cookies', description: 'Chocolate wafers with sweet creme filling. Twist, lick, dunk.',                      barcode: '044000032159', price_range: '$',  size: '14.3 oz', seed_tier: 'S', seed_score: 5.5, seed_source: 'aggregate' },
  { id: 'p7',  name: 'Oreo Double Stuf',                image_url: '', brand_id: 'b2',  category_id: 'cat2', subcategory: 'Sandwich Cookies', description: 'Twice the creme filling for twice the fun.',                                         barcode: '044000032166', price_range: '$',  size: '15.35 oz',seed_tier: 'S', seed_score: 5.6, seed_source: 'aggregate' },
  { id: 'p8',  name: 'Oreo Golden',                     image_url: '', brand_id: 'b2',  category_id: 'cat2', subcategory: 'Sandwich Cookies', description: 'Vanilla wafers with creme filling. The sunny side of Oreo.',                         barcode: '044000032173', price_range: '$',  size: '14.3 oz', seed_tier: 'B', seed_score: 3.8, seed_source: 'aggregate' },

  // Ice Cream & Frozen (cat3)
  { id: 'p9',  name: "Ben & Jerry's Half Baked",        image_url: '', brand_id: 'b3',  category_id: 'cat3', subcategory: 'Pints',            description: 'Chocolate & vanilla ice creams with cookie dough & brownie chunks.',                 barcode: '076840100354', price_range: '$$', size: '1 pint',  seed_tier: 'S', seed_score: 5.7, seed_source: 'aggregate' },
  { id: 'p10', name: "Ben & Jerry's Cherry Garcia",     image_url: '', brand_id: 'b3',  category_id: 'cat3', subcategory: 'Pints',            description: 'Cherry ice cream with cherries & chocolate chunks.',                                 barcode: '076840100361', price_range: '$$', size: '1 pint',  seed_tier: 'A', seed_score: 4.8, seed_source: 'aggregate' },
  { id: 'p11', name: "Ben & Jerry's Phish Food",        image_url: '', brand_id: 'b3',  category_id: 'cat3', subcategory: 'Pints',            description: 'Chocolate ice cream with gooey caramel, marshmallow, and fudge fish.',               barcode: '076840100378', price_range: '$$', size: '1 pint',  seed_tier: 'A', seed_score: 4.9, seed_source: 'aggregate' },
  { id: 'p12', name: 'Häagen-Dazs Vanilla Bean',        image_url: '', brand_id: 'b12', category_id: 'cat3', subcategory: 'Pints',            description: 'Rich, creamy vanilla with real vanilla bean specks.',                                barcode: '074570651252', price_range: '$$', size: '14 oz',   seed_tier: 'S', seed_score: 5.3, seed_source: 'aggregate' },
  { id: 'p13', name: 'Häagen-Dazs Chocolate',           image_url: '', brand_id: 'b12', category_id: 'cat3', subcategory: 'Pints',            description: 'Intensely rich chocolate ice cream made with cocoa.',                                barcode: '074570651269', price_range: '$$', size: '14 oz',   seed_tier: 'A', seed_score: 4.7, seed_source: 'aggregate' },

  // Candy & Chocolate (cat4)
  { id: 'p14', name: "Hershey's Milk Chocolate Bar",    image_url: '', brand_id: 'b9',  category_id: 'cat4', subcategory: 'Chocolate Bars',   description: 'The classic American milk chocolate bar.',                                           barcode: '034000002405', price_range: '$',  size: '1.55 oz', seed_tier: 'A', seed_score: 4.3, seed_source: 'aggregate' },
  { id: 'p15', name: "Hershey's Cookies 'n' Creme",     image_url: '', brand_id: 'b9',  category_id: 'cat4', subcategory: 'Chocolate Bars',   description: 'White creme with crunchy cookie bits.',                                              barcode: '034000002412', price_range: '$',  size: '1.55 oz', seed_tier: 'A', seed_score: 4.5, seed_source: 'aggregate' },
  { id: 'p16', name: "Reese's Peanut Butter Cups",      image_url: '', brand_id: 'b9',  category_id: 'cat4', subcategory: 'Peanut Butter',    description: 'Iconic peanut butter and chocolate combination.',                                    barcode: '034000002429', price_range: '$',  size: '1.5 oz',  seed_tier: 'S', seed_score: 5.8, seed_source: 'aggregate' },

  // Beverages (cat5)
  { id: 'p17', name: 'Coca-Cola Classic',               image_url: '', brand_id: 'b7',  category_id: 'cat5', subcategory: 'Soda',             description: 'The original cola. Refreshing taste since 1886.',                                    barcode: '049000006346', price_range: '$',  size: '12 oz',   seed_tier: 'S', seed_score: 5.1, seed_source: 'aggregate' },
  { id: 'p18', name: 'Coca-Cola Zero Sugar',            image_url: '', brand_id: 'b7',  category_id: 'cat5', subcategory: 'Soda',             description: 'Zero sugar, same great Coke taste.',                                                barcode: '049000006353', price_range: '$',  size: '12 oz',   seed_tier: 'A', seed_score: 4.6, seed_source: 'aggregate' },
  { id: 'p19', name: 'Pepsi Original',                  image_url: '', brand_id: 'b14', category_id: 'cat5', subcategory: 'Soda',             description: 'Bold cola taste that hits different.',                                               barcode: '012000001048', price_range: '$',  size: '12 oz',   seed_tier: 'A', seed_score: 4.4, seed_source: 'aggregate' },
  { id: 'p20', name: 'Pepsi Zero Sugar',                image_url: '', brand_id: 'b14', category_id: 'cat5', subcategory: 'Soda',             description: 'Maximum Pepsi taste, zero sugar.',                                                   barcode: '012000001055', price_range: '$',  size: '12 oz',   seed_tier: 'B', seed_score: 3.9, seed_source: 'aggregate' },

  // Cereal & Breakfast (cat6)
  { id: 'p21', name: 'Cheerios Original',               image_url: '', brand_id: 'b8',  category_id: 'cat6', subcategory: 'Cereal',           description: 'Whole grain oat cereal. Heart-healthy and delicious.',                               barcode: '016000275652', price_range: '$',  size: '18 oz',   seed_tier: 'A', seed_score: 4.4, seed_source: 'aggregate' },
  { id: 'p22', name: 'Honey Nut Cheerios',              image_url: '', brand_id: 'b8',  category_id: 'cat6', subcategory: 'Cereal',           description: 'Sweet honey and nut flavored Cheerios. Everyone\'s favorite.',                       barcode: '016000275669', price_range: '$',  size: '19.5 oz', seed_tier: 'S', seed_score: 5.3, seed_source: 'aggregate' },
  { id: 'p23', name: 'Frosted Cheerios',                image_url: '', brand_id: 'b8',  category_id: 'cat6', subcategory: 'Cereal',           description: 'Sweetly frosted whole grain Cheerios.',                                              barcode: '016000275676', price_range: '$',  size: '18.5 oz', seed_tier: 'B', seed_score: 3.6, seed_source: 'aggregate' },

  // Cleaning & Household (cat7)
  { id: 'p24', name: 'Tide Original Liquid',            image_url: '', brand_id: 'b4',  category_id: 'cat7', subcategory: 'Laundry',          description: 'America\'s #1 detergent. Original scent, powerful clean.',                           barcode: '037000003816', price_range: '$$', size: '92 oz',   seed_tier: 'S', seed_score: 5.4, seed_source: 'aggregate' },
  { id: 'p25', name: 'Tide PODS',                       image_url: '', brand_id: 'b4',  category_id: 'cat7', subcategory: 'Laundry',          description: '3-in-1 laundry pacs with detergent, stain remover, and brightener.',                 barcode: '037000003823', price_range: '$$', size: '42 ct',   seed_tier: 'S', seed_score: 5.2, seed_source: 'aggregate' },
  { id: 'p26', name: 'Tide Free & Gentle',              image_url: '', brand_id: 'b4',  category_id: 'cat7', subcategory: 'Laundry',          description: 'Dermatologist recommended. Free of dyes and perfumes.',                              barcode: '037000003830', price_range: '$$', size: '92 oz',   seed_tier: 'A', seed_score: 4.8, seed_source: 'aggregate' },
  { id: 'p27', name: 'Cascade Platinum Plus',           image_url: '', brand_id: 'b13', category_id: 'cat7', subcategory: 'Dishwasher',       description: 'Our best ActionPacs for a powerful clean, even in hard water.',                      barcode: '037000003847', price_range: '$$', size: '52 ct',   seed_tier: 'S', seed_score: 5.5, seed_source: 'aggregate' },
  { id: 'p28', name: 'Cascade Original',                image_url: '', brand_id: 'b13', category_id: 'cat7', subcategory: 'Dishwasher',       description: 'Trusted everyday dishwasher detergent.',                                             barcode: '037000003854', price_range: '$',  size: '75 oz',   seed_tier: 'B', seed_score: 3.7, seed_source: 'aggregate' },

  // Personal Care (cat8)
  { id: 'p29', name: 'Dove Beauty Bar',                 image_url: '', brand_id: 'b5',  category_id: 'cat8', subcategory: 'Body Wash',        description: 'Gentle cleansing with 1/4 moisturizing cream. Not a soap.',                          barcode: '011111016149', price_range: '$',  size: '4 oz',    seed_tier: 'S', seed_score: 5.3, seed_source: 'aggregate' },
  { id: 'p30', name: 'Dove Body Wash Deep Moisture',    image_url: '', brand_id: 'b5',  category_id: 'cat8', subcategory: 'Body Wash',        description: 'Nourishing body wash with NutriumMoisture technology.',                              barcode: '011111016156', price_range: '$',  size: '22 oz',   seed_tier: 'A', seed_score: 4.7, seed_source: 'aggregate' },
  { id: 'p31', name: 'Dove Men+Care Clean Comfort',     image_url: '', brand_id: 'b5',  category_id: 'cat8', subcategory: 'Body Wash',        description: 'Hydrating body wash built for men\'s skin.',                                         barcode: '011111016163', price_range: '$',  size: '18 oz',   seed_tier: 'A', seed_score: 4.5, seed_source: 'aggregate' },

  // Paper & Home (cat9)
  { id: 'p32', name: 'Bounty Select-A-Size',            image_url: '', brand_id: 'b6',  category_id: 'cat9', subcategory: 'Paper Towels',     description: 'Absorbent paper towels with flexible sheet sizes.',                                  barcode: '037000003861', price_range: '$$', size: '8 rolls', seed_tier: 'S', seed_score: 5.4, seed_source: 'aggregate' },
  { id: 'p33', name: 'Bounty Essentials',               image_url: '', brand_id: 'b6',  category_id: 'cat9', subcategory: 'Paper Towels',     description: 'Strong, absorbent towels at a great value.',                                         barcode: '037000003878', price_range: '$',  size: '6 rolls', seed_tier: 'B', seed_score: 3.5, seed_source: 'aggregate' },

  // Condiments & Sauces (cat10)
  { id: 'p34', name: 'Heinz Tomato Ketchup',            image_url: '', brand_id: 'b10', category_id: 'cat10', subcategory: 'Ketchup',         description: 'The gold standard ketchup. Made from vine-ripened tomatoes.',                        barcode: '013000001137', price_range: '$',  size: '20 oz',   seed_tier: 'S', seed_score: 5.5, seed_source: 'aggregate' },
  { id: 'p35', name: 'Heinz Yellow Mustard',            image_url: '', brand_id: 'b10', category_id: 'cat10', subcategory: 'Mustard',         description: 'Classic yellow mustard with a smooth, tangy kick.',                                  barcode: '013000001144', price_range: '$',  size: '14 oz',   seed_tier: 'B', seed_score: 3.6, seed_source: 'aggregate' },
  { id: 'p36', name: 'Heinz 57 Sauce',                  image_url: '', brand_id: 'b10', category_id: 'cat10', subcategory: 'Steak Sauce',     description: 'A blend of tomato, vinegar, and spices. Great on everything.',                       barcode: '013000001151', price_range: '$',  size: '10 oz',   seed_tier: 'A', seed_score: 4.2, seed_source: 'aggregate' },
  { id: 'p37', name: 'Sriracha Hot Chili Sauce',        image_url: '', brand_id: 'b15', category_id: 'cat10', subcategory: 'Hot Sauce',       description: 'The iconic rooster sauce. Garlic-forward, versatile heat.',                          barcode: '024463061095', price_range: '$',  size: '17 oz',   seed_tier: 'S', seed_score: 5.6, seed_source: 'aggregate' },

  // More Chips & Snacks
  { id: 'p38', name: "Lay's Barbecue",                  image_url: '', brand_id: 'b1',  category_id: 'cat1', subcategory: 'Potato Chips',     description: 'Sweet, smoky barbecue flavor on crispy chips.',                                      barcode: '028400443708', price_range: '$',  size: '7.75 oz', seed_tier: 'A', seed_score: 4.4, seed_source: 'aggregate' },
  { id: 'p39', name: "Lay's Kettle Cooked Sea Salt",    image_url: '', brand_id: 'b1',  category_id: 'cat1', subcategory: 'Potato Chips',     description: 'Extra crunchy kettle cooked chips with sea salt.',                                   barcode: '028400443715', price_range: '$',  size: '8 oz',    seed_tier: 'A', seed_score: 4.6, seed_source: 'aggregate' },

  // More Ice Cream
  { id: 'p40', name: "Ben & Jerry's Cookie Dough",      image_url: '', brand_id: 'b3',  category_id: 'cat3', subcategory: 'Pints',            description: 'Vanilla ice cream with chocolate chip cookie dough chunks.',                         barcode: '076840100385', price_range: '$$', size: '1 pint',  seed_tier: 'S', seed_score: 5.8, seed_source: 'aggregate' },
  { id: 'p41', name: "Ben & Jerry's Tonight Dough",     image_url: '', brand_id: 'b3',  category_id: 'cat3', subcategory: 'Pints',            description: 'Caramel & chocolate ice creams with cookie dough & peanut butter.',                  barcode: '076840100392', price_range: '$$', size: '1 pint',  seed_tier: 'S', seed_score: 5.5, seed_source: 'aggregate' },
  { id: 'p42', name: 'Häagen-Dazs Strawberry',          image_url: '', brand_id: 'b12', category_id: 'cat3', subcategory: 'Pints',            description: 'Sweet strawberry ice cream made with real strawberries.',                            barcode: '074570651276', price_range: '$$', size: '14 oz',   seed_tier: 'A', seed_score: 4.5, seed_source: 'aggregate' },
]

const insertProduct = db.prepare(`
  INSERT INTO products (id, name, image_url, brand_id, category_id, subcategory, description, barcode, price_range, size, seed_tier, seed_score, seed_source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const insertProductFts = db.prepare('INSERT INTO products_fts (rowid, name, brand_name, category, description) VALUES (?, ?, ?, ?, ?)')

for (let i = 0; i < products.length; i++) {
  const p = products[i]
  insertProduct.run(p.id, p.name, p.image_url, p.brand_id, p.category_id, p.subcategory, p.description, p.barcode, p.price_range, p.size, p.seed_tier, p.seed_score, p.seed_source)
  const brand = brands.find(b => b.id === p.brand_id)!
  const category = categories.find(c => c.id === p.category_id)!
  insertProductFts.run(i + 1, p.name, brand.name, category.name, p.description)
}

// ---- Product Images ----
const productImages = [
  { product_id: 'p3', images: ['https://images.unsplash.com/photo-1621447504864-d8686e12698c?auto=format&fit=crop&w=800&q=80'] },
  { product_id: 'p6', images: ['https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&q=80'] },
  { product_id: 'p9', images: ['https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=800&q=80'] },
  { product_id: 'p16', images: ['https://images.unsplash.com/photo-1534119428213-bd2626145164?auto=format&fit=crop&w=800&q=80'] },
  { product_id: 'p17', images: ['https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=800&q=80'] },
  { product_id: 'p24', images: ['https://images.unsplash.com/photo-1626806819282-2c1dc01a5e0c?auto=format&fit=crop&w=800&q=80'] },
  { product_id: 'p29', images: ['https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?auto=format&fit=crop&w=800&q=80'] },
  { product_id: 'p34', images: ['https://images.unsplash.com/photo-1472476443507-c7a5948772fc?auto=format&fit=crop&w=800&q=80'] },
  { product_id: 'p40', images: ['https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=800&q=80'] },
]

const insertProductImage = db.prepare('INSERT INTO product_images (id, product_id, image_url, sort_order) VALUES (?, ?, ?, ?)')
for (const pi of productImages) {
  for (let i = 0; i < pi.images.length; i++) {
    insertProductImage.run(uuid(), pi.product_id, pi.images[i], i)
  }
}

// ---- Ratings ----
const ratingData: { user_id: string; product_id: string; tier: string }[] = [
  // Doritos Nacho Cheese - S-tier consensus
  { user_id: 'u1', product_id: 'p3', tier: 'S' },
  { user_id: 'u2', product_id: 'p3', tier: 'S' },
  { user_id: 'u3', product_id: 'p3', tier: 'S' },
  { user_id: 'u4', product_id: 'p3', tier: 'A' },
  { user_id: 'u5', product_id: 'p3', tier: 'S' },
  { user_id: 'u7', product_id: 'p3', tier: 'S' },
  // Doritos Cool Ranch - also S-tier
  { user_id: 'u1', product_id: 'p4', tier: 'S' },
  { user_id: 'u2', product_id: 'p4', tier: 'S' },
  { user_id: 'u4', product_id: 'p4', tier: 'A' },
  { user_id: 'u5', product_id: 'p4', tier: 'S' },
  { user_id: 'u6', product_id: 'p4', tier: 'A' },
  // Oreo Original
  { user_id: 'u1', product_id: 'p6', tier: 'S' },
  { user_id: 'u2', product_id: 'p6', tier: 'S' },
  { user_id: 'u5', product_id: 'p6', tier: 'S' },
  { user_id: 'u7', product_id: 'p6', tier: 'A' },
  // Oreo Double Stuf
  { user_id: 'u1', product_id: 'p7', tier: 'S' },
  { user_id: 'u2', product_id: 'p7', tier: 'S' },
  { user_id: 'u5', product_id: 'p7', tier: 'S' },
  { user_id: 'u4', product_id: 'p7', tier: 'S' },
  { user_id: 'u7', product_id: 'p7', tier: 'A' },
  // Oreo Golden - mixed
  { user_id: 'u1', product_id: 'p8', tier: 'B' },
  { user_id: 'u5', product_id: 'p8', tier: 'C' },
  { user_id: 'u2', product_id: 'p8', tier: 'B' },
  // Ben & Jerry's Half Baked - S consensus
  { user_id: 'u1', product_id: 'p9', tier: 'S' },
  { user_id: 'u5', product_id: 'p9', tier: 'S' },
  { user_id: 'u7', product_id: 'p9', tier: 'S' },
  { user_id: 'u2', product_id: 'p9', tier: 'S' },
  { user_id: 'u4', product_id: 'p9', tier: 'A' },
  // Ben & Jerry's Cookie Dough - S consensus
  { user_id: 'u1', product_id: 'p40', tier: 'S' },
  { user_id: 'u5', product_id: 'p40', tier: 'S' },
  { user_id: 'u7', product_id: 'p40', tier: 'S' },
  { user_id: 'u2', product_id: 'p40', tier: 'A' },
  { user_id: 'u3', product_id: 'p40', tier: 'S' },
  // Reese's PB Cups - S consensus
  { user_id: 'u1', product_id: 'p16', tier: 'S' },
  { user_id: 'u2', product_id: 'p16', tier: 'S' },
  { user_id: 'u5', product_id: 'p16', tier: 'S' },
  { user_id: 'u4', product_id: 'p16', tier: 'S' },
  { user_id: 'u7', product_id: 'p16', tier: 'A' },
  { user_id: 'u3', product_id: 'p16', tier: 'S' },
  { user_id: 'u6', product_id: 'p16', tier: 'A' },
  // Coca-Cola Classic
  { user_id: 'u1', product_id: 'p17', tier: 'S' },
  { user_id: 'u2', product_id: 'p17', tier: 'A' },
  { user_id: 'u4', product_id: 'p17', tier: 'S' },
  { user_id: 'u5', product_id: 'p17', tier: 'A' },
  // Honey Nut Cheerios
  { user_id: 'u1', product_id: 'p22', tier: 'S' },
  { user_id: 'u2', product_id: 'p22', tier: 'S' },
  { user_id: 'u5', product_id: 'p22', tier: 'A' },
  { user_id: 'u6', product_id: 'p22', tier: 'S' },
  // Tide Original
  { user_id: 'u3', product_id: 'p24', tier: 'S' },
  { user_id: 'u4', product_id: 'p24', tier: 'S' },
  { user_id: 'u6', product_id: 'p24', tier: 'A' },
  // Tide PODS
  { user_id: 'u3', product_id: 'p25', tier: 'S' },
  { user_id: 'u4', product_id: 'p25', tier: 'A' },
  { user_id: 'u1', product_id: 'p25', tier: 'A' },
  // Cascade Platinum Plus
  { user_id: 'u3', product_id: 'p27', tier: 'S' },
  { user_id: 'u4', product_id: 'p27', tier: 'S' },
  { user_id: 'u6', product_id: 'p27', tier: 'S' },
  // Dove Beauty Bar
  { user_id: 'u3', product_id: 'p29', tier: 'S' },
  { user_id: 'u6', product_id: 'p29', tier: 'S' },
  { user_id: 'u1', product_id: 'p29', tier: 'A' },
  // Bounty Select-A-Size
  { user_id: 'u3', product_id: 'p32', tier: 'S' },
  { user_id: 'u4', product_id: 'p32', tier: 'A' },
  { user_id: 'u6', product_id: 'p32', tier: 'S' },
  // Heinz Ketchup
  { user_id: 'u1', product_id: 'p34', tier: 'S' },
  { user_id: 'u2', product_id: 'p34', tier: 'S' },
  { user_id: 'u4', product_id: 'p34', tier: 'S' },
  { user_id: 'u5', product_id: 'p34', tier: 'A' },
  // Sriracha
  { user_id: 'u1', product_id: 'p37', tier: 'S' },
  { user_id: 'u2', product_id: 'p37', tier: 'S' },
  { user_id: 'u4', product_id: 'p37', tier: 'S' },
  { user_id: 'u5', product_id: 'p37', tier: 'A' },
  { user_id: 'u7', product_id: 'p37', tier: 'S' },
  // Lay's Classic
  { user_id: 'u1', product_id: 'p1', tier: 'A' },
  { user_id: 'u2', product_id: 'p1', tier: 'A' },
  { user_id: 'u4', product_id: 'p1', tier: 'B' },
  // Häagen-Dazs Vanilla Bean
  { user_id: 'u5', product_id: 'p12', tier: 'S' },
  { user_id: 'u7', product_id: 'p12', tier: 'S' },
  { user_id: 'u1', product_id: 'p12', tier: 'A' },
  // Pepsi Original
  { user_id: 'u2', product_id: 'p19', tier: 'A' },
  { user_id: 'u4', product_id: 'p19', tier: 'B' },
  { user_id: 'u5', product_id: 'p19', tier: 'A' },
  // Hershey's Milk Chocolate
  { user_id: 'u1', product_id: 'p14', tier: 'B' },
  { user_id: 'u5', product_id: 'p14', tier: 'A' },
  { user_id: 'u7', product_id: 'p14', tier: 'B' },
]

const insertRating = db.prepare('INSERT INTO ratings (id, user_id, product_id, tier) VALUES (?, ?, ?, ?)')
for (const r of ratingData) {
  insertRating.run(uuid(), r.user_id, r.product_id, r.tier)
}

// ---- Reviews ----
const reviewData = [
  { user_id: 'u2', product_id: 'p3',  tier: 'S', text: 'Doritos Nacho Cheese is the GOAT of chips. Perfect crunch, perfect seasoning. Nothing else even comes close.' },
  { user_id: 'u5', product_id: 'p9',  tier: 'S', text: "Half Baked is the greatest ice cream ever created. The cookie dough chunks are massive and the brownie pieces are fudgy perfection." },
  { user_id: 'u1', product_id: 'p16', tier: 'S', text: "Reese's is the perfect marriage of peanut butter and chocolate. The ratio is absolutely nailed." },
  { user_id: 'u3', product_id: 'p24', tier: 'S', text: 'Tide Original just works. Nothing else gets stains out like it. Worth every penny over store brands.' },
  { user_id: 'u6', product_id: 'p29', tier: 'S', text: 'Dove Beauty Bar is life-changing for dry skin. It\'s not even soap, it\'s a beauty bar. My dermatologist recommends it.' },
  { user_id: 'u7', product_id: 'p40', tier: 'S', text: 'Cookie Dough is the best B&J flavor and I will die on this hill. Massive cookie dough chunks in perfect vanilla ice cream.' },
  { user_id: 'u1', product_id: 'p37', tier: 'S', text: 'Sriracha goes on literally everything. The garlic-chili combo is unmatched. My fridge always has a bottle.' },
  { user_id: 'u4', product_id: 'p34', tier: 'S', text: 'If it\'s not Heinz, it\'s not ketchup. Period. The consistency, the sweetness, the tang — perfection.' },
]

const insertReview = db.prepare('INSERT INTO reviews (id, user_id, product_id, tier, text) VALUES (?, ?, ?, ?, ?)')
for (const r of reviewData) {
  insertReview.run(uuid(), r.user_id, r.product_id, r.tier, r.text)
}

// ---- Follows ----
const followData = [
  { follower_id: 'u2', following_id: 'u1' },
  { follower_id: 'u3', following_id: 'u1' },
  { follower_id: 'u4', following_id: 'u1' },
  { follower_id: 'u5', following_id: 'u1' },
  { follower_id: 'u1', following_id: 'u3' },
  { follower_id: 'u1', following_id: 'u5' },
  { follower_id: 'u6', following_id: 'u1' },
  { follower_id: 'u7', following_id: 'u1' },
  { follower_id: 'u2', following_id: 'u5' },
  { follower_id: 'u3', following_id: 'u6' },
  { follower_id: 'u5', following_id: 'u7' },
]

const insertFollow = db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)')
for (const f of followData) {
  insertFollow.run(f.follower_id, f.following_id)
}

// ---- Favorites ----
const insertFav = db.prepare('INSERT INTO favorites (user_id, product_id) VALUES (?, ?)')
insertFav.run('u1', 'p3')
insertFav.run('u1', 'p9')
insertFav.run('u1', 'p16')
insertFav.run('u5', 'p40')
insertFav.run('u5', 'p7')
insertFav.run('u3', 'p24')

// ---- Tier Lists ----
const insertTierList = db.prepare('INSERT INTO tier_lists (id, user_id, title, category, is_public) VALUES (?, ?, ?, ?, ?)')
insertTierList.run('tl1', 'u1', 'Best Chips of All Time', 'Chips & Snacks', 1)
insertTierList.run('tl2', 'u5', 'Ultimate Ice Cream Rankings', 'Ice Cream & Frozen', 1)
insertTierList.run('tl3', 'u3', 'Cleaning Product Showdown', 'Cleaning & Household', 1)

const insertTierListItem = db.prepare('INSERT INTO tier_list_items (id, tier_list_id, product_id, tier, sort_order) VALUES (?, ?, ?, ?, ?)')
// Best Chips tier list
insertTierListItem.run(uuid(), 'tl1', 'p4', 'S', 0)
insertTierListItem.run(uuid(), 'tl1', 'p3', 'S', 1)
insertTierListItem.run(uuid(), 'tl1', 'p5', 'A', 0)
insertTierListItem.run(uuid(), 'tl1', 'p1', 'A', 1)
insertTierListItem.run(uuid(), 'tl1', 'p2', 'A', 2)
// Ultimate Ice Cream tier list
insertTierListItem.run(uuid(), 'tl2', 'p40', 'S', 0)
insertTierListItem.run(uuid(), 'tl2', 'p9', 'S', 1)
insertTierListItem.run(uuid(), 'tl2', 'p12', 'S', 2)
insertTierListItem.run(uuid(), 'tl2', 'p41', 'A', 0)
insertTierListItem.run(uuid(), 'tl2', 'p11', 'A', 1)
insertTierListItem.run(uuid(), 'tl2', 'p10', 'B', 0)
// Cleaning Product tier list
insertTierListItem.run(uuid(), 'tl3', 'p24', 'S', 0)
insertTierListItem.run(uuid(), 'tl3', 'p27', 'S', 1)
insertTierListItem.run(uuid(), 'tl3', 'p25', 'A', 0)
insertTierListItem.run(uuid(), 'tl3', 'p26', 'A', 1)
insertTierListItem.run(uuid(), 'tl3', 'p28', 'B', 0)

// ---- Category Preferences ----
const insertPref = db.prepare('INSERT INTO user_category_prefs (user_id, category_id) VALUES (?, ?)')
insertPref.run('u1', 'cat1')
insertPref.run('u1', 'cat3')
insertPref.run('u1', 'cat4')
insertPref.run('u2', 'cat1')
insertPref.run('u3', 'cat7')
insertPref.run('u3', 'cat8')
insertPref.run('u5', 'cat3')
insertPref.run('u5', 'cat4')
insertPref.run('u5', 'cat2')
insertPref.run('u6', 'cat7')
insertPref.run('u6', 'cat8')
insertPref.run('u7', 'cat3')

// ---- Activity Feed ----
const insertActivity = db.prepare('INSERT INTO activity (id, user_id, type, target_id, target_name, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
insertActivity.run(uuid(), 'u1', 'rating', 'p3', 'Doritos Nacho Cheese', '{"tier":"S"}', '2026-03-15 10:00:00')
insertActivity.run(uuid(), 'u5', 'rating', 'p40', "Ben & Jerry's Cookie Dough", '{"tier":"S"}', '2026-03-15 09:30:00')
insertActivity.run(uuid(), 'u2', 'review', 'p3', 'Doritos Nacho Cheese', '{"tier":"S"}', '2026-03-14 18:00:00')
insertActivity.run(uuid(), 'u3', 'rating', 'p24', 'Tide Original Liquid', '{"tier":"S"}', '2026-03-14 14:00:00')
insertActivity.run(uuid(), 'u1', 'review', 'p16', "Reese's Peanut Butter Cups", '{"tier":"S"}', '2026-03-13 20:00:00')
insertActivity.run(uuid(), 'u1', 'tier_list', 'tl1', 'Best Chips of All Time', '{}', '2026-03-12 16:00:00')
insertActivity.run(uuid(), 'u6', 'follow', 'u1', 'SnackQueen', '{}', '2026-03-12 12:00:00')
insertActivity.run(uuid(), 'u7', 'review', 'p40', "Ben & Jerry's Cookie Dough", '{"tier":"S"}', '2026-03-11 15:00:00')
insertActivity.run(uuid(), 'u4', 'rating', 'p34', 'Heinz Tomato Ketchup', '{"tier":"S"}', '2026-03-11 10:00:00')
insertActivity.run(uuid(), 'u3', 'try', 'p27', 'Cascade Platinum Plus', '{}', '2026-03-10 09:00:00')

// ---- Product Labels ----
const insertLabel = db.prepare('INSERT INTO product_labels (id, user_id, product_id, label) VALUES (?, ?, ?, ?)')
const labelData = [
  // Doritos Nacho Cheese
  { user_id: 'u1', product_id: 'p3', label: 'Most Popular' },
  { user_id: 'u2', product_id: 'p3', label: 'Most Popular' },
  { user_id: 'u5', product_id: 'p3', label: 'Most Popular' },
  { user_id: 'u1', product_id: 'p3', label: 'Most Addictive' },
  { user_id: 'u4', product_id: 'p3', label: 'Most Addictive' },
  { user_id: 'u2', product_id: 'p3', label: 'Must Try' },
  // Doritos Cool Ranch
  { user_id: 'u1', product_id: 'p4', label: 'Best Flavor' },
  { user_id: 'u2', product_id: 'p4', label: 'Best Flavor' },
  { user_id: 'u5', product_id: 'p4', label: 'Must Try' },
  // Oreo Double Stuf
  { user_id: 'u1', product_id: 'p7', label: 'Most Addictive' },
  { user_id: 'u5', product_id: 'p7', label: 'Most Addictive' },
  { user_id: 'u2', product_id: 'p7', label: 'Guilty Pleasure' },
  // Ben & Jerry's Half Baked
  { user_id: 'u5', product_id: 'p9', label: 'Best Flavor' },
  { user_id: 'u7', product_id: 'p9', label: 'Best Flavor' },
  { user_id: 'u1', product_id: 'p9', label: 'Must Try' },
  // Ben & Jerry's Cookie Dough
  { user_id: 'u5', product_id: 'p40', label: 'Most Addictive' },
  { user_id: 'u7', product_id: 'p40', label: 'Most Addictive' },
  { user_id: 'u1', product_id: 'p40', label: 'Best Flavor' },
  { user_id: 'u2', product_id: 'p40', label: 'Best Flavor' },
  // Reese's PB Cups
  { user_id: 'u1', product_id: 'p16', label: 'Most Popular' },
  { user_id: 'u2', product_id: 'p16', label: 'Most Popular' },
  { user_id: 'u5', product_id: 'p16', label: 'Guilty Pleasure' },
  { user_id: 'u4', product_id: 'p16', label: 'Must Try' },
  // Tide Original
  { user_id: 'u3', product_id: 'p24', label: 'Most Popular' },
  { user_id: 'u4', product_id: 'p24', label: 'Most Popular' },
  { user_id: 'u6', product_id: 'p24', label: 'Best Value' },
  // Heinz Ketchup
  { user_id: 'u1', product_id: 'p34', label: 'Most Popular' },
  { user_id: 'u2', product_id: 'p34', label: 'Most Popular' },
  { user_id: 'u4', product_id: 'p34', label: 'Must Try' },
  // Sriracha
  { user_id: 'u1', product_id: 'p37', label: 'Most Addictive' },
  { user_id: 'u2', product_id: 'p37', label: 'Most Addictive' },
  { user_id: 'u7', product_id: 'p37', label: 'Best Flavor' },
  // Dove Beauty Bar
  { user_id: 'u3', product_id: 'p29', label: 'Best Value' },
  { user_id: 'u6', product_id: 'p29', label: 'Best Value' },
  { user_id: 'u6', product_id: 'p29', label: 'Healthy Pick' },
  // Cascade Platinum Plus
  { user_id: 'u3', product_id: 'p27', label: 'Best Value' },
  { user_id: 'u4', product_id: 'p27', label: 'Must Try' },
  // Bounty Select-A-Size
  { user_id: 'u3', product_id: 'p32', label: 'Best Value' },
  { user_id: 'u6', product_id: 'p32', label: 'Most Popular' },
  // Honey Nut Cheerios
  { user_id: 'u1', product_id: 'p22', label: 'Best Flavor' },
  { user_id: 'u6', product_id: 'p22', label: 'Healthy Pick' },
  // Lay's Classic
  { user_id: 'u2', product_id: 'p1', label: 'Best for Sharing' },
  { user_id: 'u1', product_id: 'p1', label: 'Underrated' },
  // Coca-Cola Classic
  { user_id: 'u1', product_id: 'p17', label: 'Most Popular' },
  { user_id: 'u4', product_id: 'p17', label: 'Most Popular' },
  // Häagen-Dazs Vanilla Bean
  { user_id: 'u5', product_id: 'p12', label: 'Best Texture' },
  { user_id: 'u7', product_id: 'p12', label: 'Best Flavor' },
  // Oreo Golden - Overrated
  { user_id: 'u1', product_id: 'p8', label: 'Overrated' },
  { user_id: 'u5', product_id: 'p8', label: 'Overrated' },
]

for (const l of labelData) {
  insertLabel.run(uuid(), l.user_id, l.product_id, l.label)
}

// ---- Tries (food diary equivalent) ----
const insertTry = db.prepare('INSERT INTO tries (id, user_id, product_id, photo_url, notes) VALUES (?, ?, ?, ?, ?)')
insertTry.run(uuid(), 'u1', 'p3', '', 'Family size bag gone in one sitting. No regrets.')
insertTry.run(uuid(), 'u1', 'p9', '', 'Perfect late night snack pint.')
insertTry.run(uuid(), 'u5', 'p40', '', 'The cookie dough chunks are massive this batch!')
insertTry.run(uuid(), 'u3', 'p24', '', 'Got grass stains out of white shorts. Miracle.')
insertTry.run(uuid(), 'u3', 'p27', '', 'Sparkling clean even on the dried-on pasta sauce.')
insertTry.run(uuid(), 'u2', 'p4', '', 'Cool Ranch supremacy.')
insertTry.run(uuid(), 'u7', 'p12', '', 'Simple but elite. Real vanilla bean specks visible.')

console.log('Database seeded successfully!')
console.log(`  ${categories.length} categories`)
console.log(`  ${users.length} users`)
console.log(`  ${brands.length} brands`)
console.log(`  ${products.length} products`)
console.log(`  ${ratingData.length} ratings`)
console.log(`  ${reviewData.length} reviews`)
console.log(`  ${followData.length} follows`)
console.log(`  ${labelData.length} product labels`)
