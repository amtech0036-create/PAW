/**
 * Phase 2 integration tests against a real mongod binary
 * (mongodb-memory-server). Verifies connection, indexes, unique
 * constraints, and seeding.
 *
 * PRD Phase 2: "Test MongoDB connection."
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.MONGODB_URI = 'mongodb://127.0.0.1:0/fake-for-test'; // overwritten by memory server

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const Transaction = require('../src/models/Transaction');
const Category = require('../src/models/Category');
const Settings = require('../src/models/Settings');
const { ensureIndexes, seedDefaultCategories, DEFAULT_INCOME_CATEGORIES, DEFAULT_EXPENSE_CATEGORIES } = require('../src/models');

let mongod;

before(async () => {
  mongod = await MongoMemoryServer.create({
    instance: { ip: '127.0.0.1' },
  });
  await mongoose.connect(mongod.getUri('personal_finance_test'), {
    serverSelectionTimeoutMS: 10000,
  });
  await ensureIndexes();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('MongoDB connection (Phase 2)', () => {
  it('connects to a real mongod and stays connected', () => {
    assert.equal(mongoose.connection.readyState, 1);
  });
});

describe('Indexes and constraints (PRD section 50)', () => {
  it('rejects duplicate user email via unique index', async () => {
    const User = require('../src/models/User');
    const doc = { name: 'Anim', email: 'dup@example.com', passwordHash: 'x' };
    await User.create(doc);
    await assert.rejects(() => User.create({ ...doc, name: 'Copy' }), /duplicate key|E11000/i);
    await User.deleteMany({});
  });

  it('rejects duplicate category name per user+type', async () => {
    const userId = new mongoose.Types.ObjectId();
    await Category.create({ userId, name: 'Food', type: 'expense' });
    await assert.rejects(
      () => Category.create({ userId, name: 'Food', type: 'expense' }),
      /duplicate key|E11000/i
    );
    // Same name but different type is allowed.
    await Category.create({ userId, name: 'Business', type: 'income' });
    await Category.create({ userId, name: 'Business', type: 'expense' });
    await Category.deleteMany({});
  });

  it('enforces one settings document per user (unique userId)', async () => {
    const userId = new mongoose.Types.ObjectId();
    await Settings.create({ userId, openingBalance: 30000 });
    await assert.rejects(() => Settings.create({ userId, openingBalance: 1 }), /duplicate key|E11000/i);
    await Settings.deleteMany({});
  });

  it('transaction query indexes exist', async () => {
    const indexes = await Transaction.collection.getIndexes({ full: false });

    // Normalize across driver shapes:
    //   driver v6: { name: [[field, dir], ...] }
    //   other:     { name: { field: dir, ... } }
    const keySpecs = Object.values(indexes).map((spec) => {
      if (spec && !Array.isArray(spec) && spec.key) return spec.key;
      return Object.fromEntries(spec.map(([field, dir]) => [field, dir]));
    });

    const has = (keys) =>
      keySpecs.some((k) => JSON.stringify(k) === JSON.stringify(keys));

    assert.ok(has({ userId: 1, date: -1 }), 'missing {userId, date:-1} index');
    assert.ok(
      has({ userId: 1, type: 1, date: -1 }),
      'missing {userId, type, date:-1} index'
    );
  });
});

describe('Default category seeding (PRD sections 15-16)', () => {
  it('seeds 10 income + 15 expense default categories (incl. Opening Balance, Phase 5)', async () => {
    const userId = new mongoose.Types.ObjectId();
    const inserted = await seedDefaultCategories(userId);

    assert.equal(DEFAULT_INCOME_CATEGORIES.length, 10);
    assert.equal(DEFAULT_EXPENSE_CATEGORIES.length, 15);
    assert.equal(inserted.length, 25);
    assert.equal(await Category.countDocuments({ userId, type: 'income' }), 10);
    assert.equal(await Category.countDocuments({ userId, type: 'expense' }), 15);

    const amTech = await Category.findOne({ userId, name: 'A&M Tech Solutions' });
    assert.ok(amTech, 'A&M Tech Solutions category missing');
    assert.equal(amTech.type, 'income');

    const openingCat = await Category.findOne({ userId, name: 'Opening Balance' });
    assert.ok(openingCat, "built-in 'Opening Balance' category missing (Phase 5)");
    assert.equal(openingCat.type, 'income');

    await Category.deleteMany({ userId });
  });
});
