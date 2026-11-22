import dotenv from 'dotenv';
dotenv.config();
if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
if(process.env.SEED_ALLOW_RESET!=='true'||!process.env.SEED_DATABASE_NAME||!/(?:demo|test)/i.test(process.env.SEED_DATABASE_NAME))throw new Error('Seeding requires explicit reset approval and a named demo/test database.');
for(const key of ['SEED_ADMIN_PASSWORD','SEED_CUSTOMER_PASSWORD'])if(typeof process.env[key]!=='string'||process.env[key].length<12||Buffer.byteLength(process.env[key])>72)throw new Error('Configure strong demo passwords before running seed.');

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Category from '../models/Category.js';
import Dish from '../models/Dish.js';
import Banner from '../models/Banner.js';
import Review from '../models/Review.js';
import PromoCode from '../models/PromoCode.js';
import Notification from '../models/Notification.js';

const seedData = async () => {
  try {
    await connectDB();
    if(mongoose.connection.name!==process.env.SEED_DATABASE_NAME)throw new Error('Connected database does not match the approved demo/test database.');

    console.log('🔄 Connecting to MongoDB Atlas & Clearing existing collections...');
    await User.deleteMany();
    await Category.deleteMany();
    await Dish.deleteMany();
    await Banner.deleteMany();
    await Review.deleteMany();
    await PromoCode.deleteMany();
    await Notification.deleteMany();

    console.log('1. Seeding Users (Admin & Customer)...');
    const adminUser = await User.create({
      name: 'Demo Admin',
      email: process.env.SEED_ADMIN_EMAIL || 'admin@example.test',
      password: process.env.SEED_ADMIN_PASSWORD,
      role: 'admin',
      phone: '',
      address: 'Zaykora Royal Kitchen, Suite 101',
    });

    const customerUser = await User.create({
      name: 'Demo Customer',
      email: process.env.SEED_CUSTOMER_EMAIL || 'customer@example.test',
      password: process.env.SEED_CUSTOMER_PASSWORD,
      role: 'user',
      phone: '',
      address: '',
    });

    console.log('2. Seeding Categories...');
    const categoryDocs = await Category.insertMany([
      { name: 'Pizza', image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600' },
      { name: 'Burgers', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600' },
      { name: 'Pasta', image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281292?w=600' },
      { name: 'Chicken', image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=600' },
      { name: 'Desserts', image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600' },
      { name: 'Drinks', image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600' },
    ]);

    // Map category name to its MongoDB ObjectId
    const categoryMap = {};
    categoryDocs.forEach((cat) => {
      categoryMap[cat.name] = cat._id;
    });

    console.log('3. Seeding Dishes with Category Relations (6 Popular Dishes Included)...');
    const dishesData = [
      // 1. Popular Dish 1
      {
        name: 'Classic Margherita',
        category: categoryMap['Pizza'],
        price: 1299,
        oldPrice: 1499,
        rating: 4.8,
        numReviews: 14,
        image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
        cloudinaryPublicId: 'seed_dish_1',
        description: 'Fresh mozzarella, Italian sun-ripened tomatoes, extra virgin olive oil & fragrant basil on a stone-baked crust.',
        popular: true,
        special: false,
        prepTime: '20-25 min',
        calories: '650 kcal',
        isVeg: true,
        spicyLevel: 'None',
        variants: [
          { name: 'Regular (10")', price: 1299 },
          { name: 'Large (14")', price: 1799 },
          { name: 'Jumbo (16")', price: 2299 },
        ],
        addons: [
          { name: 'Extra Mozzarella Cheese', price: 200 },
          { name: 'Stuffed Garlic Crust', price: 250 },
          { name: 'Signature Dipping Sauce', price: 80 },
        ],
      },
      // 2. Popular Dish 2
      {
        name: 'Crispy Chicken Burger',
        category: categoryMap['Burgers'],
        price: 899,
        oldPrice: 999,
        rating: 4.7,
        numReviews: 9,
        image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',
        cloudinaryPublicId: 'seed_dish_2',
        description: 'Golden fried chicken breast fillet with crisp lettuce, pickled gherkins, melted cheddar & secret house garlic mayo.',
        popular: true,
        special: false,
        prepTime: '15-20 min',
        calories: '580 kcal',
        isVeg: false,
        spicyLevel: 'Medium',
        variants: [
          { name: 'Single Fillet Burger', price: 899 },
          { name: 'Double Fillet Monster', price: 1249 },
        ],
        addons: [
          { name: 'Extra Cheddar Slice', price: 100 },
          { name: 'Crispy Turkey Bacon', price: 180 },
          { name: 'Truffle Fries & Drink Combo', price: 350 },
        ],
      },
      // 3. Popular Dish 3
      {
        name: 'Creamy Alfredo Pasta',
        category: categoryMap['Pasta'],
        price: 1099,
        rating: 4.9,
        numReviews: 21,
        image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281292?w=800',
        cloudinaryPublicId: 'seed_dish_3',
        description: 'Fettuccine tossed in a rich, velvety parmesan and garlic cream sauce with fresh herbs and cracked black pepper.',
        popular: true,
        special: false,
        prepTime: '20-25 min',
        calories: '720 kcal',
        isVeg: true,
        spicyLevel: 'None',
        variants: [
          { name: 'Regular Serving', price: 1099 },
          { name: 'Family Sharing Bowl', price: 1999 },
        ],
        addons: [
          { name: 'Grilled Herb Chicken Strips', price: 250 },
          { name: 'Parmesan Shavings', price: 120 },
          { name: 'Garlic Butter Toast (2 pcs)', price: 100 },
        ],
      },
      // 4. Popular Dish 4
      {
        name: 'Double Cheese Burger',
        category: categoryMap['Burgers'],
        price: 1199,
        rating: 4.8,
        numReviews: 12,
        image: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=800',
        cloudinaryPublicId: 'seed_dish_5',
        description: 'Two smashed beef patties, double Monterey Jack cheese, caramelized onions, crisp pickles & smoky barbecue sauce.',
        popular: true,
        special: false,
        prepTime: '15-20 min',
        calories: '840 kcal',
        isVeg: false,
        spicyLevel: 'Mild',
        variants: [
          { name: 'Double Patty (150g)', price: 1199 },
          { name: 'Triple Smashed Beast', price: 1599 },
        ],
        addons: [
          { name: 'Caramelized Mushrooms', price: 120 },
          { name: 'Extra Melted Monterey Jack', price: 150 },
          { name: 'Smoky Chipotle Mayo', price: 70 },
        ],
      },
      // 5. Popular Dish 5
      {
        name: 'Pepperoni Supreme Pizza',
        category: categoryMap['Pizza'],
        price: 1599,
        oldPrice: 1799,
        rating: 4.9,
        numReviews: 35,
        image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800',
        cloudinaryPublicId: 'seed_dish_6',
        description: 'Loaded spicy beef pepperoni, whole-milk mozzarella cheese, and signature herb tomato sauce on handcrafted dough.',
        popular: true,
        special: true,
        prepTime: '20-25 min',
        calories: '780 kcal',
        isVeg: false,
        spicyLevel: 'Hot',
        variants: [
          { name: 'Regular (10")', price: 1599 },
          { name: 'Large (14")', price: 2199 },
          { name: 'Jumbo (16")', price: 2699 },
        ],
        addons: [
          { name: 'Double Loaded Pepperoni', price: 250 },
          { name: 'Spicy Honey Drizzle', price: 100 },
          { name: 'Cheesy Garlic Dipping Pot', price: 90 },
        ],
      },
      // 6. Popular Dish 6
      {
        name: 'Royal Mint Lemonade',
        category: categoryMap['Drinks'],
        price: 299,
        rating: 4.8,
        numReviews: 6,
        image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800',
        cloudinaryPublicId: 'seed_dish_8',
        description: 'Crisp crushed ice, garden-fresh mint sprigs, organic Persian lemon juice, and pure cane sugar syrup.',
        popular: true,
        special: false,
        prepTime: '5-10 min',
        calories: '120 kcal',
        isVeg: true,
        spicyLevel: 'None',
        variants: [
          { name: 'Glass (350ml)', price: 299 },
          { name: 'Pitcher (1 Litre)', price: 749 },
        ],
        addons: [
          { name: 'Extra Mint Sprigs & Lemon', price: 40 },
          { name: 'Chia Seeds Boost', price: 60 },
        ],
      },
      // 7. Chef Special 1
      {
        name: 'Grilled Herb Chicken',
        category: categoryMap['Chicken'],
        price: 1499,
        oldPrice: 1699,
        rating: 4.6,
        numReviews: 8,
        image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=800',
        cloudinaryPublicId: 'seed_dish_4',
        description: 'Tender fire-grilled chicken breast marinated in rosemary, garlic butter, and fresh lemon, served with roasted veggies.',
        popular: false,
        special: true,
        prepTime: '25-30 min',
        calories: '520 kcal',
        isVeg: false,
        spicyLevel: 'Mild',
        variants: [
          { name: 'Half Grilled Breast', price: 1499 },
          { name: 'Full Double Breast Platter', price: 2199 },
        ],
        addons: [
          { name: 'Mushroom Pepper Sauce', price: 150 },
          { name: 'Mashed Potato Gravy', price: 140 },
        ],
      },
      // 8. Chef Special 2
      {
        name: 'Chocolate Lava Brownie',
        category: categoryMap['Desserts'],
        price: 499,
        oldPrice: 599,
        rating: 4.7,
        numReviews: 18,
        image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800',
        cloudinaryPublicId: 'seed_dish_7',
        description: 'Warm Belgian dark chocolate fudge brownie with a molten center, dusted with Dutch cocoa and sea salt flakes.',
        popular: false,
        special: true,
        prepTime: '10-15 min',
        calories: '450 kcal',
        isVeg: true,
        spicyLevel: 'None',
        variants: [
          { name: 'Single Warm Brownie', price: 499 },
          { name: 'Double Brownie Stack', price: 899 },
        ],
        addons: [
          { name: 'Vanilla Bean Gelato Scoop', price: 150 },
          { name: 'Warm Belgian Chocolate Drizzle', price: 90 },
        ],
      },
      // 9. Chef Special 3
      {
        name: 'Zaykora Royal Platter',
        category: categoryMap['Chicken'],
        price: 1899,
        oldPrice: 2199,
        rating: 4.9,
        numReviews: 42,
        image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800',
        cloudinaryPublicId: 'seed_dish_9',
        description: "Chef's signature combo: herb-crusted chicken skewers, garlic butter wings, truffle potato wedges, and dipping sauces.",
        popular: false,
        special: true,
        prepTime: '30-35 min',
        calories: '980 kcal',
        isVeg: false,
        spicyLevel: 'Medium',
        variants: [
          { name: 'Royal Feast (2 Persons)', price: 1899 },
          { name: 'Sultan Platter (4 Persons)', price: 3499 },
        ],
        addons: [
          { name: 'Extra 4 BBQ Wings', price: 299 },
          { name: 'House Garlic Aioli Trio', price: 120 },
        ],
      },
      // 10. Starter / Side
      {
        name: 'Golden Truffle Fries',
        category: categoryMap['Burgers'],
        price: 399,
        rating: 4.6,
        numReviews: 15,
        image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800',
        cloudinaryPublicId: 'seed_dish_10',
        description: 'Double-fried hand-cut russet potatoes seasoned with smoked paprika, sea salt, and served with garlic truffle aioli.',
        popular: false,
        special: false,
        prepTime: '10-15 min',
        calories: '340 kcal',
        isVeg: true,
        spicyLevel: 'None',
        variants: [
          { name: 'Regular Basket', price: 399 },
          { name: 'Mega Truffle Bucket', price: 699 },
        ],
        addons: [
          { name: 'Liquid Nacho Cheese', price: 120 },
          { name: 'Jalapeno Slices', price: 60 },
        ],
      },
    ];

    const seededDishes = await Dish.insertMany(dishesData);

    console.log('4. Seeding Promotional Banners...');
    const bannerDocs = await Banner.insertMany([
      {
        title: 'ROYAL FEAST SALE',
        subtitle: 'Experience authentic stone-baked pizzas & gourmet burgers',
        discountText: 'UP TO 25% OFF',
        buttonText: 'Order Now',
        link: '/menu',
        image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
        cloudinaryPublicId: 'seed_banner_1',
        isActive: true,
      },
      {
        title: 'MIDNIGHT CRAVINGS',
        subtitle: 'Free delivery on orders above Rs. 2000 after 10 PM',
        discountText: 'FREE DELIVERY',
        buttonText: 'Explore Delicacies',
        link: '/menu',
        image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',
        cloudinaryPublicId: 'seed_banner_2',
        isActive: true,
      },
      {
        title: "CHEF'S SIGNATURE SPECIALS",
        subtitle: 'Hand-crafted artisanal pasta, lava brownies & platters',
        discountText: 'SPECIAL CHEF MENU',
        buttonText: 'Taste Luxury',
        link: '/menu',
        image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800',
        cloudinaryPublicId: 'seed_banner_3',
        isActive: true,
      },
    ]);

    console.log('5. Seeding Sample Customer Reviews...');
    await Review.insertMany([
      {
        dish: seededDishes[0]._id,
        user: customerUser._id,
        userName: customerUser.name,
        rating: 5,
        comment: 'Absolutely divine pizza! The crust was crispy and cheese was so fresh.',
      },
      {
        dish: seededDishes[1]._id,
        user: customerUser._id,
        userName: customerUser.name,
        rating: 5,
        comment: 'Best crispy chicken burger in town. Sauce has great flavor.',
      },
      {
        dish: seededDishes[2]._id,
        user: customerUser._id,
        userName: customerUser.name,
        rating: 5,
        comment: 'Creamy and velvety pasta. Real parmesan texture.',
      },
    ]);

    console.log('6. Seeding Offers & Promo Codes...');
    await PromoCode.insertMany([
      {
        code: 'ROYAL20',
        title: '20% Royal Dining Voucher',
        discountType: 'percentage',
        discountValue: 20,
        minOrderAmount: 0,
        maxDiscount: 1000,
        isActive: true,
      },
      {
        code: 'ZAYKORA500',
        title: 'Rs. 500 Flat Celebration Discount',
        discountType: 'fixed',
        discountValue: 500,
        minOrderAmount: 1500,
        isActive: true,
      },
      {
        code: 'FREEDELIVERY',
        title: 'Royal Complimentary Delivery',
        discountType: 'freeDelivery',
        discountValue: 0,
        minOrderAmount: 0,
        isActive: true,
      },
    ]);

    console.log('7. Seeding Initial System Notifications...');
    await Notification.create({
      title: 'Royal Kitchen System Ready 🚀',
      message: 'Zaykora single-restaurant operations and dispatch system are fully active.',
      type: 'system',
      recipientRole: 'admin',
    });

    console.log('\n======================================================');
    console.log('🎉 MongoDB Atlas Seeding Ready!');
    console.log(`- Categories Seeded: ${categoryDocs.length}`);
    console.log(`- Total Dishes Seeded: ${seededDishes.length}`);
    console.log(`- 🔥 Popular Dishes Count: ${popularCount} (Verified 6 popular dishes)`);
    console.log(`- Banners Seeded: ${bannerDocs.length}`);
    console.log('Demo administrator created; credentials omitted.');
    console.log('Demo customer created; credentials omitted.');
    console.log('======================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error.code || error.name);
    process.exit(1);
  }
};

seedData();
