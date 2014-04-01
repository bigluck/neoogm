/**
 * neoogm 0.0.3 <https://github.com/bigluck/neoogm>
 * Neo4j OGM for Node.js
 *
 * Available under MIT license <https://github.com/bigluck/neoogm/raw/master/LICENSE>
 */
(function() {
  var NeoormError, Q, async, ensureValidModel, globals, models, neoogm, parseCypherId, parseInputId, request, _,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  request = require("request");

  async = require("async");

  _ = require("lodash");

  Q = require("q");

  globals = {
    host: "localhost",
    port: 7474,
    secure: false,
    merge: true,
    node: {
      created_at: false,
      updated_at: false
    },
    relationship: {
      created_at: false,
      updated_at: false
    }
  };

  models = {
    node: {},
    relationship: {},
    options: {
      schema: {},
      strict: true,
      created_at: false,
      updated_at: false
    }
  };

  NeoormError = (function(_super) {
    __extends(_Class, _super);

    function _Class(data) {
      this.name = "Neoorm" + ((data != null ? data.exception : void 0) != null ? data != null ? data.exception : void 0 : '');
      this.message = (data != null ? data.message : void 0) != null ? data.message : data;
      this.original = data;
    }

    return _Class;

  })(Error);

  neoogm = function() {
    return neoogm.cypher(arguments);
  };

  neoogm.config = function(options) {
    globals = _.extend({}, globals, options);
    globals.url = "http" + (globals.secure ? 's' : '') + "://" + (globals.host || 'localhost') + ":" + (globals.port || 7474) + "/db/data/cypher";
    return neoogm;
  };

  neoogm.cypher = function(options, cb) {
    var deferred, _ref, _ref1, _ref2;
    deferred = Q.defer();
    options = _.extend({
      one: false,
      query: "",
      params: {},
      models: []
    }, typeof options === "object" ? options : options instanceof Array ? {
      query: options.join(" ")
    } : {
      query: options
    });
    if (options.query instanceof Array) {
      options.query = options.query.join(" ");
    }
    if (options.one && !options.query.match(/LIMIT\s+([\d+])/)) {
      options.query += " LIMIT 1";
    }
    if (((_ref = options.params) != null ? _ref._id : void 0) != null) {
      options.params._id = parseInputId(options.params._id);
    }
    if (((_ref1 = options.params) != null ? _ref1._start : void 0) != null) {
      options.params._start = parseInputId(options.params._start);
    }
    if (((_ref2 = options.params) != null ? _ref2._end : void 0) != null) {
      options.params._end = parseInputId(options.params._end);
    }
    request({
      url: globals.url,
      method: "POST",
      headers: {
        "Accept": "application/json; charset=UTF-8",
        "Content-Type": "application/json",
        "X-Stream": "true"
      },
      json: {
        query: options.query,
        params: options.params
      }
    }, function(err, res, body) {
      var data, i, model_remaps, name, output_columns, _i, _len, _ref3;
      if (res && (res != null ? res.statusCode : void 0) !== 200) {
        err = body;
      }
      if (err) {
        err = new NeoormError(err);
        if (typeof cb === "function") {
          cb(err);
        }
        return deferred.reject(err);
      }
      output_columns = [];
      model_remaps = [];
      _ref3 = options.models;
      for (i = _i = 0, _len = _ref3.length; _i < _len; i = ++_i) {
        name = _ref3[i];
        output_columns.push(body.columns[i]);
        if ((name != null ? name[0] : void 0) === "=") {
          model_remaps.push({
            item: body.columns[i],
            labels: name.slice(1)
          });
        } else if (name === false) {
          output_columns.pop();
          model_remaps.push({
            item: body.columns[i],
            remove: true
          });
        }
      }
      data = _.map(body.data, function(row, row_i) {
        var klass, model, rows, rule, _j, _k, _len1, _len2, _ref4;
        rows = _.transform(row, function(out, row, col_i) {
          var entity, klass, _ref4;
          entity = (row != null ? row.type : void 0) != null ? "relationship" : (row != null ? row.data : void 0) != null ? "node" : false;
          row = (function() {
            switch (entity) {
              case "relationship":
                return _.extend({}, row.data, {
                  _id: parseCypherId(row.self),
                  _start: parseCypherId(row.start),
                  _end: parseCypherId(row.end),
                  _type: row.type
                });
              case "node":
                return _.extend({}, row.data, {
                  _id: parseCypherId(row.self)
                });
              default:
                return row;
            }
          })();
          return out[body.columns[col_i]] = entity && (klass = models[entity][(_ref4 = options.models) != null ? _ref4[col_i] : void 0]) ? new klass(row) : row;
        });
        for (_j = 0, _len1 = model_remaps.length; _j < _len1; _j++) {
          rule = model_remaps[_j];
          if (rule.labels) {
            _ref4 = rows[rule.labels];
            for (_k = 0, _len2 = _ref4.length; _k < _len2; _k++) {
              model = _ref4[_k];
              if (klass = models.node[model] || (klass = models.relationship[model])) {
                rows[rule.item] = new klass(rows[rule.item]);
                break;
              }
            }
          } else if (rule.remove === true) {
            delete rows[rule.item];
          }
        }
        if (output_columns.length && output_columns.length > 1) {
          return rows;
        } else {
          return rows[output_columns[0]];
        }
      });
      data = options.one ? data[0] : data;
      if (typeof cb === "function") {
        cb(null, data);
      }
      return deferred.resolve(data);
    });
    return deferred.promise;
  };

  neoogm.findNodeById = function(id, cb) {
    return neoogm.cypher({
      one: true,
      query: ["START node = node({id})", "RETURN node, LABELS(node) AS node_labels"],
      params: {
        id: id
      },
      models: ["=node_labels", false]
    }, cb);
  };

  neoogm.findRelationshipById = function(id, cb) {
    return neoogm.cypher({
      one: true,
      query: ["START relationship = relationship({id})", "RETURN relationship, [TYPE(relationship)] AS relationship_type"],
      params: {
        id: id
      },
      models: ["=relationship_type", false]
    }, cb);
  };

  neoogm.node = function(node_label, node_options) {
    var key, _i, _len, _ref;
    if (node_options == null) {
      node_options = false;
    }
    node_label = node_label.trim();
    if (!models.node[node_label] && !node_options) {
      throw new Error("Node model \"" + node_label + "\" not defined");
    }
    if (!node_options) {
      return models.node[node_label];
    }
    if (models.node[node_label]) {
      throw new Error("Node model \"" + node_label + "\" already defined");
    }
    node_options = _.extend(models.options, globals.node, node_options);
    _ref = ["created_at", "updated_at"];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      key = _ref[_i];
      if (!node_options[key]) {
        continue;
      }
      node_options[key] = node_options[key] === true ? key : node_options[key];
      node_options.schema[node_options[key]] = Date.now;
    }
    return models.node[node_label] = (function() {
      function _Class(data) {
        var name, value;
        if (data == null) {
          data = {};
        }
        for (name in data) {
          value = data[name];
          this[name] = value;
        }
      }

      _Class.prototype.save = function(cb) {
        var data, deferred, self;
        deferred = Q.defer();
        data = _.extend({}, this.toJSON());
        if (node_options.updated_at) {
          data[node_options.updated_at] = Date.now();
        }
        if (node_options.created_at && (this._id == null)) {
          data[node_options.created_at] = Date.now();
        }
        self = this;
        neoogm.cypher({
          one: true,
          query: this._id ? "START n = node({id}) WHERE n:" + node_label + " SET n = {data} RETURN n" : "CREATE (n:" + node_label + " {data}) RETURN n",
          params: {
            id: this._id,
            data: data
          },
          models: [node_label]
        }, function(err, item) {
          var value;
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          for (key in item) {
            value = item[key];
            self[key] = value;
          }
          if (typeof cb === "function") {
            cb(null, self);
          }
          return deferred.resolve(self);
        });
        return deferred.promise;
      };

      _Class.prototype.remove = function(cb) {
        var deferred, err, self;
        deferred = Q.defer();
        if (!this._id) {
          err = new NeoormError("Node could not be deleted without a valid id");
          if (typeof cb === "function") {
            cb(err);
          }
          return deferred.reject(err);
        }
        self = this;
        neoogm.cypher({
          query: ["START n = node({id})", "WHERE n:" + node_label, "DELETE n"],
          params: {
            id: this._id
          }
        }, function(err, item) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          delete self._id;
          if (typeof cb === "function") {
            cb(null, self);
          }
          return deferred.resolve(self);
        });
        return deferred.promise;
      };

      _Class.prototype.findOutgoing = function(options, cb) {
        var _ref1;
        if (typeof options === "string") {
          _ref1 = [
            {
              type: options
            }, cb
          ], options = _ref1[0], cb = _ref1[1];
        }
        return this.findRelates(_.extend({}, options, {
          type: options.type,
          outgoing: true
        }), cb);
      };

      _Class.prototype.findIncoming = function(options, cb) {
        var _ref1;
        if (typeof options === "string") {
          _ref1 = [
            {
              type: options
            }, cb
          ], options = _ref1[0], cb = _ref1[1];
        }
        return this.findRelates(_.extend({}, options, {
          type: options.type,
          incoming: true
        }), cb);
      };

      _Class.prototype.findRelates = function(options, cb) {
        var _ref1;
        if (typeof options === "string") {
          _ref1 = [
            {
              type: options
            }, cb
          ], options = _ref1[0], cb = _ref1[1];
        }
        if (!options.type) {
          throw new NeoormError("Relationship type not defined");
        }
        return (neoogm.relationship(options.type)).findRelates(_.extend({}, options, {
          model: this
        }), cb);
      };

      _Class.prototype.getId = function() {
        return this._id;
      };

      _Class.prototype.getLabel = function() {
        return node_label;
      };

      _Class.prototype.toJSON = function() {
        return ensureValidModel(this, node_options);
      };

      _Class.create = function(data, cb) {
        var deferred, _ref1;
        if (typeof data === "function") {
          _ref1 = [{}, data], data = _ref1[0], cb = _ref1[1];
        }
        deferred = Q.defer();
        neoogm.cypher({
          query: ["CREATE (n:" + node_label + " {data})", "RETURN n"],
          params: {
            data: data
          },
          models: [node_label]
        }, function(err, items) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          if (typeof cb === "function") {
            cb(err, items);
          }
          return deferred.resolve(items);
        });
        return deferred.promise;
      };

      _Class.update = function(options, cb) {
        var deferred, query_update, value, _ref1;
        deferred = Q.defer();
        options = _.extend({
          query: null,
          params: {},
          data: {}
        }, options);
        if (options.query instanceof Array) {
          options.query = options.query.join(" ");
        } else if (typeof options.query === "object") {
          _ref1 = options.query;
          for (key in _ref1) {
            value = _ref1[key];
            options.params[key] = value;
          }
          options.query = ((function() {
            var _ref2, _results;
            _ref2 = options.query;
            _results = [];
            for (key in _ref2) {
              value = _ref2[key];
              _results.push(" n." + key + " = {" + key + "} ");
            }
            return _results;
          })()).join(" AND ");
        }
        query_update = ((function() {
          var _ref2, _results;
          _ref2 = options.data;
          _results = [];
          for (key in _ref2) {
            value = _ref2[key];
            _results.push(" n." + key + " = {" + key + "} ");
          }
          return _results;
        })()).join(", ");
        neoogm.cypher({
          query: ["MATCH (n:" + node_label + ")", options.query ? "WHERE " + options.query : "", "SET " + query_update, "RETURN n"],
          params: options.params,
          models: [node_label]
        }, function(err, items) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          if (typeof cb === "function") {
            cb(err, items);
          }
          return deferred.resolve(items);
        });
        return deferred.promise;
      };

      _Class["delete"] = function(options, cb) {
        var deferred, self;
        deferred = Q.defer();
        self = this;
        async.waterfall([
          function(cb) {
            return self.find(options, cb);
          }, function(items, cb) {
            var id, query_where;
            if (!items.length) {
              return cb(null, items);
            }
            query_where = ((function() {
              var _j, _len1, _ref1, _results;
              _ref1 = _.pluck(items, "_id");
              _results = [];
              for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
                id = _ref1[_j];
                _results.push("ID(n) = " + id);
              }
              return _results;
            })()).join(" OR ");
            return neoogm.cypher("START n=node(*) WHERE n:User AND (" + query_where + ") DELETE n", function(err) {
              return cb(err, items);
            });
          }
        ], function(err, items) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          if (typeof cb === "function") {
            cb(err, items);
          }
          return deferred.resolve(items);
        });
        return deferred.promise;
      };

      _Class.findById = function(id, cb) {
        var deferred, err, _ref1;
        if (typeof id === "function") {
          _ref1 = [null, id], id = _ref1[0], cb = _ref1[1];
        }
        deferred = Q.defer();
        if (id == null) {
          err = new NeoormError("Node id not defined");
          if (typeof cb === "function") {
            cb(err);
          }
          return deferred.reject(err);
        }
        neoogm.cypher({
          query: ["START n = node({id})", "WHERE n:" + node_label, "RETURN n"],
          params: {
            id: id
          },
          models: [node_label],
          one: true
        }, function(err, items) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          if (typeof cb === "function") {
            cb(err, items);
          }
          return deferred.resolve(items);
        });
        return deferred.promise;
      };

      _Class.findByIdAndRemove = function(id, cb) {
        var deferred, err, self, _ref1;
        if (typeof id === "function") {
          _ref1 = [null, id], id = _ref1[0], cb = _ref1[1];
        }
        deferred = Q.defer();
        if (id == null) {
          err = new NeoormError("Node id not defined");
          if (typeof cb === "function") {
            cb(err);
          }
          return deferred.reject(err);
        }
        self = this;
        async.waterfall([
          function(cb) {
            return self.findById(id, cb);
          }, function(item, cb) {
            return item.remove(cb);
          }
        ], function(err, items) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          if (typeof cb === "function") {
            cb(err, items);
          }
          return deferred.resolve(items);
        });
        return deferred.promise;
      };

      _Class.findByIdAndUpdate = function(id, data, cb) {
        var deferred, query_update, value, _ref1;
        if (typeof data === "function") {
          _ref1 = [{}, id], data = _ref1[0], cb = _ref1[1];
        }
        deferred = Q.defer();
        data = _.extend({}, data);
        if (node_options.updated_at) {
          data[node_options.updated_at] = Date.now();
        }
        query_update = ((function() {
          var _results;
          _results = [];
          for (key in data) {
            value = data[key];
            _results.push(" n." + key + " = {" + key + "} ");
          }
          return _results;
        })()).join(", ");
        neoogm.cypher({
          query: ["START n = node({id})", "WHERE n:" + node_label, "SET " + query_update, "RETURN n"],
          params: _.extend(data, {
            id: id
          }),
          models: [node_label],
          one: true
        }, function(err, items) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          if (typeof cb === "function") {
            cb(err, items);
          }
          return deferred.resolve(items);
        });
        return deferred.promise;
      };

      _Class.find = function(options, cb) {
        var deferred, value, _ref1, _ref2;
        if (typeof options === "function") {
          _ref1 = [{}, options], options = _ref1[0], cb = _ref1[1];
        }
        deferred = Q.defer();
        options = _.extend({
          query: null,
          params: {}
        }, options);
        if (options.query instanceof Array) {
          options.query = options.query.join(" ");
        } else if (typeof options.query === "object") {
          _ref2 = options.query;
          for (key in _ref2) {
            value = _ref2[key];
            options.params[key] = value;
          }
          options.query = ((function() {
            var _ref3, _results;
            _ref3 = options.query;
            _results = [];
            for (key in _ref3) {
              value = _ref3[key];
              _results.push(" n." + key + " = {" + key + "} ");
            }
            return _results;
          })()).join(" AND ");
        }
        neoogm.cypher({
          query: ["MATCH (n:" + node_label + ")", "WHERE " + options.query, "RETURN n"],
          params: options.params,
          models: [node_label]
        }, function(err, items) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          if (typeof cb === "function") {
            cb(err, items);
          }
          return deferred.resolve(items);
        });
        return deferred.promise;
      };

      return _Class;

    })();
  };

  neoogm.relationship = function(relationship_type, relationship_options) {
    var key, _i, _len, _ref;
    if (relationship_options == null) {
      relationship_options = false;
    }
    relationship_type = relationship_type.trim();
    if (!models.relationship[relationship_type] && !relationship_options) {
      throw new Error("Relationship model \"" + relationship_type + "\" not defined");
    }
    if (!relationship_options) {
      return models.relationship[relationship_type];
    }
    if (models.relationship[relationship_type]) {
      throw new Error("Relationship model \"" + relationship_type + "\" already defined");
    }
    relationship_options = _.extend(models.options, globals.relationship, relationship_options);
    _ref = ["created_at", "updated_at"];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      key = _ref[_i];
      if (!relationship_options[key]) {
        continue;
      }
      relationship_options[key] = relationship_options[key] === true ? key : relationship_options[key];
      relationship_options.schema[relationship_options[key]] = Date.now;
    }
    return models.relationship[relationship_type] = (function() {
      function _Class(data) {
        var name, value;
        if (data == null) {
          data = {};
        }
        for (name in data) {
          value = data[name];
          this[name] = value;
        }
      }

      _Class.prototype.save = function(cb) {
        var data, deferred, err, self;
        deferred = Q.defer();
        data = _.extend({}, this.toJSON());
        if (relationship_options.updated_at) {
          data[relationship_options.updated_at] = Date.now();
        }
        if (relationship_options.created_at && (this._id == null)) {
          data[relationship_options.created_at] = Date.now();
        }
        if (this._start == null) {
          err = new NeoormError("Start node not defined");
          if (typeof cb === "function") {
            cb(err);
          }
          return deferred.reject(err);
        }
        if (this._end == null) {
          err = new NeoormError("End node not defined");
          if (typeof cb === "function") {
            cb(err);
          }
          return deferred.reject(err);
        }
        self = this;
        async.waterfall([
          function(cb) {
            return cb(null, self._id ? self : void 0);
          }, function(item, cb) {
            if (item) {
              return cb(null, item);
            }
            return neoogm.cypher({
              one: true,
              query: ["START start = node({start}), end = node({end})", "MATCH (start) -[relationship:" + relationship_type + "]-> (end)", "RETURN relationship"],
              params: {
                start: self._start,
                end: self._end
              },
              models: [relationship_type]
            }, function() {
              return typeof cb === "function" ? cb.apply(null, arguments) : void 0;
            });
          }, function(item, cb) {
            if (!(item != null ? item._id : void 0)) {
              return cb(null, item);
            }
            if (relationship_options.created_at) {
              data[relationship_options.created_at] = item[relationship_options.created_at];
            }
            return neoogm.cypher({
              one: true,
              query: ["START relationship = relationship({id})", "WHERE TYPE(relationship) = {type}", "SET relationship = {data}", "RETURN relationship"],
              params: {
                id: item._id,
                type: relationship_type,
                data: data
              },
              models: [relationship_type]
            }, function() {
              return typeof cb === "function" ? cb.apply(null, arguments) : void 0;
            });
          }, function(item, cb) {
            if (item != null ? item._id : void 0) {
              return cb(null, item);
            }
            return neoogm.cypher({
              one: true,
              query: ["START start = node({start}), end = node({end})", "CREATE (start) -[relationship:" + relationship_type + " {data}]-> (end)", "RETURN relationship"],
              params: {
                start: self._start,
                end: self._end,
                data: data
              },
              models: [relationship_type]
            }, function() {
              return typeof cb === "function" ? cb.apply(null, arguments) : void 0;
            });
          }
        ], function(err, item) {
          var value;
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          for (key in item) {
            value = item[key];
            self[key] = value;
          }
          if (typeof cb === "function") {
            cb(null, self);
          }
          return deferred.resolve(self);
        });
        return deferred.promise;
      };

      _Class.prototype.remove = function(cb) {
        var deferred, err, self;
        deferred = Q.defer();
        if (!this._id) {
          err = new NeoormError("Relationship could not be deleted without a valid id");
          if (typeof cb === "function") {
            cb(err);
          }
          return deferred.reject(err);
        }
        self = this;
        neoogm.cypher({
          query: ["START relationship = relationship({id})", "WHERE TYPE(relationship) = {type}", "DELETE relationship"],
          params: {
            id: this._id,
            type: relationship_type
          }
        }, function(err, item) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          delete self._id;
          delete self._start;
          delete self._end;
          if (typeof cb === "function") {
            cb(null, self);
          }
          return deferred.resolve(results);
        });
        return deferred.promise;
      };

      _Class.prototype.getId = function() {
        return this._id;
      };

      _Class.prototype.getType = function() {
        return relationship_type;
      };

      _Class.prototype.getStart = function(cb) {
        var deferred, self;
        deferred = Q.defer();
        self = this;
        async.waterfall([
          function(cb) {
            var _ref1;
            if (((_ref1 = self._start) != null ? _ref1._id : void 0) != null) {
              return cb(null, self._start);
            }
            return neoogm.findNodeById(self._start, cb);
          }
        ], function(err, item) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          self._start = item;
          if (typeof cb === "function") {
            cb(null, item);
          }
          return deferred.resolve(item);
        });
        return deferred.promise;
      };

      _Class.prototype.getEnd = function(cb) {
        var deferred, self;
        deferred = Q.defer();
        self = this;
        async.waterfall([
          function(cb) {
            var _ref1;
            if (((_ref1 = self._end) != null ? _ref1._id : void 0) != null) {
              return cb(null, self._end);
            }
            return neoogm.findNodeById(self._end, cb);
          }
        ], function(err, item) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          self._end = item;
          if (typeof cb === "function") {
            cb(null, item);
          }
          return deferred.resolve(item);
        });
        return deferred.promise;
      };

      _Class.prototype.toJSON = function() {
        return ensureValidModel(this, relationship_options);
      };

      _Class.findOutgoing = function(options, cb) {
        var _ref1;
        if (typeof options === "function") {
          _ref1 = [{}, options], options = _ref1[0], cb = _ref1[1];
        }
        return this.findRelates(_.extend({}, options, {
          outgoing: true
        }), cb);
      };

      _Class.findIncoming = function(options, cb) {
        var _ref1;
        if (typeof options === "function") {
          _ref1 = [{}, options], options = _ref1[0], cb = _ref1[1];
        }
        return this.findRelates(_.extend({}, options, {
          incoming: true
        }), cb);
      };

      _Class.findRelates = function(options, cb) {
        var deferred, err, model_label, value, _ref1, _ref2, _ref3, _ref4;
        if (typeof options === "function") {
          _ref1 = [{}, options], options = _ref1[0], cb = _ref1[1];
        }
        deferred = Q.defer();
        options = _.extend({
          model: null,
          outgoing: false,
          incoming: false,
          query: null,
          params: {}
        }, options);
        if (!(model_label = (_ref2 = options.model) != null ? typeof _ref2.getLabel === "function" ? _ref2.getLabel() : void 0 : void 0)) {
          err = new NeoormError("options.model have to be an Neoorm model");
          if (typeof cb === "function") {
            cb(err);
          }
          return deferred.reject(err);
        }
        if (((_ref3 = options.model) != null ? typeof _ref3.getId === "function" ? _ref3.getId() : void 0 : void 0) == null) {
          err = new NeoormError("options.model is not an database reference");
          if (typeof cb === "function") {
            cb(err);
          }
          return deferred.reject(err);
        }
        if (options.query instanceof Array) {
          options.query = options.query.join(" ");
        } else if (typeof options.query === "object") {
          _ref4 = options.query;
          for (key in _ref4) {
            value = _ref4[key];
            options.params[key] = value;
          }
          options.query = ((function() {
            var _ref5, _results;
            _ref5 = options.query;
            _results = [];
            for (key in _ref5) {
              value = _ref5[key];
              _results.push(" n." + key + " = {" + key + "} ");
            }
            return _results;
          })()).join(" AND ");
        }
        neoogm.cypher({
          query: ["START target = node({id})", "MATCH ", "(target:" + model_label + ") " + (options.incoming && !options.outgoing ? '<' : '') + "-", " [relationship:" + relationship_type + "] ", "-" + (options.outgoing && !options.incoming ? '>' : '') + " (end)", options.query ? "WHERE " + options.query : "", "RETURN relationship, end, LABELS(end) AS end_labels"],
          params: {
            id: options.model.getId()
          },
          models: [relationship_type, "=end_labels", false]
        }, function(err, results) {
          if (err) {
            if (typeof cb === "function") {
              cb(err);
            }
            return deferred.reject(err);
          }
          results = _.map(results, function(row, row_i) {
            row.start = options.model;
            return row;
          });
          if (typeof cb === "function") {
            cb(err, results);
          }
          return deferred.resolve(results);
        });
        return deferred.promise;
      };

      return _Class;

    })();
  };

  parseCypherId = function(path) {
    return parseInt((path.match(/([\d]+)$/))[1]);
  };

  parseInputId = function(data) {
    if ((data != null ? data._id : void 0) != null) {
      return parseInt(data._id);
    } else {
      return data;
    }
  };

  ensureValidModel = function(model, options) {
    var key, keys, value;
    keys = _.union((function() {
      var _results;
      _results = [];
      for (key in options.schema) {
        _results.push(key);
      }
      return _results;
    })(), (function() {
      var _results;
      _results = [];
      for (key in model) {
        value = model[key];
        if (model.hasOwnProperty(key)) {
          _results.push(key);
        }
      }
      return _results;
    })());
    return _.transform(keys, function(out, key) {
      var _ref;
      if ((model[key] != null) && key !== "_id" && (options.strict === false || (options.strict === true && ((_ref = options.schema) != null ? _ref[key] : void 0)))) {
        return out[key] = model[key];
      }
    });
  };

  module.exports = neoogm;

}).call(this);
