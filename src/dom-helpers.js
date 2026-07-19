'use strict';

function normalizeTextList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function summarizeTextList(value, limit) {
  const items = normalizeTextList(value);
  return {
    count: items.length,
    items: items.slice(0, typeof limit === 'number' ? limit : 10)
  };
}

module.exports = {
  normalizeTextList,
  summarizeTextList
};
