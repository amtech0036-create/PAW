const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const mongoose = require('mongoose');
const Transaction = require('../src/models/Transaction');

describe('Transaction model validation (PRD sections 12/43)', () => {
  const userId = new mongoose.Types.ObjectId();
  const categoryId = new mongoose.Types.ObjectId();
  const validDate = new Date('2026-10-04T00:00:00Z');

  function baseDoc(overrides = {}) {
    return {
      userId,
      type: 'expense',
      amount: 500,
      categoryId,
      date: validDate,
      ...overrides,
    };
  }

  it('accepts a valid income transaction', () => {
    const doc = new Transaction(baseDoc({ type: 'income', amount: 25000 }));
    const err = doc.validateSync();
    assert.equal(err, undefined);
    assert.equal(doc.amount, 25000); // stored positive
  });

  it('accepts a valid expense transaction with positive amount', () => {
    const doc = new Transaction(baseDoc());
    const err = doc.validateSync();
    assert.equal(err, undefined);
    assert.equal(doc.amount, 500); // NOT -500 (PRD section 12)
  });

  it('rejects amount = 0', () => {
    const doc = new Transaction(baseDoc({ amount: 0 }));
    const err = doc.validateSync();
    assert.ok(err);
    assert.match(String(err.errors.amount), /greater than 0/);
  });

  it('rejects negative amount', () => {
    const doc = new Transaction(baseDoc({ amount: -500 }));
    const err = doc.validateSync();
    assert.ok(err);
    assert.ok(err.errors.amount || err.errors._mongooseServerError);
  });

  it('rejects non-numeric amount', () => {
    const doc = new Transaction(baseDoc({ amount: 'abc' }));
    const err = doc.validateSync();
    assert.ok(err && err.errors.amount);
  });

  it('rejects missing type', () => {
    const doc = new Transaction(baseDoc({ type: undefined }));
    const err = doc.validateSync();
    assert.ok(err && err.errors.type);
  });

  it('rejects invalid type value', () => {
    const doc = new Transaction(baseDoc({ type: 'transfer' }));
    const err = doc.validateSync();
    assert.ok(err && err.errors.type);
  });

  it('rejects missing date', () => {
    const doc = new Transaction(baseDoc({ date: undefined }));
    const err = doc.validateSync();
    assert.ok(err && err.errors.date);
  });

  it('rejects missing category', () => {
    const doc = new Transaction(baseDoc({ categoryId: undefined }));
    const err = doc.validateSync();
    assert.ok(err && err.errors.categoryId);
  });
});
