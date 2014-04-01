request = require "request"
async = require "async"
_ = require "lodash"
Q = require "q"


#
# Globals
globals =
	host: "localhost"
	port: 7474
	secure: false
	merge: true
	node:
		created_at: false
		updated_at: false
	relationship:
		created_at: false
		updated_at: false
models =
	node: {}
	relationship: {}
	options:
		schema: {}
		strict: true
		created_at: false
		updated_at: false
NeoormError = class extends Error
	constructor: (data) ->
		@name = "Neoorm#{ if data?.exception? then data?.exception else '' }"
		@message = if data?.message? then data.message else data
		@original = data


#
# Public
neoogm = ->
	neoogm.cypher arguments

neoogm.config = (options) ->
	globals = _.extend {}, globals, options
	globals.url = "http#{ if globals.secure then 's' else '' }://#{ globals.host or 'localhost' }:#{ globals.port or 7474 }/db/data/cypher"
	neoogm

neoogm.cypher = (options, cb) ->
	deferred = Q.defer()
	options = _.extend
		one: false
		query: ""
		params: {}
		models: []
	, if typeof options is "object"
		options
	else if options instanceof Array
		query: options.join " "
	else
		query: options

	options.query = options.query.join " " if options.query instanceof Array
	options.query += " LIMIT 1" if options.one and not options.query.match /LIMIT\s+([\d+])/
	options.params._id = parseInputId options.params._id if options.params?._id?
	options.params._start = parseInputId options.params._start if options.params?._start?
	options.params._end = parseInputId options.params._end if options.params?._end?

	request
		url: globals.url
		method: "POST"
		headers:
			"Accept": "application/json; charset=UTF-8"
			"Content-Type": "application/json"
			"X-Stream": "true"
		json:
			query: options.query
			params: options.params
	, (err, res, body) ->
		err = body if res and res?.statusCode isnt 200
		if err
			err = new NeoormError err
			cb? err
			return deferred.reject err

		output_columns = []
		model_remaps = []
		for name, i in options.models
			output_columns.push body.columns[i]
			if name?[0] is "="
				model_remaps.push
					item: body.columns[i]
					labels: name[1..]
			else if name is false
				output_columns.pop()
				model_remaps.push
					item: body.columns[i]
					remove: true

		data = _.map body.data, (row, row_i) ->
			# Convert array elements to objects
			rows = _.transform row, (out, row, col_i) ->
				entity = if row?.type? then "relationship" else if row?.data? then "node" else false
				row = switch entity
					when "relationship"
						_.extend {}, row.data,
							_id:  parseCypherId row.self
							_start: parseCypherId row.start
							_end: parseCypherId row.end
							_type: row.type
					when "node"
						_.extend {}, row.data,
							_id:  parseCypherId row.self
					else
						row

				out[body.columns[col_i]] = if entity and klass = models[entity][options.models?[col_i]]
					new klass row
				else
					row

			# Remap objects
			for rule in model_remaps
				if rule.labels
					for model in rows[rule.labels]
						if klass = models.node[model] or klass = models.relationship[model]
							rows[rule.item] = new klass rows[rule.item]
							break
				else if rule.remove is true
					delete rows[rule.item]

			# Only one item
			if output_columns.length and output_columns.length > 1 then rows else rows[output_columns[0]]

		data = if options.one then data[0] else data

		cb? null, data
		deferred.resolve data
	deferred.promise

neoogm.findNodeById = (id, cb) ->
	neoogm.cypher
		one: true
		query: [
			"START node = node({id})"
			"RETURN node, LABELS(node) AS node_labels"
		]
		params:
			id: id
		models: [ "=node_labels", false ]
	, cb
neoogm.findRelationshipById = (id, cb) ->
	neoogm.cypher
		one: true
		query: [
			"START relationship = relationship({id})"
			"RETURN relationship, [TYPE(relationship)] AS relationship_type"
		]
		params:
			id: id
		models: [ "=relationship_type", false ]
	, cb

neoogm.node = (node_label, node_options=false) ->
	node_label = node_label.trim()
	return throw new Error "Node model \"#{ node_label }\" not defined" if not models.node[node_label] and not node_options
	return models.node[node_label] unless node_options
	return throw new Error "Node model \"#{ node_label }\" already defined" if models.node[node_label]

	node_options = _.extend models.options, globals.node, node_options
	for key in ["created_at", "updated_at"] when node_options[key]
		node_options[key] = if node_options[key] is true then key else node_options[key]
		node_options.schema[node_options[key]] = Date.now

	models.node[node_label] = class
		constructor: (data={}) ->
			@[name] = value for name, value of data
		save: (cb) ->
			deferred = Q.defer()
			data = _.extend {}, @toJSON()
			data[node_options.updated_at] = Date.now() if node_options.updated_at
			data[node_options.created_at] = Date.now() if node_options.created_at and not @_id?

			self = @
			neoogm.cypher
				one: true
				query: if @_id
					"START n = node({id}) WHERE n:#{ node_label } SET n = {data} RETURN n"
				else
					"CREATE (n:#{ node_label } {data}) RETURN n"
				params:
					id: @_id
					data: data
				models: [ node_label ]
			, (err, item) ->
				if err
					cb? err
					return deferred.reject err
				self[key] = value for key, value of item
				cb? null, self
				deferred.resolve self
			deferred.promise
		remove: (cb) ->
			deferred = Q.defer()
			unless @_id
				err = new NeoormError "Node could not be deleted without a valid id"
				cb? err
				return deferred.reject err

			self = @
			neoogm.cypher
				query: [
					"START n = node({id})"
					"WHERE n:#{ node_label }"
					"DELETE n"
				]
				params:
					id: @_id
			, (err, item) ->
				if err
					cb? err
					return deferred.reject err
				delete self._id
				cb? null, self
				deferred.resolve self
			deferred.promise
		# createOutgoing: (type, data, cb) ->
		# createIncoming: (type, data, cb) ->
		findOutgoing: (options, cb) ->
			[options, cb] = [type: options, cb] if typeof options is "string"
			@findRelates (_.extend {}, options, type: options.type, outgoing: true), cb
		findIncoming: (options, cb) ->
			[options, cb] = [type: options, cb] if typeof options is "string"
			@findRelates (_.extend {}, options, type: options.type, incoming: true), cb
		findRelates: (options, cb) ->
			[options, cb] = [type: options, cb] if typeof options is "string"
			throw new NeoormError "Relationship type not defined" unless options.type
			(neoogm.relationship options.type).findRelates (_.extend {}, options, model: @), cb
		getId: ->
			@_id
		getLabel: ->
			node_label
		toJSON: ->
			## FIX ME: validate model everywhere
			ensureValidModel @, node_options

		@create: (data, cb) ->
			[data, cb] = [{}, data] if typeof data is "function"
			deferred = Q.defer()

			neoogm.cypher
				query: [
					"CREATE (n:#{ node_label } {data})"
					"RETURN n"
				]
				params:
					data: data
				models: [ node_label ]
			, (err, items) ->
				if err
					cb? err
					return deferred.reject err
				cb? err, items
				deferred.resolve items
			deferred.promise
		@update: (options, cb) ->
			deferred = Q.defer()
			options = _.extend
				query: null
				params: {}
				data: {}
			, options
			if options.query instanceof Array
				options.query = options.query.join " "
			else if typeof options.query is "object"
				options.params[key] = value for key, value of options.query
				options.query = (" n.#{key} = {#{key}} " for key, value of options.query).join " AND "
			query_update = (" n.#{key} = {#{key}} " for key, value of options.data).join ", "

			neoogm.cypher
				query: [
					"MATCH (n:#{ node_label })"
					if options.query then "WHERE #{ options.query }" else ""
					"SET #{ query_update }"
					"RETURN n"
				]
				params: options.params
				models: [ node_label ]
			, (err, items) ->
				if err
					cb? err
					return deferred.reject err
				cb? err, items
				deferred.resolve items
			deferred.promise
		@delete: (options, cb) ->
			deferred = Q.defer()

			self = @
			async.waterfall [
				(cb) ->
					self.find options, cb
				(items, cb) ->
					return cb null, items unless items.length
					query_where = ("ID(n) = #{ id }" for id in _.pluck items, "_id").join " OR "

					neoogm.cypher "START n=node(*) WHERE n:User AND (#{ query_where }) DELETE n", (err) ->
						cb err, items
			], (err, items) ->
				if err
					cb? err
					return deferred.reject err
				cb? err, items
				deferred.resolve items
			deferred.promise

		@findById: (id, cb) ->
			[id, cb] = [null, id] if typeof id is "function"
			deferred = Q.defer()
			unless id?
				err = new NeoormError "Node id not defined"
				cb? err
				return deferred.reject err

			neoogm.cypher
				query: [
					"START n = node({id})"
					"WHERE n:#{ node_label }"
					"RETURN n"
				]
				params:
					id: id
				models: [ node_label ]
				one: true
			, (err, items) ->
				if err
					cb? err
					return deferred.reject err
				cb? err, items
				deferred.resolve items
			deferred.promise
		@findByIdAndRemove: (id, cb) ->
			[id, cb] = [null, id] if typeof id is "function"
			deferred = Q.defer()
			unless id?
				err = new NeoormError "Node id not defined"
				cb? err
				return deferred.reject err

			self = @
			async.waterfall [
				(cb) ->
					self.findById id, cb
				(item, cb) ->
					item.remove cb
			], (err, items) ->
				if err
					cb? err
					return deferred.reject err
				cb? err, items
				deferred.resolve items
			deferred.promise
		@findByIdAndUpdate: (id, data, cb) ->
			[data, cb] = [{}, id] if typeof data is "function"
			deferred = Q.defer()
			data = _.extend {}, data
			data[node_options.updated_at] = Date.now() if node_options.updated_at
			query_update = (" n.#{key} = {#{key}} " for key, value of data).join ", "

			neoogm.cypher
				query: [
					"START n = node({id})"
					"WHERE n:#{ node_label }"
					"SET #{ query_update }"
					"RETURN n"
				]
				params: _.extend data,
					id: id
				models: [ node_label ]
				one: true
			, (err, items) ->
				if err
					cb? err
					return deferred.reject err
				cb? err, items
				deferred.resolve items
			deferred.promise
		@find: (options, cb) ->
			[options, cb] = [{}, options] if typeof options is "function"
			deferred = Q.defer()
			options = _.extend
				query: null
				params: {}
			, options
			if options.query instanceof Array
				options.query = options.query.join " "
			else if typeof options.query is "object"
				options.params[key] = value for key, value of options.query
				options.query = (" n.#{key} = {#{key}} " for key, value of options.query).join " AND "

			neoogm.cypher
				query: [
					"MATCH (n:#{ node_label })"
					"WHERE #{ options.query }"
					"RETURN n"
				]
				params: options.params
				models: [ node_label ]
			, (err, items) ->
				if err
					cb? err
					return deferred.reject err
				cb? err, items
				deferred.resolve items
			deferred.promise

neoogm.relationship = (relationship_type, relationship_options=false) ->
	relationship_type = relationship_type.trim()
	return throw new Error "Relationship model \"#{ relationship_type }\" not defined" if not models.relationship[relationship_type] and not relationship_options
	return models.relationship[relationship_type] unless relationship_options
	return throw new Error "Relationship model \"#{ relationship_type }\" already defined" if models.relationship[relationship_type]

	relationship_options = _.extend models.options, globals.relationship, relationship_options
	for key in ["created_at", "updated_at"] when relationship_options[key]
		relationship_options[key] = if relationship_options[key] is true then key else relationship_options[key]
		relationship_options.schema[relationship_options[key]] = Date.now

	models.relationship[relationship_type] = class
		constructor: (data={}) ->
			@[name] = value for name, value of data
		save: (cb) ->
			deferred = Q.defer()
			data = _.extend {}, @toJSON()
			data[relationship_options.updated_at] = Date.now() if relationship_options.updated_at
			data[relationship_options.created_at] = Date.now() if relationship_options.created_at and not @_id?
			unless @_start?
				err = new NeoormError "Start node not defined"
				cb? err
				return deferred.reject err
			unless @_end?
				err = new NeoormError "End node not defined"
				cb? err
				return deferred.reject err

			self = @
			async.waterfall [
				(cb) ->
					cb null, if self._id then self
				(item, cb) ->
					return cb null, item if item
					# Id not found
					neoogm.cypher
						one: true
						query: [
							"START start = node({start}), end = node({end})"
							"MATCH (start) -[relationship:#{ relationship_type }]-> (end)"
							"RETURN relationship"
						]
						params:
							start: self._start
							end: self._end
						models: [ relationship_type ]
					, ->
						cb? arguments...
				(item, cb) ->
					return cb null, item unless item?._id
					# Relationship already exists
					data[relationship_options.created_at] = item[relationship_options.created_at] if relationship_options.created_at
					neoogm.cypher
						one: true
						query: [
							"START relationship = relationship({id})"
							"WHERE TYPE(relationship) = {type}"
							"SET relationship = {data}"
							"RETURN relationship"
						]
						params:
							id: item._id
							type: relationship_type
							data: data
						models: [ relationship_type ]
					, ->
						cb? arguments...
				(item, cb) ->
					return cb null, item if item?._id
					# Relationship not found
					neoogm.cypher
						one: true
						query: [
							"START start = node({start}), end = node({end})"
							"CREATE (start) -[relationship:#{ relationship_type } {data}]-> (end)"
							"RETURN relationship"
						]
						params: 
							start: self._start
							end: self._end
							data: data
						models: [ relationship_type ]
					, ->
						cb? arguments...
			], (err, item) ->
				if err
					cb? err
					return deferred.reject err
				self[key] = value for key, value of item
				cb? null, self
				deferred.resolve self
			deferred.promise
		remove: (cb) ->
			deferred = Q.defer()
			unless @_id
				err = new NeoormError "Relationship could not be deleted without a valid id"
				cb? err
				return deferred.reject err

			self = @
			neoogm.cypher
				query: [
					"START relationship = relationship({id})"
					"WHERE TYPE(relationship) = {type}"
					"DELETE relationship"
				]
				params:
					id: @_id
					type: relationship_type
			, (err, item) ->
				if err
					cb? err
					return deferred.reject err
				delete self._id
				delete self._start
				delete self._end
				cb? null, self
				deferred.resolve results
			deferred.promise
		getId: ->
			@_id
		getType: ->
			relationship_type
		getStart: (cb) ->
			deferred = Q.defer()
			self = @
			async.waterfall [
				(cb) ->
					return cb null, self._start if self._start?._id?
					neoogm.findNodeById self._start, cb
			], (err, item) ->
				if err
					cb? err
					return deferred.reject err
				self._start = item
				cb? null, item
				deferred.resolve item
			deferred.promise
		getEnd: (cb) ->
			deferred = Q.defer()
			self = @
			async.waterfall [
				(cb) ->
					return cb null, self._end if self._end?._id?
					neoogm.findNodeById self._end, cb
			], (err, item) ->
				if err
					cb? err
					return deferred.reject err
				self._end = item
				cb? null, item
				deferred.resolve item
			deferred.promise
		toJSON: ->
			ensureValidModel @, relationship_options

		@findOutgoing: (options, cb) ->
			[options, cb] = [{}, options] if typeof options is "function"
			@findRelates (_.extend {}, options, outgoing: true), cb
		@findIncoming: (options, cb) ->
			[options, cb] = [{}, options] if typeof options is "function"
			@findRelates (_.extend {}, options, incoming: true), cb
		@findRelates: (options, cb) ->
			[options, cb] = [{}, options] if typeof options is "function"
			deferred = Q.defer()
			options = _.extend
				model: null
				outgoing: false
				incoming: false
				query: null
				params: {}
			, options
			unless model_label = options.model?.getLabel?()
				err = new NeoormError "options.model have to be an Neoorm model" 
				cb? err
				return deferred.reject err
			unless options.model?.getId?()?
				err = new NeoormError "options.model is not an database reference"
				cb? err
				return deferred.reject err
			if options.query instanceof Array
				options.query = options.query.join " "
			else if typeof options.query is "object"
				options.params[key] = value for key, value of options.query
				options.query = (" n.#{key} = {#{key}} " for key, value of options.query).join " AND "

			neoogm.cypher
				query: [
					"START target = node({id})"
					"MATCH "
						"(target:#{ model_label }) #{ if options.incoming and not options.outgoing then '<' else '' }-"
						" [relationship:#{ relationship_type }] "
						"-#{ if options.outgoing and not options.incoming then '>' else '' } (end)"
					if options.query then "WHERE #{ options.query }" else ""
					"RETURN relationship, end, LABELS(end) AS end_labels"
				]
				params:
					id: options.model.getId()
				models: [ relationship_type, "=end_labels", false ]
			, (err, results) ->
				if err
					cb? err 
					return deferred.reject err
				results = _.map results, (row, row_i) ->
					row.start = options.model
					row
				cb? err, results
				deferred.resolve results
			deferred.promise
		# @create: () ->
		# @update: () ->
		# @delete: () ->


#
# Helpers
parseCypherId = (path) ->
	parseInt (path.match /([\d]+)$/)[1]
parseInputId = (data) ->
	if data?._id? then parseInt data._id else data
ensureValidModel = (model, options) ->
	keys = _.union (key for key of options.schema), (key for key, value of model when model.hasOwnProperty key)

	_.transform keys, (out, key) ->
		out[key] = model[key] if model[key]? and key isnt "_id" and (options.strict is false or (options.strict is true and options.schema?[key]))


module.exports = neoogm
