'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'destinations.json');

let cache = null;

function loadAll() {
  if (!cache) {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    cache = JSON.parse(raw).destinations;
  }
  return cache;
}

function getById(id) {
  return loadAll().find(d => d.id === id) || null;
}

module.exports = { loadAll, getById };
