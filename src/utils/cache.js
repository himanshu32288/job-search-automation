/**
 * Cache utility – lightweight file-based caching with TTL.
 * Uses node-cache for in-memory caching during a single run,
 * and writes/reads JSON files to disk for cross-run persistence.
 */

'use strict';

const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Cache {
  /**
   * @param {object} cfg  cache section from config.json
   * @param {object} logger winston logger instance
   */
  constructor(cfg = {}, logger = console) {
    this.enabled = cfg.enabled !== false;
    this.ttl = cfg.ttlSeconds || 3600;
    this.dir = cfg.directory || 'cache';
    this.logger = logger;
    this._mem = new NodeCache({ stdTTL: this.ttl, checkperiod: 120 });

    if (this.enabled) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  /** Create a safe filename key from an arbitrary string. */
  _fileKey(key) {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.dir, `${hash}.json`);
  }

  /**
   * Retrieve a cached value.
   * Checks in-memory first, then falls back to disk.
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    if (!this.enabled) return null;

    const memVal = this._mem.get(key);
    if (memVal !== undefined) {
      this.logger.debug && this.logger.debug(`Cache HIT (mem): ${key}`);
      return memVal;
    }

    const file = this._fileKey(key);
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        const { data, expiry } = JSON.parse(raw);
        if (Date.now() < expiry) {
          this._mem.set(key, data, Math.floor((expiry - Date.now()) / 1000));
          this.logger.debug && this.logger.debug(`Cache HIT (disk): ${key}`);
          return data;
        }
        fs.unlinkSync(file);
      } catch (_) {
        // corrupt cache file – ignore
      }
    }

    return null;
  }

  /**
   * Store a value in memory and on disk.
   * @param {string} key
   * @param {any}    value
   */
  set(key, value) {
    if (!this.enabled) return;
    this._mem.set(key, value);
    const file = this._fileKey(key);
    const payload = { data: value, expiry: Date.now() + this.ttl * 1000 };
    fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
    this.logger.debug && this.logger.debug(`Cache SET: ${key}`);
  }

  /** Clear all cached items from memory and disk. */
  clear() {
    this._mem.flushAll();
    if (fs.existsSync(this.dir)) {
      fs.readdirSync(this.dir)
        .filter((f) => f.endsWith('.json'))
        .forEach((f) => fs.unlinkSync(path.join(this.dir, f)));
    }
    this.logger.info && this.logger.info('Cache cleared');
  }
}

module.exports = Cache;
