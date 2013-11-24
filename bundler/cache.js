var crypto = require('crypto'),
    util = require('util');

require('longjohn')

var level = require('level'),
    sublevel = require('level-sublevel'),
    levelbutt = require('level-scuttlebutt'),
    ExpiryModel = require('expiry-model'),
    Model = require('scuttlebutt/model'),
    Bucket = require('scuttlebucket'),
    //cull = require('./npm-cull'),
    udid = require('udid'),
    log = require('minilog')('leveldb');

var Store = function (location) {
  var self = this;
  this.db = sublevel(level(location));
  this.scuttles = this.db.sublevel('scuttlebutt');
  this.models = {};
  levelbutt(this.scuttles, udid('browserify-cdn'), function (name) {
    return self.models[name]();
  });
};

Store.prototype.register = function (name, factory) {
  this.models[name] = factory;
};

Store.prototype.open = function (name, cb) {
  this.scuttles.open.call(this.scuttles, name, cb);
};

var Cache = function (opts) {
  ExpiryModel.call(this);
}
util.inherits(Cache, ExpiryModel);
Cache.prototype.hashfxn = defaultHashFxn;

Cache.prototype.check = function (key, generate, cb) {
  var self = this,
      hash = this.hashfxn(key),
      name = this.get('name');

  log('cache: checking `' + name + '` for hash `' + hash + '`...');

  try {
    var result = this.get('hash/' + hash);
  }
  catch (err) {
    return process.nextTick(function () { cb(err); });
  }

  if (result) {
    cb(err, JSON.parse(res));
  }
  else {
    log('cache: `' + name + '` did not have `' + hash + '`.');
    generate(function (err, _res) {
      if (err) return cb(err);

      log('cache: saving hash `' + hash + '` in `' + name + '` with ttl ' + self.ttl +'...');

      self.set(hash, JSON.stringify(_res));

      log('saved hash `' + hash + '` in `' + name + '`.');
      cb(err, _res);
    });
  }
};

function makeCache(name, opts) {
  var SubCache = function () {
    Cache.call(this, opts);
    this.set('name', name);
  }
  util.inherits(SubCache, Cache);
  return new SubCache();
}

var SECONDS = 1000,
    MINUTES = 60 * SECONDS,
    HOURS = 60 * MINUTES,
    DAYS = 24 * HOURS,
    WEEKS = 7 * DAYS;

module.exports = function (location) {

  var store = new Store(location);

  store.register('bundles', function () {
    return makeCache('bundles', { maxAge: 4 * WEEKS });
  });

  store.register('builds', function () {
    var builds = makeCache('builds', { maxAge: 4 * WEEKS });
    builds.hashfxn = function (o) { return o.module; };
    return builds;
  });

  store.register('multibundles', function () {
    var multis = makeCache('multibundles', { maxAge: 1 * WEEKS });
    multis._hashfxn = multis.hashfxn;
    multis.hashfxn = function (o) {
      if (typeof o === 'string' && o.length === 24) {
        log('cache: Input for `multibundles` appears to be an md5 hash already');
        return o;
      }
      return multis._hashfxn;
    };
    return multis;
  });

  store.register('aliases', function () {
    var aliases = makeCache('aliases', {
      maxAge: 1 * DAYS
    });
    aliases.hashfxn = function (o) {
      return o.module + '@' + o.semver;
    };
    return aliases;
  });

  store.defaultHashFxn = defaultHashFxn;

  return store;
};

function defaultHashFxn(o) {
  return crypto
    .createHash('md5')
    .update(JSON.stringify(o))
    .digest('base64')
  ;
}

