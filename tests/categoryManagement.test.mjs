import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryOptionLabel, resolveCategoryOption, categoryErrorMessage, configurationTitle } from '../src/lib/categoryOptions.ts';
import { createCategory, updateCategory, deleteCategory, getCategories } from '../src/services/categoryService.ts';
import { mockApi, calls } from './mockApiClient.mjs';

const categories = [{ _id: '1', name: 'Menu Cards', slug: 'menu-cards', isActive: true }, { _id: '2', name: 'Menu Cards', slug: 'menu-cards-1', isActive: true }];
test('duplicate names stay distinct and ambiguous names cannot assign a product', () => {
  assert.equal(resolveCategoryOption('Menu Cards', categories), null);
  for (const category of categories) {
    assert.equal(resolveCategoryOption(categoryOptionLabel(category), categories), category._id);
    assert.equal(resolveCategoryOption(category._id, categories), category._id);
  }
});
test('category families resolve slugs, aliases and parent IDs', () => {
  assert.equal(configurationTitle({ name: 'Premium', slug: 'standee-premium' }), 'Standee Configuration');
  assert.equal(configurationTitle({ name: 'Child', parentCategory: '1' }, categories), 'Menu Card Configuration');
  assert.equal(configurationTitle({ name: 'Cards', aliases: ['business cards'] }), 'Visiting Card Configuration');
  assert.equal(configurationTitle({ _id: '1', name: 'Other', parent: '1' }, [{ _id: '1', name: 'Other', parent: '1' }]), 'Product Configuration');
});
test('create, delete, recreate same name and edit/delete a specific duplicate by ID', async () => {
  const records = [];
  mockApi((method, url, payload) => {
    if (method === 'get') return { data: { categories: records } };
    if (method === 'post') { const entry = { _id: String(calls.length), name: payload.get('name') }; records.push(entry); return { data: entry }; }
    if (method === 'delete') { const index = records.findIndex((record) => url.endsWith(`/${record._id}`)); records.splice(index, 1); return { data: { success: true } }; }
    return { data: { success: true } };
  });
  const payload = { name: 'Menu Cards', isActive: true };
  const first = await createCategory(payload); await deleteCategory(first._id);
  const second = await createCategory(payload); const third = await createCategory(payload);
  assert.equal(records.length, 2); assert.notEqual(second._id, third._id);
  assert.equal(calls[0].args[1].has('slug'), false);
  await updateCategory(third._id, { name: 'Menu Cards' }); assert.equal(calls.at(-1).args[0], `/admin/categories/${third._id}`);
  await deleteCategory(second._id); assert.equal((await getCategories())[0]._id, third._id);
});
test('backend duplicate-key failures are actionable and rejected responses cannot appear successful', async () => {
  assert.match(categoryErrorMessage({ response: { data: { message: 'E11000 index: name_1' } } }, 'Failed'), /remove any old unique index/);
  mockApi(() => ({ data: { success: false, message: 'E11000 index: name_1' } }));
  await assert.rejects(createCategory({ name: 'Menu Cards', isActive: true }), /E11000/);
  await assert.rejects(updateCategory('2', { name: 'Menu Cards' }), /E11000/);
  await assert.rejects(deleteCategory('2'), /E11000/);
});
